/**
 * POST /api/v1/shipments/[id]/rota/otimizar/veiculos — F5 (VRPTW multi-veículo).
 *
 * Delega ao servico Python independente (`services/rota`, Google OR-Tools) a
 * distribuição de entregas por veículo com sequência rodoviária e geometria.
 * O backend carrega a carga com paradas (fonte única), monta o contrato e
 * devolve a distribuição pronta para a tela confirmar.
 *
 * Regras que este handler garante (e que já falharam uma vez):
 * - a BASE vem da carga/body e vai no contrato; a primeira entrega NUNCA vira
 *   depósito (isso apagava uma parada da rota);
 * - o peso/volume de cada parada sai do cadastro do produto — sem dado, o
 *   pedido não recebe zero fingido: o serviço devolve a restrição como não
 *   aplicada;
 * - parada sem coordenada volta em `nao_roteirizaveis`, nunca desaparece;
 * - `sem_solucao` (capacidade/jornada/janela) é 422 com motivo e a lista de
 *   entregas não alocadas — não é 502 de infraestrutura;
 * - sem o serviço no ar → 503 `upstream_unavailable` (fail-closed): a
 *   heurística antiga (NN + 2-opt, veículo único) NÃO responde por este
 *   contrato.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ApiErrorCodes } from "@/lib/api/errors";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  otimizarVRPTW,
  type OtimizacaoVrptw,
  type PontoDoSolver,
  type VeiculoDoSolver,
} from "@/lib/expedicao/roteador-vrptw";
import { geocodificarEndereco } from "@/lib/rotas/geocodificacao";
import { createClient } from "@/lib/supabase/server";

import { carregarCargaComParadas } from "../../_carga";

export const dynamic = "force-dynamic";

const origemSchema = z.union([
  z.object({ endereco: z.string().trim().min(3).max(300) }),
  z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
]);

const corpoSchema = z.object({
  origem: origemSchema.nullable().optional(),
  retornar_origem: z.boolean().optional(),
  tempo_parada_min: z.number().int().min(0).max(600).optional(),
  max_veiculos: z.number().int().min(1).optional(),
  limite_busca_s: z.number().int().min(1).max(60).optional(),
  veiculos: z
    .array(
      z.object({
        veiculo_id: z.string().min(1).max(64),
        motorista_id: z.string().max(64).optional(),
        capacidade_kg: z.number().min(0).optional(),
        capacidade_m3: z.number().min(0).optional(),
        tempo_jornada_min: z.number().int().min(0).max(1440).optional(),
      }),
    )
    .min(1)
    .optional(),
});

interface DemandaDaParada {
  peso_kg: number;
  volume_m3: number;
  semPeso: boolean;
  semVolume: boolean;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "shipments" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const { id } = await params;
  const supabase = await createClient();
  const d = await carregarCargaComParadas(supabase, authz.org.orgId, id);
  if (!d) return fail("not_found", "Carga não encontrada.", 404, { requestId });
  if (d.paradas.length === 0) return fail("validation_failed", "Carga sem pedidos.", 422, { requestId });

  // ── Base (origem): body → carga → sede geocodificada. Sem base não há rota.
  const retornarOrigem = parsed.data.retornar_origem ?? d.carga.retornar_origem;
  const tempoParadaMin = parsed.data.tempo_parada_min ?? d.carga.tempo_parada_min;
  const reqOrigem = parsed.data.origem ?? null;

  let origem: PontoDoSolver | null = null;
  if (reqOrigem && "endereco" in reqOrigem) {
    const g = await geocodificarEndereco(reqOrigem.endereco);
    if (g.estado !== "ok" || g.latitude == null || g.longitude == null) {
      return fail("validation_failed", "Origem não localizada. Ajuste o endereço ou marque no mapa.", 422, { requestId });
    }
    origem = { node_id: "__base__", latitude: g.latitude, longitude: g.longitude };
  } else if (reqOrigem && "latitude" in reqOrigem) {
    origem = { node_id: "__base__", latitude: reqOrigem.latitude, longitude: reqOrigem.longitude };
  } else if (d.carga.origem_lat != null && d.carga.origem_lng != null) {
    origem = { node_id: "__base__", latitude: d.carga.origem_lat, longitude: d.carga.origem_lng };
  } else if ((d.carga.origem_endereco ?? "").trim()) {
    const g = await geocodificarEndereco(d.carga.origem_endereco as string);
    if (g.estado === "ok" && g.latitude != null && g.longitude != null) {
      origem = { node_id: "__base__", latitude: g.latitude, longitude: g.longitude };
    }
  }

  if (!origem) {
    return fail(
      "validation_failed",
      "Roteirização multi-veículo precisa da origem (a base). Informe o endereço ou use sua posição.",
      422,
      { requestId },
    );
  }

  // ── Demanda de cada parada: soma dos itens × peso/volume do cadastro.
  const porShipmentOrder = new Map<string, DemandaDaParada>();
  for (const item of d.itens) {
    let peso = 0;
    let volume = 0;
    let semPeso = false;
    let semVolume = false;
    for (const produto of item.itens ?? []) {
      const qtd = Number(produto.quantidade ?? 0);
      if (produto.peso_unit_kg == null) semPeso = true;
      else peso += qtd * produto.peso_unit_kg;
      if (produto.volume_unit_m3 == null) semVolume = true;
      else volume += qtd * produto.volume_unit_m3;
    }
    porShipmentOrder.set(item.shipment_order_id, {
      peso_kg: Math.round(peso * 1000) / 1000,
      volume_m3: Math.round(volume * 1_000_000) / 1_000_000,
      semPeso,
      semVolume,
    });
  }

  const demandaDaParada = (parada: (typeof d.paradas)[number]): DemandaDaParada => {
    let peso = 0;
    let volume = 0;
    let semPeso = false;
    let semVolume = false;
    for (const pedido of parada.pedidos) {
      const demanda = porShipmentOrder.get(pedido.shipment_order_id);
      if (!demanda) continue;
      peso += demanda.peso_kg;
      volume += demanda.volume_m3;
      semPeso ||= demanda.semPeso;
      semVolume ||= demanda.semVolume;
    }
    return {
      peso_kg: Math.round(peso * 1000) / 1000,
      volume_m3: Math.round(volume * 1_000_000) / 1_000_000,
      semPeso,
      semVolume,
    };
  };

  const comCoord = d.paradas.filter((p) => p.latitude != null && p.longitude != null);
  const naoRoteirizaveis = d.paradas
    .filter((p) => p.latitude == null || p.longitude == null)
    .map((p) => ({ chave: p.chave, cliente: p.cliente, endereco: p.endereco }));
  if (comCoord.length === 0) {
    return fail("validation_failed", "Nenhuma parada geocodificada. Geocodifique antes de otimizar.", 422, { requestId });
  }

  const pontos: PontoDoSolver[] = comCoord.map((p) => {
    const demanda = demandaDaParada(p);
    return {
      node_id: p.chave,
      latitude: p.latitude as number,
      longitude: p.longitude as number,
      peso_kg: demanda.peso_kg,
      volume_m3: demanda.volume_m3,
    };
  });

  const paradasSemPeso = comCoord.filter((p) => demandaDaParada(p).semPeso).length;

  // ── Veículos: body → frota cadastrada → o veículo da própria carga.
  let veiculos: VeiculoDoSolver[] = (parsed.data.veiculos ?? []).map((v) => ({
    veiculo_id: v.veiculo_id,
    motorista_id: v.motorista_id,
    capacidade_kg: v.capacidade_kg,
    capacidade_m3: v.capacidade_m3,
    tempo_jornada_min: v.tempo_jornada_min,
  }));

  if (veiculos.length === 0) {
    const { data: frota } = await supabase
      .from("fleet_vehicles")
      .select("id, placa, capacidade_kg, capacidade_m3, veiculo_tipo")
      .eq("organization_id", authz.org.orgId)
      .order("placa");
    veiculos = ((frota ?? []) as unknown as {
      id: string;
      placa: string;
      capacidade_kg: number;
      capacidade_m3: number;
      veiculo_tipo: string | null;
    }[]).map((v) => ({
      veiculo_id: v.id,
      capacidade_kg: Number(v.capacidade_kg ?? 0),
      capacidade_m3: Number(v.capacidade_m3 ?? 0),
    }));
  }

  if (veiculos.length === 0) {
    // A carga já sabe com que veículo ela sai; sem capacidade cadastrada o
    // serviço devolve `capacidade_*_sem_dados` em vez de fingir que aplicou.
    veiculos = [
      {
        veiculo_id: d.carga.placa?.trim() || `carga-${d.carga.numero}`,
        ...(d.carga.motorista_nome?.trim() ? { motorista_id: d.carga.motorista_nome.trim() } : {}),
      },
    ];
  }

  let resultado: OtimizacaoVrptw;
  try {
    resultado = await otimizarVRPTW({
      orgId: authz.org.orgId,
      origem,
      pontos,
      veiculos,
      retornarOrigem,
      tempoParadaMin,
      maxVeiculos: parsed.data.max_veiculos,
      limiteBuscaS: parsed.data.limite_busca_s,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "SolverIndisponivelError") {
      return fail("upstream_unavailable", "Servico de otimizacao de rotas indisponivel.", 503, { requestId });
    }
    return fail("internal_error", "Falha ao consultar otimizacao de rotas.", 500, { requestId });
  }

  const restricoes = [...resultado.restricoes_nao_aplicadas];
  if (paradasSemPeso > 0) restricoes.push("peso_de_produto_incompleto");

  if (resultado.status === "sem_solucao") {
    return fail(
      ApiErrorCodes.unprocessable_entity,
      "Não foi possível distribuir as entregas com as restrições informadas.",
      422,
      {
        requestId,
        details: {
          motivo: resultado.motivo ?? "nenhuma_solucao_viavel",
          entregas_nao_alocadas: resultado.entregas_nao_alocadas,
          restricoes_nao_aplicadas: [...new Set(restricoes)],
          veiculos: veiculos.map((v) => ({
            veiculo_id: v.veiculo_id,
            capacidade_kg: v.capacidade_kg ?? 0,
            capacidade_m3: v.capacidade_m3 ?? 0,
          })),
          demanda_total_kg: Math.round(pontos.reduce((s, p) => s + (p.peso_kg ?? 0), 0) * 1000) / 1000,
          demanda_total_m3: Math.round(pontos.reduce((s, p) => s + (p.volume_m3 ?? 0), 0) * 1_000_000) / 1_000_000,
        },
      },
    );
  }

  return ok(
    {
      veiculos: resultado.veiculos,
      total_paradas: resultado.total_paradas,
      status: resultado.status,
      org_id: resultado.org_id,
      origem,
      retornar_origem: retornarOrigem,
      tempo_parada_min: tempoParadaMin,
      nao_roteirizaveis: naoRoteirizaveis,
      entregas_nao_alocadas: resultado.entregas_nao_alocadas,
      restricoes_nao_aplicadas: [...new Set(restricoes)],
      total_kg: Math.round(pontos.reduce((s, p) => s + (p.peso_kg ?? 0), 0) * 1000) / 1000,
      total_m3: Math.round(pontos.reduce((s, p) => s + (p.volume_m3 ?? 0), 0) * 1_000_000) / 1_000_000,
      tempo_execucao_ms: resultado.tempo_execucao_ms,
      versao_algoritmo: resultado.versao_algoritmo,
      matriz_provedor: resultado.matriz_provedor,
    },
    { requestId },
  );
}
