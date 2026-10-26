/**
 * POST /api/v1/prospecting/campaigns/[id]/liberar-reservas — solta as reservas
 * SEM comprovante de envio.
 *
 * ═══ POR QUE ISSO EXISTE ═══════════════════════════════════════════════════
 *
 * `prospecting_sends` é o ledger de idempotência: uma linha sem `message_id`
 * significa "reservei esta empresa, mas a mensagem não confirmou". O scheduler
 * e o disparo tratam a linha como já enviada — então uma interrupção no meio
 * de um lote deixa um grupo preso: não sai, não volta para a fila e o operador
 * não tem como reagendar.
 *
 * A tela de controle mostra essas linhas como "sem confirmação" e NÃO as inclui
 * no novo agendamento, justamente para não duplicar. Esta rota é a saída
 * manual: o operador confere no Inbox, conclui que não saiu e libera SÓ as
 * reservas sem comprovante. As linhas com `message_id` nunca são tocadas.
 *
 * Não é automático de propósito: liberar uma reserva cuja mensagem saiu é
 * mandar de novo para a pessoa. A confirmação humana é a trava.
 *
 * ─── E NÃO LIBERA COM LOTE EM VOO (0288) ───────────────────────────────────
 *
 * Reserva sem `message_id` tem DUAS causas: (a) o lote morreu no meio, e a
 * reserva é órfã; (b) o lote está rodando e aquela empresa ainda espera a vez —
 * uma a cada intervalo. A tela distinguia as duas, a rota não: durante um lote
 * de 28 empresas a 2 min (~1h), liberar apagaria 27 reservas que iam sair, e o
 * scheduler poderia reservá-las de novo — mensagem duplicada.
 *
 * Por isso a rota recusa (409) enquanto o número tem lease ativo. O botão da
 * tela fica desabilitado com o horário de liberação; quando o lease vence ou o
 * lote termina, a mesma ação funciona e aí só sobram as órfãs de verdade.
 */
import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { disparoEmAndamento } from "@/lib/prospeccao/trava-de-disparo";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: campanha, error: erroCampanha } = await admin
    .from("prospecting_campaigns")
    .select("id")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();

  if (erroCampanha) {
    logger.error("[prospecting.campaign.liberar-reservas] falha ao ler a campanha", {
      requestId,
      organization_id: authz.org.orgId,
      campanha_id: id,
      erro: erroCampanha.message,
    });
    return fail("internal_error", "Erro ao abrir a campanha.", 500, { requestId });
  }
  if (!campanha) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

  // ═══ A TRAVA CONTRA O CLIQUE NO MEIO DO LOTE ═══════════════════════════════
  //
  // Durante um "Enviar agora" longo, as reservas ficam sem `message_id` enquanto
  // esperam a vez (uma a cada intervalo). Liberar nesse instante apagaria
  // justamente as reservas que o lote ainda vai usar: o scheduler poderia
  // reservar as mesmas empresas e a pessoa receberia duas mensagens.
  //
  // O operador não perde a saída — ele espera o lote terminar (o aviso na tela
  // diz até quando) e libera o que sobrar, que aí sim é órfão de verdade.
  const disparo = await disparoEmAndamento(admin, { orgId: authz.org.orgId });
  if (disparo.ativo) {
    return fail(
      "state_conflict",
      "O número está enviando um lote agora. Espere terminar para liberar as reservas.",
      409,
      { requestId, details: { disparo_ate: disparo.ate } },
    );
  }

  const { data, error } = await admin
    .from("prospecting_sends")
    .delete()
    .eq("organization_id", authz.org.orgId)
    .eq("campaign_id", id)
    .is("message_id", null)
    .select("id");

  if (error) {
    logger.error("[prospecting.campaign.liberar-reservas] falha ao liberar", {
      requestId,
      organization_id: authz.org.orgId,
      campanha_id: id,
      erro: error.message,
    });
    return fail("internal_error", "Não foi possível liberar as reservas.", 500, { requestId });
  }

  const liberadas = data?.length ?? 0;
  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "prospecting_campaign.updated",
    resourceType: "prospecting_campaigns",
    resourceId: id,
    requestId,
    metadata: { liberar_reservas_sem_confirmacao: liberadas },
  });

  return ok({ liberadas }, { requestId });
}
