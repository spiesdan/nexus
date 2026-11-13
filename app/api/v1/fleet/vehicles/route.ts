/**
 * GET  /api/v1/fleet/vehicles — veículos da organização ativa.
 * POST /api/v1/fleet/vehicles — cadastra um veículo (manager+).
 *
 * A frota é o que dá sentido à capacidade do VRPTW: sem veículo com capacidade
 * declarada, o otimizador não tem contra o que comparar o peso da carga. A
 * escrita é `manager` porque capacidade e jornada decidem o que a operação pode
 * alocar — é decisão de supervisão, não de quem está na doca.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { COLUNAS_DO_VEICULO, veiculoCreateSchema } from "@/lib/schemas/frota";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fleet_vehicles" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fleet_vehicles")
    .select(COLUNAS_DO_VEICULO)
    .eq("organization_id", authz.org.orgId)
    .order("ativo", { ascending: false })
    .order("placa");

  if (error) return fail("internal_error", "Erro ao listar os veículos.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fleet_vehicles" });
  if (!authz.ok) return authz.response;

  const parsed = veiculoCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fleet_vehicles")
    .insert({ ...parsed.data, organization_id: authz.org.orgId })
    .select(COLUNAS_DO_VEICULO)
    .single();

  if (error) {
    // Placa repetida na MESMA organização é conflito de cadastro, não erro de
    // servidor: acontece quando alguém digita "abc1d23" para o veículo que já
    // está como "ABC 1D23". O índice único do banco compara a forma normalizada.
    if (error.code === "23505") {
      return fail("conflict", "Já existe um veículo com essa placa nesta organização.", 409, { requestId });
    }
    return fail("internal_error", "Erro ao salvar o veículo.", 500, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fleet.vehicle.created",
    resourceType: "fleet_vehicles",
    resourceId: data.id,
    requestId,
  });

  return ok(data, { requestId });
}
