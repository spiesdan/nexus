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
import { demandasPorParada, type DemandaDaParada } from "@/lib/expedicao/demanda-da-carga";
import { converterJanelaParaSolver } from "@/lib/expedicao/janelas-solver";
import { geocodificarEndereco } from "@/lib/rotas/geocodificacao";
import { minutosDoDia } from "@/lib/rotas/janelas";
import { createClient } from "@/lib/supabase/server";

import { carregarCargaComParadas } from "../../_carga";

export const dynamic = "force-dynamic";

const origemSchema = z.union([
  z.object({ endereco: z.string().trim().min(3).max(300) }),
  z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
]);

const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Hora inválida (use HH:MM)");

const corpoSchema = z.object({
  origem: origemSchema.nullable().optional(),
  /**
   * Hora de saída da base. Vem do painel antes da confirmação: sem ela NÃO há
   * como converter "entregar entre 14h e 16h" no relógio do solver. Quando
   * ausente, usa a que a carga já tem gravada; se nenhuma das duas existir, a
   * resposta declara `janelas_de_entrega_sem_hora_de_saida`.
   */
  retornar_origem: z.boolean().optional(),
  tempo_parada_min: z.number().int().min(0).max(600).optional(),
  saida_prevista: horaSchema.nullable().optional(),
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
  //
  // Fonte única (`demandasPorParada`): a confirmação da distribuição revalida
  // capacidade com a MESMA conta — duas fórmulas divergiriam no dia do ajuste.
  const demandaPorChave = demandasPorParada(d.itens, d.paradas);
  const demandaVazia: DemandaDaParada = {
    peso_kg: 0,
    volume_m3: 0,
    semPeso: false,
    semVolume: false,
  };
  const demandaDaParada = (parada: (typeof d.paradas)[number]): DemandaDaParada =>
    demandaPorChave.get(parada.chave) ?? demandaVazia;

  const comCoord = d.paradas.filter((p) => p.latitude != null && p.longitude != null);
  const naoRoteirizaveis = d.paradas
    .filter((p) => p.latitude == null || p.longitude == null)
    .map((p) => ({ chave: p.chave, cliente: p.cliente, endereco: p.endereco }));
  if (comCoord.length === 0) {
    return fail("validation_failed", "Nenhuma parada geocodificada. Geocodifique antes de otimizar.", 422, { requestId });
  }

  // ── Janelas de entrega: hora do dia → minutos desde a saída ──────────────
  //
  // A janela é do CLIENTE (14h–16h). Para virar restrição do solver precisa da
  // hora em que a carga sai; sem ela, a restrição é declarada como não
  // aplicada — não existe partida padrão inventada.
  const saidaEfetiva = parsed.data.saida_prevista ?? d.carga.saida_prevista;
  const partidaMin = minutosDoDia(saidaEfetiva);
  const janelasVencidas: string[] = [];
  const pontos: PontoDoSolver[] = comCoord.map((p) => {
    const demanda = demandaDaParada(p);
    const ponto: PontoDoSolver = {
      node_id: p.chave,
      latitude: p.latitude as number,
      longitude: p.longitude as number,
      peso_kg: demanda.peso_kg,
      volume_m3: demanda.volume_m3,
    };
    if (partidaMin != null) {
      const janela = converterJanelaParaSolver(p.janela_inicio, p.janela_fim, partidaMin);
      if (janela.estado === "vencida") janelasVencidas.push(p.chave);
      else if (janela.estado === "ok") {
        ponto.janela_inicio_min = janela.janela.inicio;
        ponto.janela_fim_min = janela.janela.fim;
      }
    }
    return ponto;
  });

  if (janelasVencidas.length > 0) {
    return fail(
      "validation_failed",
      "Há janela de entrega que termina antes da saída prevista. Ajuste a hora de saída ou a janela.",
      422,
      { requestId, details: { janelas_vencidas: janelasVencidas } },
    );
  }

  const paradasSemPeso = comCoord.filter((p) => demandaDaParada(p).semPeso).length;
  const paradasComJanela = comCoord.filter((p) => p.janela_inicio && p.janela_fim).length;
  const paradasComJanelaConflitante = comCoord.filter((p) => p.janela_conflito).length;

  // ── Veículos: body → frota cadastrada → o veículo da própria carga.
  //
  // Capacidade e jornada NÃO vêm do body quando o id é de um veículo da frota:
  // a tela escolhe QUEM participa, o banco diz O QUE CABE. Confiar no body
  // deixaria o otimizador "respeitar" uma capacidade que ninguém cadastrou.
  let veiculos: VeiculoDoSolver[] = [];
  if (parsed.data.veiculos?.length) {
    const ids = parsed.data.veiculos.map((v) => v.veiculo_id);
    const { data: frota } = await supabase
      .from("fleet_vehicles")
      .select("id, placa, capacidade_kg, capacidade_m3, ativo")
      .eq("organization_id", authz.org.orgId)
      .in("id", ids);
    const porId = new Map(
      ((frota ?? []) as unknown as {
        id: string;
        placa: string;
        capacidade_kg: number;
        capacidade_m3: number;
        ativo: boolean;
      }[]).map((v) => [v.id, v]),
    );
    const idsDeMotorista = [
      ...new Set(
        parsed.data.veiculos
          .map((v) => v.motorista_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    ];
    const jornadaPorMotorista = new Map<string, number>();
    if (idsDeMotorista.length > 0) {
      const { data: motoristas } = await supabase
        .from("fleet_drivers")
        .select("id, capacidade_jornada_min")
        .eq("organization_id", authz.org.orgId)
        .in("id", idsDeMotorista);
      for (const m of (motoristas ?? []) as unknown as {
        id: string;
        capacidade_jornada_min: number;
      }[]) {
        jornadaPorMotorista.set(m.id, Number(m.capacidade_jornada_min ?? 0));
      }
    }

    for (const entrada of parsed.data.veiculos) {
      const daFrota = porId.get(entrada.veiculo_id);
      if (daFrota && !daFrota.ativo) {
        return fail(
          "validation_failed",
          `O veículo ${daFrota.placa} está inativo e não entra na distribuição.`,
          422,
          { requestId },
        );
      }
      const jornadaDoMotorista = entrada.motorista_id
        ? jornadaPorMotorista.get(entrada.motorista_id)
        : undefined;
      veiculos.push({
        veiculo_id: entrada.veiculo_id,
        motorista_id: entrada.motorista_id,
        // Frota manda; o body só vale para veículo legado sem cadastro.
        capacidade_kg: daFrota ? Number(daFrota.capacidade_kg ?? 0) : entrada.capacidade_kg,
        capacidade_m3: daFrota ? Number(daFrota.capacidade_m3 ?? 0) : entrada.capacidade_m3,
        tempo_jornada_min:
          jornadaDoMotorista && jornadaDoMotorista > 0
            ? jornadaDoMotorista
            : entrada.tempo_jornada_min,
      });
    }
  }

  if (veiculos.length === 0) {
    const { data: frota } = await supabase
      .from("fleet_vehicles")
      .select("id, placa, capacidade_kg, capacidade_m3, veiculo_tipo, ativo")
      .eq("organization_id", authz.org.orgId)
      .eq("ativo", true)
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
  if (paradasComJanela > 0 && partidaMin == null) {
    restricoes.push("janelas_de_entrega_sem_hora_de_saida");
  }
  if (paradasComJanelaConflitante > 0) {
    restricoes.push("janelas_conflitantes_na_parada");
  }

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
      saida_prevista: saidaEfetiva,
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
