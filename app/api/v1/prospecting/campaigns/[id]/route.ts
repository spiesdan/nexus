/**
 * GET   /api/v1/prospecting/campaigns/[id] — detalhe da campanha (§28).
 * PATCH /api/v1/prospecting/campaigns/[id] — editar objetivo (§28) e AGENDAR
 *       o disparo (0273: lista fechada, janelas, período, ritmo e cota).
 *
 * Antes da FASE 10 não existia rota nenhuma em `[id]` (só `executar/`); o
 * painel precisa do detalhe e de onde escrever o "Objetivo" que a spec cobra.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { conflitosDeReserva, resumoDosConflitos } from "@/lib/prospeccao/reserva-de-campanha";
import { validateRequest } from "@/lib/schemas";
import { campanhaPatchSchema } from "@/lib/schemas/prospeccao";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const COLUNAS =
  "id, nome, objetivo, categorias, cidades, status, recorrencia_dias, ultima_execucao_at, " +
  "created_at, fonte_publico, publico, prospect_ids, contato_ids, mensagens, espaco_ms, limite_diario, " +
  "data_inicio, data_fim, janelas, agendada_em, ultimo_envio_at";

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospecting_campaigns")
    .select(COLUNAS)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (error) {
    logger.error("[prospecting.campaign] falha ao ler a campanha", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error.message,
    });
    return fail("internal_error", "Erro ao ler a campanha.", 500, { requestId });
  }
  if (!data) return fail("not_found", "Campanha não encontrada.", 404, { requestId });
  return ok(data, { requestId });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  let input;
  try {
    input = await validateRequest(campanhaPatchSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    return fail("internal_error", "Erro interno.", 500, { requestId });
  }

  const supabase = await createClient();

  // 0277 — antes de gravar a lista/categorias, precisamos da campanha atual
  // para validar a lista RESULTANTE (o PATCH pode mudar só as categorias, ou
  // só a lista).
  if (input.prospect_ids !== undefined || input.categorias !== undefined) {
    const { data: atual, error: erroAtual } = await supabase
      .from("prospecting_campaigns")
      .select("prospect_ids, categorias, contato_ids")
      .eq("id", id)
      .eq("organization_id", authz.org.orgId)
      .maybeSingle();
    if (erroAtual) {
      logger.error("[prospecting.campaign] falha ao ler a reserva atual", {
        requestId,
        organization_id: authz.org.orgId,
        erro: erroAtual.message,
      });
      return fail("internal_error", "Erro ao validar a campanha.", 500, { requestId });
    }
    if (!atual) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

    const ids = input.prospect_ids ?? atual.prospect_ids ?? [];
    const cats = input.categorias ?? atual.categorias ?? [];
    if (ids.length > 0) {
      try {
        const conflitos = await conflitosDeReserva(supabase, {
          organizationId: authz.org.orgId,
          campaignId: id,
          prospectIds: ids,
          contatoIds: atual.contato_ids ?? [],
          categorias: cats,
        });
        if (conflitos.length > 0) {
          return fail(
            "state_conflict",
            `Não dá para salvar a campanha: ${resumoDosConflitos(conflitos)}.`,
            409,
            { requestId, details: { conflitos } },
          );
        }
      } catch (e) {
        logger.error("[prospecting.campaign] reserva falhou", {
          requestId,
          organization_id: authz.org.orgId,
          erro: e instanceof Error ? e.message : String(e),
        });
        return fail("internal_error", "Erro ao validar as empresas da campanha.", 500, { requestId });
      }
    }
  }

  const { data, error } = await supabase
    .from("prospecting_campaigns")
    .update({
      // `objetivo` volta como null quando o corpo o traz vazio (contrato do
      // PATCH); `fonte_publico` só é tocado quando veio — PATCH que não fala
      // de um campo não reescreve o campo.
      ...(input.objetivo !== undefined ? { objetivo: input.objetivo } : {}),
      ...(input.fonte_publico !== undefined ? { fonte_publico: input.fonte_publico } : {}),
      ...(input.categorias !== undefined ? { categorias: input.categorias } : {}),
      ...(input.cidades !== undefined ? { cidades: input.cidades } : {}),
      // 0273 — o relógio do agendamento. Cada campo só é escrito quando veio:
      // um PATCH que salva o objetivo não zera as janelas nem a lista fechada.
      ...(input.prospect_ids !== undefined ? { prospect_ids: input.prospect_ids } : {}),
      ...(input.mensagens !== undefined ? { mensagens: input.mensagens } : {}),
      ...(input.espaco_ms !== undefined ? { espaco_ms: input.espaco_ms } : {}),
      ...(input.limite_diario !== undefined ? { limite_diario: input.limite_diario } : {}),
      ...(input.data_inicio !== undefined ? { data_inicio: input.data_inicio } : {}),
      ...(input.data_fim !== undefined ? { data_fim: input.data_fim } : {}),
      ...(input.janelas !== undefined ? { janelas: input.janelas } : {}),
      ...(input.agendada_em !== undefined ? { agendada_em: input.agendada_em } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select(COLUNAS)
    .maybeSingle();
  if (error) {
    if (
      error.code === "23505" ||
      error.message.includes("prospect_em_outra_campanha") ||
      error.message.includes("contato_em_outra_campanha")
    ) {
      return fail(
        "state_conflict",
        "Uma ou mais empresas/contatos já estão reservados por outra campanha.",
        409,
        { requestId },
      );
    }
    logger.error("[prospecting.campaign] falha ao salvar o objetivo", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error.message,
    });
    return fail("internal_error", "Erro ao salvar o objetivo.", 500, { requestId });
  }
  if (!data) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

  await audit({
    action: "prospecting_campaign.updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "prospecting_campaign",
    resourceId: id,
    requestId,
  });

  return ok(data, { requestId });
}

/**
 * DELETE /api/v1/prospecting/campaigns/[id] — apaga a campanha.
 *
 * ─── O que some junto, e o que NÃO some ─────────────────────────────────────
 *
 * As buscas da campanha ficam (`prospecting_searches.campaign_id` é
 * `ON DELETE SET NULL`): o resultado continua no banco, só deixa de pertencer
 * à campanha. O LEDGER DE ENVIOS cai (`prospecting_sends` é
 * `ON DELETE CASCADE`), e essa é a consequência que importa: a empresa que
 * recebeu mensagem por esta campanha volta a ficar livre para outra. É a única
 * exclusão do produto que desfaz uma reserva — por isso a confirmação na tela
 * diz isso com todas as letras e a ação vai para o audit.
 *
 * Sem DELETE não havia como desfazer um rascunho/campanha criada por engano: a
 * tela só oferecia editar. O dono da instalação pediu a exclusão da campanha
 * "Oficinas - SC" e não achou onde — porque não existia.
 */
export async function DELETE(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();

  // Lê antes de apagar: o nome vai para o audit (depois do delete não há linha
  // para reconstituir de qual campanha se trata) e o 404 fica correto para id
  // de outra organização.
  const { data: campanha, error: erroLeitura } = await supabase
    .from("prospecting_campaigns")
    .select("id, nome")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (erroLeitura) {
    logger.error("[prospecting.campaign] falha ao ler a campanha para excluir", {
      requestId,
      organization_id: authz.org.orgId,
      erro: erroLeitura.message,
    });
    return fail("internal_error", "Erro ao excluir a campanha.", 500, { requestId });
  }
  if (!campanha) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

  const { error } = await supabase
    .from("prospecting_campaigns")
    .delete()
    .eq("id", id)
    .eq("organization_id", authz.org.orgId);
  if (error) {
    logger.error("[prospecting.campaign] falha ao excluir a campanha", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error.message,
    });
    return fail("internal_error", "Erro ao excluir a campanha.", 500, { requestId });
  }

  await audit({
    action: "prospecting_campaign.deleted",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "prospecting_campaign",
    resourceId: id,
    requestId,
    metadata: { nome: (campanha as { nome: string }).nome },
  });

  return ok({ id }, { requestId });
}
