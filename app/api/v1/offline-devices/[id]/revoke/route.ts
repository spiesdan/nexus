/**
 * POST /api/v1/offline-devices/[id]/revoke — desconecta um aparelho.
 *
 * Idempotente: revogar o que já está revogado devolve ok com
 * `already_revoked: true`. O efeito é imediato — a próxima chamada do shell com
 * aquele token responde `token_revoked`, a fila fica no aparelho e a tela pede
 * para parear de novo (nada é descartado).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("admin", { requestId, resource: "offline_devices" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  const supabase = await createClient();
  const { data: aparelho, error: fetchErr } = await supabase
    .from("offline_devices")
    .select("id, revoked_at, nome")
    .eq("id", id)
    // O filtro de organização é o que impede revogar aparelho de outro tenant
    // por id adivinhado. A RLS também barraria, mas a mensagem seria 404 de
    // qualquer jeito — e a doutrina pede o filtro explícito.
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();

  if (fetchErr) return fail("internal_error", fetchErr.message, 500, { requestId });
  if (!aparelho) return fail("not_found", "Aparelho não encontrado.", 404, { requestId });
  if (aparelho.revoked_at) {
    return ok({ id, already_revoked: true }, { requestId });
  }

  const agora = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("offline_devices")
    .update({ revoked_at: agora, revoked_by: authUser.id })
    .eq("id", id)
    .eq("organization_id", activeOrg.orgId);
  if (updErr) return fail("internal_error", updErr.message, 500, { requestId });

  await audit({
    action: "offline_device.revoked",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "offline_device",
    resourceId: id,
    requestId,
    metadata: { nome: aparelho.nome },
  });

  return ok({ id, revoked_at: agora }, { requestId });
}
