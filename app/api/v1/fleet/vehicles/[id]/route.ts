/**
 * PATCH  /api/v1/fleet/vehicles/[id] — placa, tipo, capacidades, ativo/inativo.
 * DELETE /api/v1/fleet/vehicles/[id] — apaga o cadastro.
 *
 * Apagar NÃO apaga histórico: `shipment_orders.veiculo_id` e
 * `shipment_route_versions.veiculos` guardam o que já rodou. Quem quer tirar o
 * veículo da operação sem perder a referência usa `ativo: false`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { COLUNAS_DO_VEICULO, veiculoPatchSchema } from "@/lib/schemas/frota";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fleet_vehicles" });
  if (!authz.ok) return authz.response;

  const parsed = veiculoPatchSchema.safeParse(await req.json().catch(() => null));
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
  const { data, error } = await supabase
    .from("fleet_vehicles")
    .update({ ...parsed.data, atualizados_em: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select(COLUNAS_DO_VEICULO)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return fail("conflict", "Já existe um veículo com essa placa nesta organização.", 409, { requestId });
    }
    return fail("internal_error", "Erro ao salvar o veículo.", 500, { requestId });
  }
  if (!data) return fail("not_found", "Veículo não encontrado.", 404, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fleet.vehicle.updated",
    resourceType: "fleet_vehicles",
    resourceId: id,
    requestId,
  });

  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fleet_vehicles" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fleet_vehicles")
    .delete()
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id")
    .maybeSingle();

  if (error) return fail("internal_error", "Erro ao apagar o veículo.", 500, { requestId });
  if (!data) return fail("not_found", "Veículo não encontrado.", 404, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fleet.vehicle.deleted",
    resourceType: "fleet_vehicles",
    resourceId: id,
    requestId,
  });

  return ok({ id }, { requestId });
}
