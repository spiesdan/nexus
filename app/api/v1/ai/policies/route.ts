/**
 * GET/PATCH /api/v1/ai/policies — política de execução autônoma (§35).
 *
 * Uma linha por org (migration 0241): teto de nível, follow-up executável
 * e fluxo padrão. Leitura viewer+; escrita manager+ com auditoria.
 * Sem linha, valem os defaults seguros (nada executa).
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

export const POLITICA_PADRAO = {
  nivel_maximo: 1,
  executar_followup: false,
  default_flow_pointer_id: null as string | null,
};

const politicaSchema = z.object({
  nivel_maximo: z.number().int().min(0).max(6),
  executar_followup: z.boolean(),
  default_flow_pointer_id: z.string().uuid().nullable(),
});

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "ai_policies" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_execution_policies")
    .select("nivel_maximo, executar_followup, default_flow_pointer_id, updated_at")
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao ler a política.", 500, { requestId });
  return ok(data ?? { ...POLITICA_PADRAO, updated_at: null }, { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_policies" });
  if (!authz.ok) return authz.response;

  let input;
  try {
    input = await validateRequest(politicaSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const supabase = await createClient();
  // Fluxo padrão tem de existir na org (ativo ou não — a execução exige ativo).
  if (input.default_flow_pointer_id) {
    const { data: fluxo } = await supabase
      .from("followup_flow_pointers")
      .select("id")
      .eq("organization_id", authz.org.orgId)
      .eq("id", input.default_flow_pointer_id)
      .maybeSingle();
    if (!fluxo) return fail("validation_failed", "Fluxo padrão não existe nesta organização.", 422, { requestId });
  }

  const { data, error } = await supabase
    .from("ai_execution_policies")
    .upsert(
      {
        organization_id: authz.org.orgId,
        nivel_maximo: input.nivel_maximo,
        executar_followup: input.executar_followup,
        default_flow_pointer_id: input.default_flow_pointer_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    )
    .select("nivel_maximo, executar_followup, default_flow_pointer_id, updated_at")
    .single();
  if (error || !data) return fail("internal_error", "Erro ao gravar a política.", 500, { requestId });

  await audit({
    action: "ai.policy.updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "ai_policy",
    resourceId: authz.org.orgId,
    requestId,
    metadata: { ...input },
  });
  return ok(data, { requestId });
}
