/**
 * GET /api/v1/shipments/[id]/rota — a carga pronta para roteirizar.
 *
 * Paradas agrupadas por cliente (vários pedidos, uma visita), coordenadas do
 * cache, rota salva (geometria + distância + versão) e última posição do
 * motorista. Leitura pura: quem calcula é o POST otimizar.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { carregarCargaComParadas } from "./_carga";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "shipments" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const d = await carregarCargaComParadas(supabase, authz.org.orgId, id);
  if (!d) return fail("not_found", "Carga não encontrada.", 404, { requestId });

  const [{ data: ultima }, { data: versoes }] = await Promise.all([
    supabase
      .from("shipment_positions")
      .select("latitude, longitude, precisao_m, em")
      .eq("shipment_id", id)
      .eq("organization_id", authz.org.orgId)
      .order("em", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Histórico da distribuição confirmada (migration 0307). A lista vai SEM
    // o snapshot completo — `veiculos` traz geometria e cresceria sem limite
    // com o passar das versões. A versão ativa vem inteira logo abaixo.
    supabase
      .from("shipment_route_versions")
      .select("id, versao, algoritmo, distancia_m, duracao_s, tempo_execucao_ms, criado_em, criado_por, ativa")
      .eq("shipment_id", id)
      .eq("organization_id", authz.org.orgId)
      .order("versao", { ascending: false })
      .limit(20),
  ]);

  const versaoAtiva = (versoes ?? []).find((v) => v.ativa) ?? null;
  let distribuicao: unknown = null;
  if (versaoAtiva) {
    const { data } = await supabase
      .from("shipment_route_versions")
      .select("id, versao, algoritmo, veiculos, distancia_m, duracao_s, tempo_execucao_ms, criado_em, criado_por, ativa")
      .eq("id", versaoAtiva.id)
      .eq("organization_id", authz.org.orgId)
      .maybeSingle();
    distribuicao = data ?? null;
  }

  return ok(
    {
      ...d,
      ultima_posicao: ultima ?? null,
      rota_versao: d.carga.rota_versao,
      distribuicao,
      historico_rotas: versoes ?? [],
    },
    { requestId },
  );
}
