/**
 * PATCH /api/v1/tarefas/[id] — conclui/cancela, edita, registra check-in.
 *
 * Concluir carimba `concluida_em`; check-in carimba lugar + hora juntos
 * (lugar sem hora não prova visita). Reabrir é voltar para pendente.
 * FASE 12 (§31): concluir uma tarefa espelhada da prospecção limpa a
 * `proximo_passo` do prospect — as duas pontas falam a mesma verdade.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { COLUNAS_DA_TAREFA, tarefaPatchSchema } from "@/lib/schemas/tarefas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "commercial_tasks" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  const parsed = tarefaPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) {
    patch.status = parsed.data.status;
    patch.concluida_em = parsed.data.status === "concluida" ? new Date().toISOString() : null;
  }
  if (parsed.data.titulo !== undefined) patch.titulo = parsed.data.titulo;
  if (parsed.data.descricao !== undefined) patch.descricao = parsed.data.descricao;
  if (parsed.data.agendada_para !== undefined) patch.agendada_para = parsed.data.agendada_para;
  if (parsed.data.checkin_lat != null || parsed.data.checkin_lng != null) {
    if (parsed.data.checkin_lat != null) patch.checkin_lat = parsed.data.checkin_lat;
    if (parsed.data.checkin_lng != null) patch.checkin_lng = parsed.data.checkin_lng;
    patch.checkin_em = new Date().toISOString();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commercial_tasks")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select(COLUNAS_DA_TAREFA)
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao salvar a tarefa.", 500, { requestId });
  if (!data) return fail("not_found", "Tarefa não encontrada.", 404, { requestId });

  if (parsed.data.status === "concluida") {
    await audit({
      organizationId: authz.org.orgId,
      actorUserId: authz.user.id,
      action: "commercial_task.concluida",
      resourceType: "commercial_tasks",
      resourceId: id,
      requestId,
    });

    // FASE 12 (§31/D7): concluir a espelhada resolve a PRÓXIMA AÇÃO do
    // prospect — o texto que a tarefa representava. Cancelada não mexe
    // (adiar é decisão do vendedor); tarefa sem prospect não tem passo.
    const prospectId = (data as unknown as { prospect_id?: string | null }).prospect_id ?? null;
    if (prospectId) {
      await supabase
        .from("business_prospects")
        .update({ proximo_passo: null })
        .eq("id", prospectId)
        .eq("organization_id", authz.org.orgId);
      await audit({
        organizationId: authz.org.orgId,
        actorUserId: authz.user.id,
        action: "prospect.updated",
        resourceType: "business_prospects",
        resourceId: prospectId,
        requestId,
      });
    }
  }

  return ok(data, { requestId });
}
