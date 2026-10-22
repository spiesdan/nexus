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
import { conflitosDeReserva, resumoDosConflitos } from "@/lib/prospeccao/reserva-de-campanha";
import {
  resumirEnvios,
  type EnvioDaCampanha,
  type ResumoDeEnvio,
} from "@/lib/prospeccao/resumo-de-envio";
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
      "id, nome, objetivo, categorias, cidades, status, recorrencia_dias, ultima_execucao_at, created_at, fonte_publico, publico, prospect_ids, contato_ids, janelas, data_inicio, data_fim, agendada_em, mensagens, limite_diario",
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
  const linhas = (data ?? []) as unknown as {
    id: string;
    created_at: string;
    prospect_ids?: string[] | null;
    contato_ids?: string[] | null;
  }[];

  // ── O resumo de envio entra na LISTA, não só no painel ───────────────────
  // O card precisa dizer "22 de 48 enviadas · 26 faltam" sem abrir a campanha.
  // A query é uma só para as 100 campanhas (sem N+1) e o cálculo é a MESMA
  // função pura do painel. Se o ledger falhar, a lista continua abrindo; o
  // card mostra a fila da lista fechada e o painel é a fonte detalhada.
  const envioPorCampanha = new Map<string, ResumoDeEnvio>();
  const ids = linhas.map((l) => l.id);
  if (ids.length > 0) {
    const { data: envios, error: erroEnvios } = await supabase
      .from("prospecting_sends")
      .select("campaign_id, prospect_id, message_id, enviado_em")
      .eq("organization_id", authz.org.orgId)
      .in("campaign_id", ids);

    if (erroEnvios) {
      logger.warn("[prospecting.campaigns] resumo de envio indisponível", {
        requestId,
        organization_id: authz.org.orgId,
        erro: erroEnvios.message,
      });
    } else {
      const porCampanha = new Map<string, EnvioDaCampanha[]>();
      for (const envio of (envios ?? []) as unknown as (EnvioDaCampanha & {
        campaign_id: string;
      })[]) {
        const lista = porCampanha.get(envio.campaign_id) ?? [];
        lista.push(envio);
        porCampanha.set(envio.campaign_id, lista);
      }
      for (const linha of linhas) {
        const publicoContatos = (linha as { publico?: string }).publico === "contatos";
        const listaFechada = publicoContatos ? linha.contato_ids : linha.prospect_ids;
        envioPorCampanha.set(
          linha.id,
          resumirEnvios({
            prospectIds: listaFechada,
            sends: porCampanha.get(linha.id) ?? [],
          }),
        );
      }
    }
  }

  const comEnvio = linhas.map((l) => ({
    ...l,
    envio:
      envioPorCampanha.get(l.id) ??
      resumirEnvios({
        prospectIds: l.prospect_ids ?? l.contato_ids,
        sends: [],
      }),
  }));

  if (comFunil && comEnvio.length > 0) {
    try {
      const funis = await funisDaDescoberta(
        supabase,
        authz.org.orgId,
        comEnvio.map((l) => ({ id: l.id, created_at: l.created_at })),
      );
      return ok(
        comEnvio.map((l) => ({ ...l, funil: funis[l.id] })),
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
  return ok(comEnvio, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = campanhaCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // O 422 devolve os campos para a tela, mas o toast genérico ("Dados
    // inválidos.") não os mostra. O log é o que permite saber QUAL campo a
    // instalação recusou sem reproduzir o clique.
    logger.warn("[prospecting.campaigns] payload recusado", {
      requestId,
      organization_id: authz.org.orgId,
      campos: parsed.error.flatten().fieldErrors,
    });
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();

  // 0277 — a lista fechada não pode reutilizar empresa de outra campanha nem
  // empresa com categoria a revisar/fora do recorte. O trigger do banco é a
  // trava final; esta checagem existe para responder QUEM e ONDE.
  if (parsed.data.prospect_ids && parsed.data.prospect_ids.length > 0) {
    try {
      const conflitos = await conflitosDeReserva(supabase, {
        organizationId: authz.org.orgId,
        campaignId: null,
        prospectIds: parsed.data.prospect_ids,
        categorias: parsed.data.categorias,
      });
      if (conflitos.length > 0) {
        return fail(
          "state_conflict",
          `Não dá para criar a campanha: ${resumoDosConflitos(conflitos)}.`,
          409,
          { requestId, details: { conflitos } },
        );
      }
    } catch (e) {
      logger.error("[prospecting.campaigns] reserva falhou", {
        requestId,
        organization_id: authz.org.orgId,
        erro: e instanceof Error ? e.message : String(e),
      });
      return fail("internal_error", "Erro ao validar as empresas da campanha.", 500, { requestId });
    }
  }

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
    if (
      error?.code === "23505" ||
      error?.message?.includes("prospect_em_outra_campanha") ||
      error?.message?.includes("contato_em_outra_campanha")
    ) {
      return fail(
        "state_conflict",
        "Uma ou mais empresas/contatos já estão reservados por outra campanha.",
        409,
        { requestId },
      );
    }
    logger.error("[prospecting.campaigns] falha ao criar campanha", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error?.message ?? "sem linha devolvida",
    });
    return fail("internal_error", "Erro ao criar campanha.", 500, { requestId });
  }

  return ok(data, { requestId, status: 201 });
}
