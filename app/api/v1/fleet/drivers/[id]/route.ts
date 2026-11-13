/**
 * PATCH  /api/v1/fleet/drivers/[id] — nome, telefone, jornada, login, ativo.
 * DELETE /api/v1/fleet/drivers/[id] — apaga o cadastro.
 *
 * `user_id` segue a mesma regra do POST: só membro desta organização. Trocar o
 * vínculo de login é o que decide QUAL pessoa vê a carga no modo motorista —
 * não pode apontar para fora do tenant.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { COLUNAS_DO_MOTORISTA, motoristaPatchSchema } from "@/lib/schemas/frota";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fleet_drivers" });
  if (!authz.ok) return authz.response;

  const parsed = motoristaPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  if (Object.keys(parsed.data).length === 0) {
    return fail("validation_failed", "Nada para atualizar.", 422, { requestId });
  }

  const { id } = await params;
  const supabase = await createClient();

  if (parsed.data.user_id) {
    const { data: vinculo } = await supabase
      .from("user_organizations")
      .select("user_id")
      .eq("user_id", parsed.data.user_id)
      .eq("organization_id", authz.org.orgId)
      .is("revoked_at", null)
      .maybeSingle();
    if (!vinculo) {
      return fail("validation_failed", "Esse usuário não faz parte da organização.", 422, { requestId });
    }
  }

  const { data, error } = await supabase
    .from("fleet_drivers")
    .update({ ...parsed.data, atualizados_em: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select(COLUNAS_DO_MOTORISTA)
    .maybeSingle();

  if (error) return fail("internal_error", "Erro ao salvar o motorista.", 500, { requestId });
  if (!data) return fail("not_found", "Motorista não encontrado.", 404, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fleet.driver.updated",
    resourceType: "fleet_drivers",
    resourceId: id,
    requestId,
  });

  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fleet_drivers" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fleet_drivers")
    .delete()
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id")
    .maybeSingle();

  if (error) return fail("internal_error", "Erro ao apagar o motorista.", 500, { requestId });
  if (!data) return fail("not_found", "Motorista não encontrado.", 404, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fleet.driver.deleted",
    resourceType: "fleet_drivers",
    resourceId: id,
    requestId,
  });

  return ok({ id }, { requestId });
}
