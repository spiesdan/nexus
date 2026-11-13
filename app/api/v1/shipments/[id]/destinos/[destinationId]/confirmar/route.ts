/**
 * POST /api/v1/shipments/[id]/destinos/[destinationId]/confirmar — o operador
 * aceita a sugestão de recuperação de endereço (confiança intermediária).
 *
 * Body `{ endereco, latitude, longitude, metodo, provedor, confianca, motivo }`.
 * O endereço ORIGINAL é preservado; apenas o recuperado é atualizado.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { audit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  endereco: z.string().trim().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  metodo: z.enum(["original", "normalizado", "digitos", "componentes", "photon", "manual"]),
  provedor: z.enum(["nominatim", "photon"]),
  confianca: z.number().min(0).max(1).optional(),
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

  // O destino deve existir e pertencer à organização da carga.
  const { data: destino, error: erroDestino } = await supabase
    .from("shipment_destinations")
    .select("id, organization_id, recuperacao_status, endereco_original")
    .eq("id", destinationId)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (erroDestino || !destino) {
    return fail("not_found", "Destino não encontrado.", 404, { requestId });
  }

  // O destino deve pertencer a pelo menos um pedido desta carga.
  const { data: naCarga } = await supabase
    .from("shipment_orders")
    .select("id")
    .eq("destination_id", destinationId)
    .eq("shipment_id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!naCarga) {
    return fail("validation_failed", "Destino não pertence a esta carga.", 422, { requestId });
  }

  const agora = new Date().toISOString();
  const { error: erroUpdate } = await supabase
    .from("shipment_destinations")
    .update({
      endereco_recuperado: parsed.data.endereco,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      recuperacao_status: "recuperado",
      confianca: parsed.data.confianca != null ? Number(parsed.data.confianca.toFixed(3)) : null,
      metodo: parsed.data.metodo,
      provedor: parsed.data.provedor,
      recuperado_em: agora,
      geo_status: "ok",
      geo_fonte: `${parsed.data.provedor}:${parsed.data.metodo}`,
      atualizado_em: agora,
    })
    .eq("id", destinationId)
    .eq("organization_id", authz.org.orgId);
  if (erroUpdate) return fail("internal_error", "Erro ao confirmar a recuperação.", 500, { requestId });

  // Histórico append-only da confirmação.
  await supabase.from("shipment_destination_recoveries").insert({
    organization_id: authz.org.orgId,
    destination_id: destinationId,
    tentativa: 0,
    provedor: parsed.data.provedor,
    consulta: "confirmação manual do operador",
    candidato: {
      endereco: parsed.data.endereco,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      metodo: parsed.data.metodo,
      confianca: parsed.data.confianca,
    },
    confianca: parsed.data.confianca,
    motivo: parsed.data.motivo ?? "Confirmado pelo operador.",
    criado_por: authz.user.id,
  });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "shipment.rota.recuperacao_confirmada",
    resourceType: "shipments",
    resourceId: id,
    requestId,
    metadata: { destinationId, endereco: parsed.data.endereco, metodo: parsed.data.metodo },
  });

  return ok({ destinationId, status: "recuperado" }, { requestId });
}
