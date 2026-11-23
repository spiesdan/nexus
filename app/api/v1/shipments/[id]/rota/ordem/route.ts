/**
 * PATCH /api/v1/shipments/[id]/rota/ordem — confirma a sequência da rota.
 *
 * `{ ordem: [<chave da parada>...] }` cobre TODAS as paradas exatamente uma
 * vez (a validação recusa cobertura parcial — rota pela metade não salva).
 * Grava `sequencia` nos itens, o cache da rota na carga e avança
 * `rota_versao` (o app do motorista só aplica a nova com confirmação).
 * Aceita a proposta do otimizar (distância/geometria/origem) junto.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { rotaOrdemAtomicaLigada, type ItemOrdemAtomica } from "@/lib/rotas/ordem-atomica";
import { createClient } from "@/lib/supabase/server";

import { carregarCargaComParadas } from "../_carga";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  ordem: z.array(z.string().min(1)).min(1).max(200),
  distancia_m: z.number().int().min(0).max(20000000).nullable().optional(),
  duracao_s: z.number().int().min(0).max(864000).nullable().optional(),
  geometria: z.array(z.tuple([z.number(), z.number()])).max(20000).optional(),
  provedor: z.string().max(30).optional(),
  ruas: z.boolean().optional(),
  modo: z.enum(["tsp", "distancia"]).optional(),
  origem_endereco: z.string().trim().max(300).nullable().optional(),
  origem_lat: z.number().min(-90).max(90).nullable().optional(),
  origem_lng: z.number().min(-180).max(180).nullable().optional(),
  retornar_origem: z.boolean().optional(),
  tempo_parada_min: z.number().int().min(0).max(120).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
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
  // Reotimizar com a rota em andamento é operação normal (o motorista
  // confirma a nova sequência no app); concluída/cancelada é histórico.
  if (d.carga.status !== "montando" && d.carga.status !== "em_rota") {
    return fail("validation_failed", "Rota só muda com a carga montando ou em rota.", 422, { requestId });
  }

  const chaves = new Set(d.paradas.map((p) => p.chave));
  const recebidas = new Set(parsed.data.ordem);
  if (recebidas.size !== parsed.data.ordem.length || ![...recebidas].every((c) => chaves.has(c)) || recebidas.size !== chaves.size) {
    return fail("validation_failed", "A ordem precisa cobrir todas as paradas exatamente uma vez.", 422, { requestId });
  }
  const posicao = new Map(parsed.data.ordem.map((c, i) => [c, i + 1]));

  const itens: ItemOrdemAtomica[] = d.paradas.flatMap((p) =>
    p.pedidos.map((ped) => ({ id: ped.shipment_order_id, sequencia: posicao.get(p.chave) ?? 1 })),
  );
  const b = parsed.data;
  const ordemPersistida = d.paradas.map((p) => p.chave);
  const ordemMudou = [...parsed.data.ordem].join("|") !== [...ordemPersistida].join("|");
  const semProposta = b.geometria === undefined && b.provedor === undefined;
  // Sequência mexida sem proposta nova: a geometria antiga não descreve mais a
  // rota e morre junto com a escrita — nunca fica desenho órfão no mapa.
  const invalidar = ordemMudou && semProposta;

  // CAMINHO ATÔMICO (flag do dono): cobertura/separação JÁ validadas acima e
  // revalidadas na RPC antes de qualquer UPDATE. A RPC sobe a versão com CAS e
  // grava as sequências na MESMA transação; falha no meio rollbacka os dois.
  // Sem flag, o caminho antigo continua exatamente como era.
  if (rotaOrdemAtomicaLigada()) {
    const cargaRpc: Record<string, unknown> = {
      limpar_geojson: invalidar,
      ...(b.origem_endereco !== undefined ? { origem_endereco: b.origem_endereco } : {}),
      ...(b.origem_lat !== undefined ? { origem_lat: b.origem_lat } : {}),
      ...(b.origem_lng !== undefined ? { origem_lng: b.origem_lng } : {}),
      ...(b.retornar_origem !== undefined ? { retornar_origem: b.retornar_origem } : {}),
      ...(b.tempo_parada_min !== undefined ? { tempo_parada_min: b.tempo_parada_min } : {}),
      ...(b.distancia_m !== undefined ? { distancia_m: b.distancia_m } : {}),
      ...(b.duracao_s !== undefined ? { duracao_s: b.duracao_s } : {}),
      ...(!invalidar && (b.geometria !== undefined || b.provedor !== undefined)
        ? {
            rota_geojson: {
              geometria: b.geometria ?? [],
              provedor: b.provedor ?? "local",
              ruas: b.ruas ?? false,
              ...(b.modo ? { modo: b.modo } : {}),
            },
          }
        : {}),
    };
    const { data: resultado, error: erroRpc } = await supabase.rpc("fn_salvar_ordem_rota", {
      p_org: authz.org.orgId,
      p_shipment: id,
      p_itens: itens,
      p_carga: cargaRpc,
      p_versao_esperada: d.carga.rota_versao,
      p_rota_em: new Date().toISOString(),
    });
    if (erroRpc) {
      const conflito = /concorrencia|sequencia|cobertura|item_/.test(erroRpc.message);
      return fail(
        conflito ? "state_conflict" : "internal_error",
        conflito
          ? "A rota mudou ou a ordem ficou incompleta; nada foi gravado."
          : "Erro ao salvar a rota.",
        conflito ? 409 : 500,
        { requestId },
      );
    }
    await audit({
      organizationId: authz.org.orgId,
      actorUserId: authz.user.id,
      action: "shipment.rota.ordenada",
      resourceType: "shipments",
      resourceId: id,
      requestId,
    });
    const atualizado = await carregarCargaComParadas(supabase, authz.org.orgId, id);
    return ok({ ...atualizado, transacao: resultado }, { requestId });
  }

  for (const p of d.paradas) {
    const seq = posicao.get(p.chave) ?? 1;
    for (const ped of p.pedidos) {
      const { error } = await supabase
        .from("shipment_orders")
        .update({ sequencia: seq })
        .eq("id", ped.shipment_order_id)
        .eq("organization_id", authz.org.orgId);
      if (error) return fail("internal_error", "Erro ao salvar a sequência.", 500, { requestId });
    }
  }

  // Sequência alterada manualmente (prompt §5): sem proposta nova, a geometria
  // salva não corresponde mais à sequência — invalidar (null) em vez de deixar a
  // linha antiga no mapa para uma ordem que não é mais a verdade.
  const { error: erroCarga } = await supabase
    .from("shipments")
    .update({
      ...(b.origem_endereco !== undefined ? { origem_endereco: b.origem_endereco } : {}),
      ...(b.origem_lat !== undefined ? { origem_lat: b.origem_lat } : {}),
      ...(b.origem_lng !== undefined ? { origem_lng: b.origem_lng } : {}),
      ...(b.retornar_origem !== undefined ? { retornar_origem: b.retornar_origem } : {}),
      ...(b.tempo_parada_min !== undefined ? { tempo_parada_min: b.tempo_parada_min } : {}),
      ...(b.distancia_m !== undefined ? { distancia_m: b.distancia_m } : {}),
      ...(b.duracao_s !== undefined ? { duracao_s: b.duracao_s } : {}),
      ...(b.geometria !== undefined || b.provedor !== undefined
        ? {
            rota_geojson: {
              geometria: b.geometria ?? [],
              provedor: b.provedor ?? "local",
              ruas: b.ruas ?? false,
              ...(b.modo ? { modo: b.modo } : {}),
            },
          }
        : {}),
      // Sequência manual salva sem proporção nova: a geometria antiga morre
      // aqui (null) — rota sem linha — e a versão sobe, invalidando o que o
      // app do motorista tem em cache. A tela mostra "pendente de recálculo"
      // em vez de desenhar uma linha que não corresponde à ordem.
      ...(invalidar ? { rota_geojson: null, distancia_m: null, duracao_s: null } : {}),
      rota_em: new Date().toISOString(),
      rota_versao: d.carga.rota_versao + 1,
    })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId);
  if (erroCarga) return fail("internal_error", "Erro ao salvar a rota.", 500, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "shipment.rota.ordenada",
    resourceType: "shipments",
    resourceId: id,
    requestId,
  });

  const atualizado = await carregarCargaComParadas(supabase, authz.org.orgId, id);
  return ok(atualizado, { requestId });
}
