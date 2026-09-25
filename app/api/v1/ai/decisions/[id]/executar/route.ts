/**
 * POST /api/v1/ai/decisions/[id]/executar — aprovada vira ação (FASE 10).
 *
 * Só decisão `ai.action.approved` da mesma org, ainda não executada, com
 * política explícita permitindo. Executor implementado: `agendar_followup`
 * (matrícula no fluxo padrão via `enrollFollowupFlow`, que exige fluxo
 * ATIVO). Demais ferramentas: 422 `ferramenta_sem_executor` — executar
 * WhatsApp/pedido sem rampa própria seria ação fantasma.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { enrollFollowupFlow } from "@/lib/followup/enroll";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Aprovada = {
  id: string;
  resource_id: string | null;
  request_id: string | null;
  metadata: Record<string, unknown>;
};

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "ai_decisions" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const orgId = authz.org.orgId;

  const { data: aprovada, error: erroLeitura } = await supabase
    .from("api_audit_log")
    .select("id, action, resource_id, request_id, metadata")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (erroLeitura) return fail("internal_error", "Erro ao ler a decisão.", 500, { requestId });
  const dec = aprovada as unknown as Aprovada & { action: string } | null;
  if (!dec) return fail("not_found", "Decisão não encontrada.", 404, { requestId });
  if (dec.action !== "ai.action.approved") {
    return fail("validation_failed", "Só decisão aprovada executa.", 422, { requestId });
  }
  // Cadeia de custódia: a approved referencia a proposed que a originou.
  const refId = typeof dec.metadata?.ref_audit_id === "string" ? dec.metadata.ref_audit_id : null;
  if (refId) {
    const { data: origem } = await supabase
      .from("api_audit_log")
      .select("id, action")
      .eq("organization_id", orgId)
      .eq("id", refId)
      .maybeSingle();
    const acaoOrigem = (origem as unknown as { action?: string } | null)?.action;
    if (acaoOrigem !== "ai.action.proposed") {
      return fail("validation_failed", "Aprovação sem proposta válida.", 422, { requestId });
    }
  }

  // Já executada? (auditoria é o ledger: executed referencia a approved.)
  const { data: jaFoi } = await supabase
    .from("api_audit_log")
    .select("id")
    .eq("organization_id", orgId)
    .eq("action", "ai.action.executed")
    .eq("metadata->>ref_audit_id", id)
    .limit(1)
    .maybeSingle();
  if (jaFoi) return fail("state_conflict", "Decisão já executada.", 409, { requestId });

  const proposta = (dec.metadata?.proposta ?? dec.metadata) as Record<string, unknown>;
  const ferramenta = typeof proposta.ferramenta === "string" ? proposta.ferramenta : "";
  const contato = typeof dec.resource_id === "string" ? dec.resource_id : null;
  if (!contato) return fail("validation_failed", "Decisão sem contato vinculado.", 422, { requestId });
  if (ferramenta !== "agendar_followup") {
    return fail("validation_failed", `Ferramenta sem executor: ${ferramenta || "—"}.`, 422, { requestId });
  }

  const { data: politica } = await supabase
    .from("ai_execution_policies")
    .select("executar_followup, default_flow_pointer_id")
    .eq("organization_id", orgId)
    .maybeSingle();
  const pol = politica as unknown as { executar_followup: boolean; default_flow_pointer_id: string | null } | null;
  if (!pol?.executar_followup || !pol.default_flow_pointer_id) {
    return fail("validation_failed", "Política não autoriza execução (ative follow-up + fluxo padrão).", 422, {
      requestId,
    });
  }

  const admin = createAdminClient();
  // agentId ausente de propósito: a matrícula é do Orchestrator, não de um
  // agente publicado (o gate resolve o agente automático no fluxo).
  const resultado = await enrollFollowupFlow(admin, {
    organizationId: orgId,
    pointerId: pol.default_flow_pointer_id,
    contactId: contato,
    actorUserId: authz.user.id,
    requestId,
  });
  if (!resultado.ok) {
    return fail(resultado.code === "flow_not_active" ? "validation_failed" : "internal_error", resultado.message, resultado.status, {
      requestId,
    });
  }

  await audit({
    action: "ai.action.executed",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "contact",
    resourceId: contato,
    requestId,
    metadata: {
      ref_audit_id: id,
      ref_request_id: dec.request_id,
      ferramenta,
      enrollment_id: (resultado.enrollment as { id?: string })?.id ?? null,
      fluxo: pol.default_flow_pointer_id,
    },
  });
  return ok({ executed: true, enrollment_id: (resultado.enrollment as { id?: string })?.id ?? null }, { requestId });
}
