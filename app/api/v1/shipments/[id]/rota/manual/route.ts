/**
 * POST /api/v1/shipments/[id]/rota/manual — o operador marca no mapa.
 *
 * `{ destination_id, latitude, longitude }` — ou `contact_id` em carga anterior
 * à migration 0308: grava `ok/manual`. Só vale para destino COM parada nesta
 * carga: o body não inventa ponto de entrega.
 *
 * O pino mora no DESTINO, não no cliente. Antes disto, marcar a segunda entrega
 * de um cliente movia também a primeira — as duas compartilhavam o contato.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { carregarCargaComParadas } from "../_carga";

export const dynamic = "force-dynamic";

const corpoSchema = z
  .object({
    destination_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().optional(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .refine((c) => Boolean(c.destination_id ?? c.contact_id), {
    message: "Informe destination_id (ou contact_id em carga legada).",
  });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
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

  const { id } = await params;
  const supabase = await createClient();
  const d = await carregarCargaComParadas(supabase, authz.org.orgId, id);
  if (!d) return fail("not_found", "Carga não encontrada.", 404, { requestId });
  const alvo = d.paradas.find((p) =>
    parsed.data.destination_id
      ? p.destination_id === parsed.data.destination_id
      : p.contact_id === parsed.data.contact_id,
  );
  if (!alvo) {
    return fail("validation_failed", "Destino sem parada nesta carga.", 422, { requestId });
  }

  const patch = {
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    geo_status: "ok",
    geo_em: new Date().toISOString(),
    geo_fonte: "manual",
  };
  const { error } = alvo.destination_id
    ? await supabase
        .from("shipment_destinations")
        .update(patch)
        .eq("id", alvo.destination_id)
        .eq("organization_id", authz.org.orgId)
    : await supabase
        .from("contacts")
        .update(patch)
        .eq("id", alvo.contact_id as string)
        .eq("organization_id", authz.org.orgId);
  if (error) return fail("internal_error", "Erro ao gravar a posição.", 500, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "shipment.rota.posicao_manual",
    resourceType: "shipments",
    resourceId: id,
    requestId,
  });

  return ok({ destination_id: alvo.destination_id, contact_id: alvo.contact_id }, { requestId });
}
