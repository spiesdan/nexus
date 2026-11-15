/**
 * POST /api/v1/shipments/[id]/destinos/[destinationId]/rejeitar — o operador
 * rejeita a sugestão de recuperação. O destino fica como `nao_encontrado` e
 * o endereço original é preservado.
 *
 * Body `{ motivo? }`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { audit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

import { destinoPertenceACarga } from "../../_pertence";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  motivo: z.string().trim().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; destinationId: string }> }
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "shipments" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const { id, destinationId } = await params;
  const supabase = await createClient();

  const { data: destino, error: erroDestino } = await supabase
    .from("shipment_destinations")
    .select("id, organization_id")
    .eq("id", destinationId)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (erroDestino || !destino) {
    return fail("not_found", "Destino não encontrado.", 404, { requestId });
  }

  // Pertencimento por existência: dois pedidos ao mesmo endereço são uma parada
  // só (0308) e duas linhas em `shipment_orders` — `maybeSingle()` transformava
  // isso em "não pertence" e travava a rejeição do endereço.
  const pertence = await destinoPertenceACarga(supabase, {
    orgId: authz.org.orgId,
    shipmentId: id,
    destinationId,
  });
  if (!pertence) {
    return fail("validation_failed", "Destino não pertence a esta carga.", 422, { requestId });
  }

  const agora = new Date().toISOString();
  const { error: erroUpdate } = await supabase
    .from("shipment_destinations")
    .update({
      recuperacao_status: "nao_encontrado",
      geo_status: "nao_encontrado",
      geo_fonte: null,
      atualizado_em: agora,
    })
    .eq("id", destinationId)
    .eq("organization_id", authz.org.orgId);
  if (erroUpdate) return fail("internal_error", "Erro ao rejeitar a recuperação.", 500, { requestId });

  await supabase.from("shipment_destination_recoveries").insert({
    organization_id: authz.org.orgId,
    destination_id: destinationId,
    tentativa: 0,
    provedor: "manual",
    consulta: "rejeição manual do operador",
    candidato: null,
    confianca: null,
    motivo: parsed.data.motivo ?? "Rejeitado pelo operador.",
    criado_por: authz.user.id,
  });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "shipment.rota.recuperacao_rejeitada",
    resourceType: "shipments",
    resourceId: id,
    requestId,
    metadata: { destinationId, motivo: parsed.data.motivo },
  });

  return ok({ destinationId, status: "nao_encontrado" }, { requestId });
}
