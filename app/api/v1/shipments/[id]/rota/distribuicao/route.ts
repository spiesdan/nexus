/**
 * PATCH /api/v1/shipments/[id]/rota/distribuicao — confirma a distribuição
 * por veículo (F5 / VRPTW).
 *
 * O otimizador devolve a distribuição, mas até aqui ela morria na resposta
 * HTTP: `shipment_orders.sequencia` é uma ordem GLOBAL e não havia onde dizer
 * "esta parada é do veículo A, na posição 3". Esta rota fecha o laço:
 *
 * - cobertura TOTAL: toda parada da carga aparece exatamente uma vez;
 * - capacidade revalidada NO SERVIDOR com a mesma conta do solver
 *   (`demandasPorParada`) — o body não decide o que cabe;
 * - frota é resolvida no banco pelo id: veículo/motorista de outro tenant ou
 *   inativo é recusado, nunca aceito por confiança no cliente;
 * - concorrência otimista: `versao_base` + update condicional em
 *   `shipments.rota_versao`. Quem confirmou primeiro vence; a segunda tela
 *   recebe 409 `state_conflict` em vez de sobrescrever a rota alheia;
 * - grava `shipment_route_versions` — o histórico imutável que o app do
 *   motorista aplica e que a tela de histórico lê.
 *
 * O caminho single-vehicle (`PATCH .../rota/ordem`) continua existindo e não é
 * tocado por esta rota.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { demandasPorParada } from "@/lib/expedicao/demanda-da-carga";
import { createClient } from "@/lib/supabase/server";

import { carregarCargaComParadas } from "../_carga";

export const dynamic = "force-dynamic";

const hora = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Hora inválida (use HH:MM)");

const veiculoSchema = z.object({
  /** `null` = veículo legado da carga (`shipments.placa`), sem capacidade declarada. */
  veiculo_id: z.string().uuid().nullable(),
  motorista_id: z.string().uuid().nullable().optional(),
  paradas: z.array(z.string().min(1)).max(500),
  distancia_m: z.number().int().min(0).max(20_000_000).nullable().optional(),
  duracao_s: z.number().int().min(0).max(864_000).nullable().optional(),
  /** Chegada em cada parada (s desde a saída), alinhada com `paradas`. */
  chegadas_s: z.array(z.number().int().min(0).max(864_000)).max(500).optional(),
  geometria: z.array(z.tuple([z.number(), z.number()])).max(20_000).optional(),
});

const corpoSchema = z.object({
  /** `rota_versao` que a tela carregou. Divergência = outra sessão confirmou. */
  versao_base: z.number().int().min(0),
  veiculos: z.array(veiculoSchema).min(1).max(50),
  algoritmo: z.string().trim().max(60).optional(),
  tempo_execucao_ms: z.number().int().min(0).max(600_000).optional(),
  distancia_m: z.number().int().min(0).max(20_000_000).nullable().optional(),
  duracao_s: z.number().int().min(0).max(864_000).nullable().optional(),
  saida_prevista: hora.nullable().optional(),
  restricoes_nao_aplicadas: z.array(z.string().max(80)).max(30).optional(),
});

