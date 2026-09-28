/**
 * POST /api/v1/ai/decisions/[id]/decide — humano decide sobre a proposta (FASE 10).
 *
 * `{ decision: "approved" | "rejected" }` sobre uma auditoria
 * `ai.action.proposed` da mesma org. Registra `ai.action.approved` ou
 * `ai.action.rejected` linkada (ref_audit_id + ref_request_id). Aprovar
 * NÃO executa nada sozinho: execução (follow-up, mensagem, pedido)
 * exige política explícita e mora na parte 3 — aprovar sem executar é
 * decisão registrada, não ação fantasma.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "ai_decisions" });
  if (!authz.ok) return authz.response;

  let input;
  try {
    input = await validateRequest(corpoSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: proposta, error } = await supabase
    .from("api_audit_log")
    .select("id, action, resource_id, request_id, metadata, created_at")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao ler a proposta.", 500, { requestId });
  const prop = proposta as unknown as {
    id: string;
    action: string;
    resource_id: string | null;
    request_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  } | null;
  if (!prop) return fail("not_found", "Proposta não encontrada.", 404, { requestId });
  if (prop.action !== "ai.action.proposed") {
    return fail("validation_failed", "Só proposta pendente recebe decisão.", 422, { requestId });
  }

  await audit({
    action: input.decision === "approved" ? "ai.action.approved" : "ai.action.rejected",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "contact",
    resourceId: prop.resource_id,
    requestId,
    metadata: {
      ref_audit_id: prop.id,
      ref_request_id: prop.request_id,
      proposta: prop.metadata,
      proposta_em: prop.created_at,
    },
  });

  return ok({ decision: input.decision, ref_audit_id: prop.id }, { requestId });
}
