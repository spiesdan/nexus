/**
 * GET  /api/v1/fleet/drivers — motoristas da organização ativa.
 * POST /api/v1/fleet/drivers — cadastra um motorista (manager+).
 *
 * `user_id` é opcional e, quando vem, precisa ser membro DESTA organização:
 * apontar para usuário de outro tenant criaria um vínculo que a RLS não vê
 * (a FK só conhece auth.users) e a distância entre "motorista da carga" e
 * "pessoa que faz login" viraria adivinhação.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { COLUNAS_DO_MOTORISTA, motoristaCreateSchema } from "@/lib/schemas/frota";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fleet_drivers" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fleet_drivers")
    .select(COLUNAS_DO_MOTORISTA)
    .eq("organization_id", authz.org.orgId)
    .order("ativo", { ascending: false })
    .order("nome");

  if (error) return fail("internal_error", "Erro ao listar os motoristas.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fleet_drivers" });
  if (!authz.ok) return authz.response;

  const parsed = motoristaCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

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
    .insert({ ...parsed.data, organization_id: authz.org.orgId })
    .select(COLUNAS_DO_MOTORISTA)
    .single();

  if (error) return fail("internal_error", "Erro ao salvar o motorista.", 500, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fleet.driver.created",
    resourceType: "fleet_drivers",
    resourceId: data.id,
    requestId,
  });

  return ok(data, { requestId });
}
