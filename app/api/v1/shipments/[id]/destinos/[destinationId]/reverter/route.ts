/**
 * POST /api/v1/shipments/[id]/destinos/[destinationId]/reverter — desfaz uma
 * recuperação aceita. Volta o destino ao `endereco_original` com
 * `recuperacao_status = 'nao_tentada'` e coordenada zerada.
 *
 * Nada é apagado: o histórico de recuperações é append-only e a reversão
 * gera mais uma linha nele.
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
    .select("id, organization_id, endereco_original, recuperacao_status")
    .eq("id", destinationId)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (erroDestino || !destino) {
    return fail("not_found", "Destino não encontrado.", 404, { requestId });
  }

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
      endereco_recuperado: null,
      latitude: null,
      longitude: null,
      recuperacao_status: "nao_tentada",
      confianca: null,
      metodo: null,
      provedor: null,
      recuperado_em: null,
      geo_status: "pendente",
      geo_fonte: null,
      atualizado_em: agora,
    })
    .eq("id", destinationId)
    .eq("organization_id", authz.org.orgId);
  if (erroUpdate) return fail("internal_error", "Erro ao reverter a recuperação.", 500, { requestId });

  await supabase.from("shipment_destination_recoveries").insert({
    organization_id: authz.org.orgId,
    destination_id: destinationId,
    tentativa: 0,
    provedor: "manual",
    consulta: "reversão manual do operador",
    candidato: null,
    confianca: null,
    motivo: parsed.data.motivo ?? "Revertido pelo operador.",
    criado_por: authz.user.id,
  });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "shipment.rota.recuperacao_revertida",
    resourceType: "shipments",
    resourceId: id,
    requestId,
    metadata: { destinationId, motivo: parsed.data.motivo },
  });

  return ok({ destinationId, status: "nao_tentada" }, { requestId });
}
