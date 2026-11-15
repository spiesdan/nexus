/**
 * POST /api/v1/shipments/[id]/destinos/[destinationId]/entrada/confirmar —
 * o motorista, na porta, confirma "é aqui" (0311).
 *
 * ═══ POR QUE ESTA ROTA EXISTE ═══════════════════════════════════════════════
 *
 * Marcar a entrada é chute informado de quem está no escritório. Quem sabe se
 * o pino é a porta é quem está na frente dela. Sem esta confirmação, a memória
 * de entradas seria um palpite coletivo com boa intenção — e um pino errado com
 * aparência de certo custa mais caro que um pino ausente: o motorista dirige
 * até lá para descobrir.
 *
 * A confirmação faz três coisas, e só três:
 *
 *   1. soma `confirmacoes` na entrada (a procedência do ponto);
 *   2. grava `entrada_confirmada_em`/`_por` no destino (esta entrega conferiu);
 *   3. quando o destino NUNCA teve entrada, cria a entrada com a posição
 *      informada — é o único caso em que a marcação nasce do motorista.
 *
 * O que ela NÃO faz: mover uma entrada existente com base num GPS de rua.
 * Estar a 30 m do portão é normal (o caminhão não entra na calçada), e corrigir
 * o ponto com uma medida só trocaria um erro por outro. Quem quiser mover o
 * ponto marca de novo no mapa.
 *
 * Body: `{ latitude?, longitude? }` — opcional. Serve de semente quando ainda
 * não existe entrada; o app manda a posição do aparelho ao confirmar.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { FONTE_ENTRADA, chaveDoEndereco } from "@/lib/rotas/entradas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; destinationId: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  // O motorista entra com o mesmo papel do operador de expedição: não existe
  // `motorista` em `ROLE_RANK`, e inventar um papel novo seria decisão de
  // segurança disfarçada de rótulo.
  const authz = await requireRole("agent", { requestId, resource: "shipments" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => ({})));
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
    .select("id, endereco, latitude, longitude, geo_status, geo_fonte, entrada_id")
    .eq("id", destinationId)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (erroDestino || !destino) {
    return fail("not_found", "Destino não encontrado.", 404, { requestId });
  }
  const d = destino as {
    id: string;
    endereco: string | null;
    latitude: number | null;
    longitude: number | null;
    geo_status: string;
    geo_fonte: string | null;
    entrada_id: string | null;
  };

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
  const chave = chaveDoEndereco(d.endereco);
  let entradaId = d.entrada_id;

  if (entradaId) {
    // A entrada já existe: soma a procedência. Contador com leitura-e-escrita é
    // aceitável aqui (duas confirmações simultâneas do mesmo endereço perderiam
    // uma unidade, nunca o ponto).
    const { data: atual } = await supabase
      .from("endereco_entradas")
      .select("confirmacoes")
      .eq("id", entradaId)
      .eq("organization_id", authz.org.orgId)
      .maybeSingle();
    const confirmacoes = Number((atual as { confirmacoes: number } | null)?.confirmacoes ?? 0);
    const { error: erroConfirma } = await supabase
      .from("endereco_entradas")
      .update({
        confirmacoes: confirmacoes + 1,
        confirmado_em: agora,
        confirmado_por: authz.user.id,
        atualizado_em: agora,
      })
      .eq("id", entradaId)
      .eq("organization_id", authz.org.orgId);
    if (erroConfirma) {
      return fail("internal_error", "Erro ao confirmar a entrada.", 500, { requestId });
    }
  } else {
    // Primeira entrada deste endereço — e a única vez em que a posição do
    // motorista vira o ponto. Sem coordenada nenhuma não existe entrada: o
    // destino fica confirmado como entrega, mas o aviso de pino continua.
    const lat = d.latitude ?? parsed.data.latitude ?? null;
    const lng = d.longitude ?? parsed.data.longitude ?? null;
    if (chave && lat != null && lng != null) {
      const { data: entrada, error: erroEntrada } = await supabase
        .from("endereco_entradas")
        .upsert(
          {
            organization_id: authz.org.orgId,
            endereco_normalizado: chave,
            endereco: d.endereco,
            latitude: lat,
            longitude: lng,
            marcado_por: authz.user.id,
            marcado_em: agora,
            confirmacoes: 1,
            confirmado_em: agora,
            confirmado_por: authz.user.id,
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
  }

  const { error: erroDestinoUpdate } = await supabase
    .from("shipment_destinations")
    .update({
      entrada_id: entradaId,
      // O pino passou a ser a porta: se veio da confirmação do motorista, a
      // fonte tem de dizer isso — não pode continuar `nominatim:cidade`.
      ...(entradaId && d.geo_fonte !== FONTE_ENTRADA
        ? { geo_fonte: FONTE_ENTRADA, geo_status: "ok", geo_em: agora }
        : {}),
      entrada_confirmada_em: agora,
      entrada_confirmada_por: authz.user.id,
    })
    .eq("id", destinationId)
    .eq("organization_id", authz.org.orgId);
  if (erroDestinoUpdate) {
    return fail("internal_error", "Erro ao confirmar o destino.", 500, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "shipment.rota.entrada_confirmada",
    resourceType: "shipments",
    resourceId: id,
    requestId,
    metadata: { destination_id: destinationId, entrada_id: entradaId, entrada_nova: !d.entrada_id },
  });

  return ok(
    {
      destination_id: destinationId,
      entrada_id: entradaId,
      /** false = não havia endereço para memorizar; a confirmação vale só aqui. */
      memorizada: Boolean(entradaId),
    },
    { requestId },
  );
}
