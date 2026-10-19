/**
 * GET  /api/v1/prospecting/campaigns — campanhas.
 * POST /api/v1/prospecting/campaigns — cria campanha.
 * POST /api/v1/prospecting/campaigns/[id]/executar — fã-out: uma busca
 *        queued por (cidade × categorias em blocos), vinculada à campanha.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { funisDaDescoberta } from "@/lib/prospeccao/funil-lote";
import { campanhaCreateSchema } from "@/lib/schemas/prospeccao";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  // FASE 15 (§45): `com_funil=1` traz o funil de TODAS as campanhas em 5
  // queries — a aba Campanhas passou a pedir só as duas listas (N+1 morto).
  const comFunil = req.nextUrl.searchParams.get("com_funil") === "1";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospecting_campaigns")
    .select(
      "id, nome, objetivo, categorias, cidades, status, recorrencia_dias, ultima_execucao_at, created_at, fonte_publico",
    )
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    logger.error("[prospecting.campaigns] falha ao listar campanhas", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error.message,
    });
    return fail("internal_error", "Erro ao listar campanhas.", 500, { requestId });
  }
  const linhas = (data ?? []) as unknown as { id: string; created_at: string }[];
  if (comFunil && linhas.length > 0) {
    try {
      const funis = await funisDaDescoberta(
        supabase,
        authz.org.orgId,
        linhas.map((l) => ({ id: l.id, created_at: l.created_at })),
      );
      return ok(
        linhas.map((l) => ({ ...l, funil: funis[l.id] })),
        { requestId },
      );
    } catch (e) {
      // O funil é enfeite da lista: falhou, a lista sobrevive (mesmo silêncio
      // de antes, quando um `/painel` derrubado deixava o card sem número).
      logger.warn("[prospecting.campaigns] funil em lote falhou", {
        requestId,
        organization_id: authz.org.orgId,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = campanhaCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospecting_campaigns")
    .insert({
      organization_id: authz.org.orgId,
      nome: parsed.data.nome,
      objetivo: parsed.data.objetivo ?? null,
      categorias: parsed.data.categorias,
      cidades: parsed.data.cidades,
      recorrencia_dias: parsed.data.recorrencia_dias ?? null,
      fonte_publico: parsed.data.fonte_publico ?? "busca",
      // 0273 — a criação também aceita o agendamento; os campos ausentes ficam
      // no default da coluna (o operador que agenda pela tela usa o PATCH).
      ...(parsed.data.prospect_ids !== undefined ? { prospect_ids: parsed.data.prospect_ids } : {}),
      ...(parsed.data.mensagens !== undefined ? { mensagens: parsed.data.mensagens } : {}),
      ...(parsed.data.espaco_ms !== undefined ? { espaco_ms: parsed.data.espaco_ms } : {}),
      ...(parsed.data.limite_diario !== undefined ? { limite_diario: parsed.data.limite_diario } : {}),
      ...(parsed.data.data_inicio !== undefined ? { data_inicio: parsed.data.data_inicio } : {}),
      ...(parsed.data.data_fim !== undefined ? { data_fim: parsed.data.data_fim } : {}),
      ...(parsed.data.janelas !== undefined ? { janelas: parsed.data.janelas } : {}),
      ...(parsed.data.agendada_em !== undefined ? { agendada_em: parsed.data.agendada_em } : {}),
      status: parsed.data.status ?? "rascunho",
      created_by: authz.user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    logger.error("[prospecting.campaigns] falha ao criar campanha", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error?.message ?? "sem linha devolvida",
    });
    return fail("internal_error", "Erro ao criar campanha.", 500, { requestId });
  }

  return ok(data, { requestId, status: 201 });
}
