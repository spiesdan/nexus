/**
 * Shared handler: change a member's role (G2-02).
 *
 * Canonical route: PATCH /api/v1/team/[user_id]
 * Alias (EPIC-09, kept for existing callers): PATCH /api/v1/team/[user_id]/role
 *
 * Guardrails:
 *  - Caller must be admin of the active org (requireRole, spec 13 §4).
 *  - Cannot demote the last remaining admin (count check before write).
 *  - Cannot change role of a revoked member.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import {
  changeNomeSchema,
  changeRoleSchema,
  changeSetorSchema,
  validateRequest,
} from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function changeMemberRole(
  req: NextRequest,
  ctx: { params: Promise<{ user_id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { user_id: targetUserId } = await ctx.params;

  const authz = await requireRole("admin", { requestId, resource: "team" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  let input;
  try {
    input = await validateRequest(changeRoleSchema, req);
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

  const { data: target, error: fetchErr } = await supabase
    .from("user_organizations")
    .select("id, user_id, role, revoked_at")
    .eq("organization_id", activeOrg.orgId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (fetchErr) return fail("internal_error", fetchErr.message, 500, { requestId });
  if (!target) return fail("not_found", "Membro não encontrado.", 404, { requestId });
  if (target.revoked_at) {
    return fail("state_conflict", "Membro está revogado.", 409, { requestId });
  }

  if (target.role === "admin" && input.role !== "admin") {
    const { count, error: countErr } = await supabase
      .from("user_organizations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", activeOrg.orgId)
      .eq("role", "admin")
      .is("revoked_at", null);
    if (countErr) return fail("internal_error", countErr.message, 500, { requestId });
    if ((count ?? 0) <= 1) {
      return fail(
        "state_conflict",
        "Não é possível rebaixar o último admin do tenant.",
        409,
        { requestId },
      );
    }
  }

  const { error: updErr } = await supabase
    .from("user_organizations")
    .update({ role: input.role, updated_at: new Date().toISOString() })
    .eq("id", target.id);
  if (updErr) return fail("internal_error", updErr.message, 500, { requestId });

  await audit({
    action: "team.role_changed",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "membership",
    resourceId: target.id,
    requestId,
    metadata: {
      target_user_id: targetUserId,
      old_role: target.role,
      new_role: input.role,
    },
  });

  return ok({ user_id: targetUserId, role: input.role }, { requestId });
}

/**
 * Shared handler: change a member's setor (ramal, 0266).
 *
 * Canonical route: PATCH /api/v1/team/[user_id]/setor
 *
 * Guardrails (mesmos do role):
 *  - Caller must be admin of the active org (requireRole, spec 13 §4).
 *  - Cannot change setor of a revoked member.
 *
 * `setor: null` LIMPA o ramal (e desliga a assinatura). Não há "string vazia":
 * o schema transforma em 422, porque vazio assinaria errado em vez de não
 * assinar.
 */
export async function changeMemberSetor(
  req: NextRequest,
  ctx: { params: Promise<{ user_id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { user_id: targetUserId } = await ctx.params;

  const authz = await requireRole("admin", { requestId, resource: "team" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  let input;
  try {
    input = await validateRequest(changeSetorSchema, req);
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

  const { data: target, error: fetchErr } = await supabase
    .from("user_organizations")
    .select("id, user_id, setor, revoked_at")
    .eq("organization_id", activeOrg.orgId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (fetchErr) return fail("internal_error", fetchErr.message, 500, { requestId });
  if (!target) return fail("not_found", "Membro não encontrado.", 404, { requestId });
  if (target.revoked_at) {
    return fail("state_conflict", "Membro está revogado.", 409, { requestId });
  }

  const { error: updErr } = await supabase
    .from("user_organizations")
    .update({ setor: input.setor, updated_at: new Date().toISOString() })
    .eq("id", target.id);
  if (updErr) return fail("internal_error", updErr.message, 500, { requestId });

  await audit({
    action: "team.setor_changed",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "membership",
    resourceId: target.id,
    requestId,
    metadata: {
      target_user_id: targetUserId,
      old_setor: (target as unknown as { setor: string | null }).setor,
      new_setor: input.setor,
    },
  });

  return ok({ user_id: targetUserId, setor: input.setor }, { requestId });
}

/**
 * Shared handler: change a member's display name (0267).
 *
 * Canonical route: PATCH /api/v1/team/[user_id]/nome
 *
 * O nome mora em `auth.users.user_metadata.full_name` — GLOBAL, não por org.
 * É o mesmo nome que a Equipe lista, o inbox mostra e a assinatura usa: um
 * nome só, em todo lugar.
 *
 * Guardrails (mesmos do role/setor):
 *  - Caller must be admin of the active org (requireRole, spec 13 §4).
 *  - Cannot change name of a revoked member.
 *
 * O merge preserva as outras chaves de `user_metadata`: escrever por cima
 * apagaria o que outro fluxo guardou lá.
 */
export async function changeMemberNome(
  req: NextRequest,
  ctx: { params: Promise<{ user_id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { user_id: targetUserId } = await ctx.params;

  const authz = await requireRole("admin", { requestId, resource: "team" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  let input;
  try {
    input = await validateRequest(changeNomeSchema, req);
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
  const admin = createAdminClient();

  const { data: target, error: fetchErr } = await supabase
    .from("user_organizations")
    .select("id, user_id, revoked_at")
    .eq("organization_id", activeOrg.orgId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (fetchErr) return fail("internal_error", fetchErr.message, 500, { requestId });
  if (!target) return fail("not_found", "Membro não encontrado.", 404, { requestId });
  if (target.revoked_at) {
    return fail("state_conflict", "Membro está revogado.", 409, { requestId });
  }

  const { data: atual, error: leituraErr } = await admin.auth.admin.getUserById(targetUserId);
  if (leituraErr || !atual?.user) {
    return fail("internal_error", "Não consegui ler o cadastro do membro.", 500, { requestId });
  }
  const metaAnterior = (atual.user.user_metadata ?? {}) as Record<string, unknown>;
  const nomeAnterior = (metaAnterior.full_name as string | undefined) ?? null;

  const { error: escritaErr } = await admin.auth.admin.updateUserById(targetUserId, {
    user_metadata: { ...metaAnterior, full_name: input.nome },
  });
  if (escritaErr) {
    return fail("internal_error", "Não consegui gravar o nome.", 500, { requestId });
  }

  await audit({
    action: "team.nome_changed",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "membership",
    resourceId: target.id,
    requestId,
    metadata: {
      target_user_id: targetUserId,
      old_nome: nomeAnterior,
      new_nome: input.nome,
    },
  });

  return ok({ user_id: targetUserId, nome: input.nome }, { requestId });
}
