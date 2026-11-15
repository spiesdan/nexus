/**
 * POST /api/v1/shipments/[id]/rota/manual — alguém que conhece o local marca a
 * ENTRADA do endereço (0311).
 *
 * `{ destination_id, latitude, longitude, referencia? }` — ou `contact_id` em
 * carga anterior à migration 0308. Só vale para destino COM parada nesta carga:
 * o body não inventa ponto de entrega.
 *
 * O que mudou em 0311, e por quê:
 *
 *   - o pino do destino continua sendo gravado aqui, mas com `geo_fonte =
 *     'entrada'` e não mais `'manual'`. `manual` era indistinguível de "o
 *     geocoder foi corrigido à mão" — quem lia `ok/manual` não sabia se havia
 *     alguém por trás do ponto nem quando.
 *   - a marcação também vira MEMÓRIA (`endereco_entradas`), chaveada pelo
 *     endereço normalizado. Marcar uma vez resolve as próximas cargas do mesmo
 *     endereço: 37% dos destinos não têm número e nenhum geocodificador acha a
 *     porta deles, então refazer o trabalho toda semana é o custo que a memória
 *     elimina.
 *   - `referencia` é o que o mapa não conta ("portão azul", "entrada pelos
 *     fundos"). Vai para a entrada, não para o cadastro do cliente.
 *
 * O pino mora no DESTINO, não no cliente. Antes de 0308, marcar a segunda
 * entrega de um cliente movia também a primeira — as duas compartilhavam o
 * contato.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { FONTE_ENTRADA, chaveDoEndereco } from "@/lib/rotas/entradas";
import { createClient } from "@/lib/supabase/server";

import { carregarCargaComParadas } from "../_carga";

export const dynamic = "force-dynamic";

const corpoSchema = z
  .object({
    destination_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().optional(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    /** "portão azul", "entrada pelos fundos" — texto curto, lido pelo motorista. */
    referencia: z.string().trim().max(160).optional(),
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

  const agora = new Date().toISOString();
  const referencia = parsed.data.referencia?.trim() || null;
  const chave = chaveDoEndereco(alvo.endereco);

  // 1) A MEMÓRIA — o endereço passa a ter entrada conhecida para as próximas
  // cargas. Sem endereço não há chave: aí o pino existe só para esta carga, e
  // a resposta diz que não houve memória (`entrada_id: null`).
  let entradaId: string | null = null;
  if (chave) {
    const { data: entrada, error: erroEntrada } = await supabase
      .from("endereco_entradas")
      .upsert(
        {
          organization_id: authz.org.orgId,
          endereco_normalizado: chave,
          endereco: alvo.endereco,
          latitude: parsed.data.latitude,
          longitude: parsed.data.longitude,
          referencia,
          marcado_por: authz.user.id,
          marcado_em: agora,
          atualizado_em: agora,
        },
        { onConflict: "organization_id,endereco_normalizado" },
      )
      .select("id")
      .single();
    if (erroEntrada) {
      return fail("internal_error", "Erro ao gravar a entrada do endereço.", 500, { requestId });
    }
    entradaId = (entrada as { id: string } | null)?.id ?? null;
  }

  // 2) O PINO DO DESTINO — o que o mapa desenha nesta carga.
  const patch = {
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    geo_status: "ok",
    geo_em: agora,
    geo_fonte: FONTE_ENTRADA,
  };
  const { error } = alvo.destination_id
    ? await supabase
        .from("shipment_destinations")
        .update({ ...patch, entrada_id: entradaId })
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
    action: "shipment.rota.entrada_marcada",
    resourceType: "shipments",
    resourceId: id,
    requestId,
    metadata: {
      destination_id: alvo.destination_id ?? null,
      contact_id: alvo.contact_id ?? null,
      endereco_normalizado: chave,
      entrada_id: entradaId,
      tem_referencia: Boolean(referencia),
    },
  });

  return ok({ destination_id: alvo.destination_id, contact_id: alvo.contact_id, entrada_id: entradaId }, { requestId });
}
