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
 */
import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

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