type VeiculoSnapshot = {
  veiculo_id: string | null;
  motorista_id: string | null;
  placa: string | null;
  motorista_nome: string | null;
  paradas: string[];
  chegadas_s?: number[];
  distancia_m: number | null;
  duracao_s: number | null;
  carga_kg: number;
  carga_m3: number;
  geometria?: [number, number][];
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
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
  const corpo = parsed.data;

  const { id } = await params;
  const supabase = await createClient();
  const d = await carregarCargaComParadas(supabase, authz.org.orgId, id);
  if (!d) return fail("not_found", "Carga não encontrada.", 404, { requestId });

  if (d.carga.status !== "montando" && d.carga.status !== "em_rota") {
    return fail("validation_failed", "Rota só muda com a carga montando ou em rota.", 422, {
      requestId,
    });
  }
  if (d.paradas.length === 0) {
    return fail("validation_failed", "Carga sem pedidos para distribuir.", 422, { requestId });
  }

  // ── Cobertura total: cada parada exatamente uma vez ────────────────────────
  const chavesDaCarga = new Set(d.paradas.map((p) => p.chave));
  const atribuidas = corpo.veiculos.flatMap((v) => v.paradas);
  const semDuplicata = new Set(atribuidas);
  if (
    semDuplicata.size !== atribuidas.length ||
    atribuidas.length !== chavesDaCarga.size ||
    !atribuidas.every((c) => chavesDaCarga.has(c))
  ) {
    return fail(
      "validation_failed",
      "A distribuição precisa cobrir todas as paradas exatamente uma vez.",
      422,
      { requestId, details: { paradas_da_carga: [...chavesDaCarga] } },
    );
  }

  for (const v of corpo.veiculos) {
    if (v.chegadas_s && v.chegadas_s.length !== v.paradas.length) {
      return fail(
        "validation_failed",
        "Cada parada do veículo precisa de uma chegada (ou nenhuma).",
        422,
        { requestId },
      );
    }
  }

  const idsDeVeiculo = [
    ...new Set(corpo.veiculos.map((v) => v.veiculo_id).filter((v): v is string => v != null)),
  ];
  if (idsDeVeiculo.length !== corpo.veiculos.filter((v) => v.veiculo_id != null).length) {
    return fail("validation_failed", "O mesmo veículo aparece mais de uma vez.", 422, {
      requestId,
    });
  }
  if (corpo.veiculos.filter((v) => v.veiculo_id == null).length > 1) {
    return fail("validation_failed", "Só existe um veículo legado da carga.", 422, { requestId });
  }

  // ── Frota resolvida no banco, nunca do body ────────────────────────────────
  const veiculosDaFrota = new Map<
    string,
    { id: string; placa: string; capacidade_kg: number; capacidade_m3: number; ativo: boolean }
  >();
  if (idsDeVeiculo.length > 0) {
    const { data: frota, error } = await supabase
      .from("fleet_vehicles")
      .select("id, placa, capacidade_kg, capacidade_m3, ativo")
      .eq("organization_id", authz.org.orgId)
      .in("id", idsDeVeiculo);
    if (error) return fail("internal_error", "Erro ao carregar a frota.", 500, { requestId });
    for (const v of (frota ?? []) as unknown as {
      id: string;
      placa: string;
      capacidade_kg: number;
      capacidade_m3: number;
      ativo: boolean;
    }[]) {
      veiculosDaFrota.set(v.id, {
        ...v,
        capacidade_kg: Number(v.capacidade_kg ?? 0),
        capacidade_m3: Number(v.capacidade_m3 ?? 0),
      });
    }
    if (veiculosDaFrota.size !== idsDeVeiculo.length) {
      return fail("validation_failed", "Veículo não encontrado nesta organização.", 422, {
        requestId,
      });
    }
  }

  const idsDeMotorista = [
    ...new Set(
      corpo.veiculos.map((v) => v.motorista_id).filter((v): v is string => v != null),
    ),
  ];
  const motoristasDaFrota = new Map<
    string,
    { id: string; nome: string; capacidade_jornada_min: number; ativo: boolean }
  >();
  if (idsDeMotorista.length > 0) {
    const { data: motoristas, error } = await supabase
      .from("fleet_drivers")
      .select("id, nome, capacidade_jornada_min, ativo")
      .eq("organization_id", authz.org.orgId)
      .in("id", idsDeMotorista);
    if (error) return fail("internal_error", "Erro ao carregar os motoristas.", 500, { requestId });
    for (const m of (motoristas ?? []) as unknown as {
      id: string;
      nome: string;
      capacidade_jornada_min: number;
      ativo: boolean;
    }[]) {
      motoristasDaFrota.set(m.id, {
        ...m,
        capacidade_jornada_min: Number(m.capacidade_jornada_min ?? 0),
      });
    }
    if (motoristasDaFrota.size !== idsDeMotorista.length) {
      return fail("validation_failed", "Motorista não encontrado nesta organização.", 422, {
        requestId,
      });
    }
  }

  for (const v of corpo.veiculos) {
    if (v.veiculo_id == null && !(d.carga.placa ?? "").trim()) {
      return fail(
        "validation_failed",
        "A carga não tem placa e a distribuição não escolheu um veículo da frota.",
        422,
        { requestId },
      );
    }
    if (v.veiculo_id) {
      const veiculo = veiculosDaFrota.get(v.veiculo_id);
      if (!veiculo) {
        return fail("validation_failed", "Veículo não encontrado nesta organização.", 422, {
          requestId,
        });
      }
      if (!veiculo.ativo) {
        return fail("validation_failed", `O veículo ${veiculo.placa} está inativo.`, 422, {
          requestId,
        });
      }
    }
    if (v.motorista_id) {
      const motorista = motoristasDaFrota.get(v.motorista_id);
      if (!motorista) {
        return fail("validation_failed", "Motorista não encontrado nesta organização.", 422, {
          requestId,
        });
      }
      if (!motorista.ativo) {
        return fail("validation_failed", `O motorista ${motorista.nome} está inativo.`, 422, {
          requestId,
        });
      }
    }
  }

  // ── Capacidade e jornada: hard constraint revalidada aqui ──────────────────
  const demanda = demandasPorParada(d.itens, d.paradas);
  const restricoes = new Set(corpo.restricoes_nao_aplicadas ?? []);
  const excedentes: { veiculo_id: string | null; campo: string; carga: number; capacidade: number }[] = [];

  for (const entrada of corpo.veiculos) {
    const veiculo = entrada.veiculo_id ? veiculosDaFrota.get(entrada.veiculo_id) : null;
    let peso = 0;
    let volume = 0;
    let semPeso = false;
    let semVolume = false;
    for (const chave of entrada.paradas) {
      const dem = demanda.get(chave);
      if (!dem) continue;
      peso += dem.peso_kg;
      volume += dem.volume_m3;
      semPeso ||= dem.semPeso;
      semVolume ||= dem.semVolume;
    }
    if (semPeso) restricoes.add("peso_de_produto_incompleto");
    if (semVolume) restricoes.add("volume_de_produto_incompleto");
    if (!veiculo) {
      restricoes.add("capacidade_sem_dado_do_veiculo");
      continue;
    }
    if (veiculo.capacidade_kg > 0 && peso > veiculo.capacidade_kg + 1e-6) {
      excedentes.push({
        veiculo_id: veiculo.id,
        campo: "capacidade_kg",
        carga: Math.round(peso * 1000) / 1000,
        capacidade: veiculo.capacidade_kg,
      });
    } else if (veiculo.capacidade_kg <= 0) {
      restricoes.add("capacidade_peso_sem_dado_do_veiculo");
    }
    if (veiculo.capacidade_m3 > 0 && volume > veiculo.capacidade_m3 + 1e-9) {
      excedentes.push({
        veiculo_id: veiculo.id,
        campo: "capacidade_m3",
        carga: Math.round(volume * 1_000_000) / 1_000_000,
        capacidade: veiculo.capacidade_m3,
      });
    } else if (veiculo.capacidade_m3 <= 0) {
      restricoes.add("capacidade_volume_sem_dado_do_veiculo");
    }

    const motorista = entrada.motorista_id ? motoristasDaFrota.get(entrada.motorista_id) : null;
    if (
      motorista &&
      motorista.capacidade_jornada_min > 0 &&
      entrada.duracao_s != null &&
      entrada.duracao_s > motorista.capacidade_jornada_min * 60
    ) {
      excedentes.push({
        veiculo_id: veiculo.id,
        campo: "jornada",
        carga: entrada.duracao_s,
        capacidade: motorista.capacidade_jornada_min * 60,
      });
    }
  }

  if (excedentes.length > 0) {
    return fail(
      "validation_failed",
      "A distribuição excede capacidade ou jornada. O servidor não grava o que não cabe.",
      422,
      { requestId, details: { excedentes } },
    );
  }

  // ── Concorrência otimista + versão ─────────────────────────────────────────
  if (corpo.versao_base !== d.carga.rota_versao) {
    return fail("state_conflict", "A rota mudou desde que esta tela abriu. Recarregue.", 409, {
      requestId,
      details: { rota_versao: d.carga.rota_versao },
    });
  }
  const novaVersao = corpo.versao_base + 1;

  const agora = new Date().toISOString();
  const { data: atualizada, error: erroCarga } = await supabase
    .from("shipments")
    .update({
      rota_versao: novaVersao,
      rota_em: agora,
      ...(corpo.distancia_m !== undefined ? { distancia_m: corpo.distancia_m } : {}),
      ...(corpo.duracao_s !== undefined ? { duracao_s: corpo.duracao_s } : {}),
      ...(corpo.saida_prevista !== undefined ? { saida_prevista: corpo.saida_prevista } : {}),
    })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    // O lock é AQUI: se outra confirmação subiu a versão entre o SELECT e este
    // UPDATE, nenhuma linha casa e a segunda perde — sem sobrescrever.
    .eq("rota_versao", corpo.versao_base)
    .select("id")
    .maybeSingle();

  if (erroCarga) return fail("internal_error", "Erro ao salvar a rota.", 500, { requestId });
  if (!atualizada) {
    return fail("state_conflict", "A rota mudou durante a confirmação. Recarregue.", 409, {
      requestId,
    });
  }

  // ── Snapshot imutável da distribuição ──────────────────────────────────────
  const snapshot: VeiculoSnapshot[] = corpo.veiculos.map((entrada) => {
    const veiculo = entrada.veiculo_id ? veiculosDaFrota.get(entrada.veiculo_id) : null;
    const motorista = entrada.motorista_id
      ? motoristasDaFrota.get(entrada.motorista_id)
      : null;
    let peso = 0;
    let volume = 0;
    for (const chave of entrada.paradas) {
      const dem = demanda.get(chave);
      peso += dem?.peso_kg ?? 0;
      volume += dem?.volume_m3 ?? 0;
    }
    return {
      veiculo_id: entrada.veiculo_id,
      motorista_id: entrada.motorista_id ?? null,
      placa: veiculo?.placa ?? d.carga.placa ?? null,
      motorista_nome: motorista?.nome ?? d.carga.motorista_nome ?? null,
      paradas: entrada.paradas,
      ...(entrada.chegadas_s ? { chegadas_s: entrada.chegadas_s } : {}),
      distancia_m: entrada.distancia_m ?? null,
      duracao_s: entrada.duracao_s ?? null,
      carga_kg: Math.round(peso * 1000) / 1000,
      carga_m3: Math.round(volume * 1_000_000) / 1_000_000,
      ...(entrada.geometria ? { geometria: entrada.geometria } : {}),
    };
  });

  const { data: versao, error: erroVersao } = await supabase
    .from("shipment_route_versions")
    .insert({
      organization_id: authz.org.orgId,
      shipment_id: id,
      versao: novaVersao,
      algoritmo: corpo.algoritmo ?? "confirmacao-manual",
      veiculos: snapshot,
      distancia_m: corpo.distancia_m ?? null,
      duracao_s: corpo.duracao_s ?? null,
      tempo_execucao_ms: corpo.tempo_execucao_ms ?? null,
      criado_por: authz.user.id,
      ativa: true,
    })
    .select("id, versao, criado_em")
    .single();

  if (erroVersao) {
    if (erroVersao.code === "23505") {
      return fail("state_conflict", "Essa versão da rota já foi gravada. Recarregue.", 409, {
        requestId,
      });
    }
    return fail("internal_error", "Erro ao gravar o histórico da rota.", 500, { requestId });
  }

  await supabase
    .from("shipment_route_versions")
    .update({ ativa: false })
    .eq("shipment_id", id)
    .eq("organization_id", authz.org.orgId)
    .neq("versao", novaVersao);

  // ── Atribuição operacional das paradas ────────────────────────────────────
  //
  // `sequencia` (global) continua sendo a leitura do romaneio: percorre os
  // veículos na ordem enviada e, dentro de cada um, a ordem das paradas.
  // `sequencia_veiculo` é a ordem DENTRO do veículo. Não são a mesma pergunta.
  const porChave = new Map(d.paradas.map((p) => [p.chave, p]));
  let sequenciaGlobal = 0;
  for (const [indiceVeiculo, entrada] of corpo.veiculos.entries()) {
    for (const [indiceParada, chave] of entrada.paradas.entries()) {
      sequenciaGlobal += 1;
      const parada = porChave.get(chave);
      if (!parada) continue;
      for (const pedido of parada.pedidos) {
        const { error } = await supabase
          .from("shipment_orders")
          .update({
            veiculo_id: entrada.veiculo_id,
            motorista_id: entrada.motorista_id ?? null,
            sequencia_veiculo: indiceParada + 1,
            sequencia: sequenciaGlobal,
          })
          .eq("id", pedido.shipment_order_id)
          .eq("organization_id", authz.org.orgId);
        if (error) {
          return fail(
            "internal_error",
            "A versão foi gravada, mas a atribuição das paradas falhou. Recarregue e confirme novamente.",
            500,
            { requestId, details: { versao: versao.versao, veiculo: indiceVeiculo + 1 } },
          );
        }
      }
    }
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "shipment.rota.distribuida",
    resourceType: "shipments",
    resourceId: id,
    requestId,
    metadata: {
      versao: versao.versao,
      veiculos: snapshot.length,
      paradas: sequenciaGlobal,
    },
  });

  return ok(
    {
      versao: versao.versao,
      versao_id: versao.id,
      criado_em: versao.criado_em,
      rota_versao: novaVersao,
      veiculos: snapshot,
      distancia_m: corpo.distancia_m ?? null,
      duracao_s: corpo.duracao_s ?? null,
      restricoes_nao_aplicadas: [...restricoes].sort(),
    },
    { requestId },
  );
}
