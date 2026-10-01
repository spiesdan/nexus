/**
 * POST /api/v1/prospecting/campaigns/[id]/executar — fã-out controlado.
 *
 * Uma busca queued por cidade (com TODAS as categorias da campanha): N
 * cidades = N buscas, nunca N×M jobs simultâneos fora de controle. Cada busca
 * carrega `campaign_id` e entra na fila normal (o drain processa uma por vez).
 * O provider vem do registro (`criarProvider`) com o `provider_ativo` do
 * tenant — nunca um `new GooglePlacesProvider` direto (B5 da spec 19).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { googlePlacesHabilitado, resolverChaveGoogle } from "@/lib/prospeccao/chave";
import { criarProvider } from "@/lib/prospeccao/providers/registro";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Os mesmos dois com executor ligado que o motor aceita (`motor.ts`). */
const PROVIDERS_COM_EXECUTOR = ["google_places", "osm_overpass"];

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();

  const { data: campanha } = await supabase
    .from("prospecting_campaigns")
    .select("id, categorias, cidades, status")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const camp = campanha as unknown as {
    id: string;
    categorias: string[];
    cidades: { cidade: string; estado?: string }[];
    status: string;
  } | null;
  if (!camp) return fail("not_found", "Campanha não encontrada.", 404, { requestId });
  if (camp.status === "concluida") {
    return fail("validation_failed", "Campanha concluída.", 422, { requestId });
  }

  // Geocodifica no fan-out com o provider ATIVO do tenant (falha rápida
  // nomeando a cidade, não job morto depois). Google sem chave ou desligado =
  // 422 antes de criar qualquer busca.
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("prospecting_settings")
    .select("raio_padrao_km, provider_ativo")
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const cfg = (settings ?? {}) as { raio_padrao_km?: number; provider_ativo?: string | null };
  const raio = cfg.raio_padrao_km ?? 30;
  // Sem linha de settings, o default honesto é o mesmo do motor: osm_overpass.
  const providerAtivo = cfg.provider_ativo ?? "osm_overpass";
  if (!PROVIDERS_COM_EXECUTOR.includes(providerAtivo)) {
    return fail(
      "validation_failed",
      `Provider "${providerAtivo}" sem executor ligado. Use Configurações → Prospecção.`,
      422,
      { requestId },
    );
  }
  let chave: string | null = null;
  if (providerAtivo === "google_places") {
    if (!googlePlacesHabilitado()) {
      return fail("validation_failed", "GOOGLE_PLACES_ENABLED=false nesta instalação.", 422, { requestId });
    }
    chave = (await resolverChaveGoogle(admin, authz.org.orgId)).chave;
    if (!chave) {
      return fail(
        "validation_failed",
        "Sem chave do Google (tenant e instalação). Configure em Configurações → Prospecção.",
        422,
        { requestId },
      );
    }
  }
  let geo;
  try {
    geo = criarProvider(providerAtivo, { chaveGoogle: chave ?? "" });
  } catch (e) {
    return fail("validation_failed", e instanceof Error ? e.message : String(e), 422, { requestId });
  }

  const criadas: string[] = [];
  const semMapa: string[] = [];
  for (const c of camp.cidades) {
    const ponto = (await geo
      .geocodificar?.(`${c.cidade}${c.estado ? `, ${c.estado}` : ""}, BR`)
      .catch(() => null)) ?? null;
    if (!ponto) {
      semMapa.push(c.cidade);
      continue;
    }
    const { data, error } = await supabase
      .from("prospecting_searches")
      .insert({
        organization_id: authz.org.orgId,
        campaign_id: camp.id,
        categorias: camp.categorias,
        cidade: c.cidade,
        estado: c.estado ?? null,
        pais: "BR",
        latitude: ponto.latitude,
        longitude: ponto.longitude,
        raio_km: raio,
        max_empresas: 500,
        provider: providerAtivo,
        status: "queued",
        total_celulas: 0,
        created_by: authz.user.id,
      })
      .select("id")
      .single();
    if (!error && data) criadas.push((data as unknown as { id: string }).id);
  }

  await supabase
    .from("prospecting_campaigns")
    .update({ status: "ativa", ultima_execucao_at: new Date().toISOString() })
    .eq("id", camp.id)
    .eq("organization_id", authz.org.orgId);

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "prospecting_search.created",
    resourceType: "prospecting_campaigns",
    resourceId: camp.id,
    requestId,
  });

  return ok(
    { buscas: criadas.length, ids: criadas, sem_mapa: semMapa },
    { requestId, status: 201 },
  );
}
