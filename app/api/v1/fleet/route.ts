/**
 * GET  /api/v1/fleet — frota da organização ativa (veículos + motoristas).
 *
 * Uma chamada só porque a tela de distribuição precisa das DUAS listas ao mesmo
 * tempo: escolher veículo sem o motorista (ou o contrário) não fecha a
 * distribuição. As rotas individuais existem para o cadastro (CRUD).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { COLUNAS_DO_MOTORISTA, COLUNAS_DO_VEICULO } from "@/lib/schemas/frota";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fleet_vehicles" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const [veiculos, motoristas] = await Promise.all([
    supabase
      .from("fleet_vehicles")
      .select(COLUNAS_DO_VEICULO)
      .eq("organization_id", authz.org.orgId)
      .order("ativo", { ascending: false })
      .order("placa"),
    supabase
      .from("fleet_drivers")
      .select(COLUNAS_DO_MOTORISTA)
      .eq("organization_id", authz.org.orgId)
      .order("ativo", { ascending: false })
      .order("nome"),
  ]);

  if (veiculos.error || motoristas.error) {
    return fail("internal_error", "Erro ao listar a frota.", 500, { requestId });
  }

  return ok({ veiculos: veiculos.data ?? [], motoristas: motoristas.data ?? [] }, { requestId });
}
