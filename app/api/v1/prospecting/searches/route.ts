/**
 * POST /api/v1/prospecting/searches — cria uma busca (job).
 * GET  /api/v1/prospecting/searches — lista com progresso.
 *
 * Criar valida, tenta a cache, geocodifica (cidade→coordenadas), estima a
 * grade e recusa grade gigante (cap 2000 células — estado inteiro pede
 * campanha fatiada).
 * Cache (§7): mesmo hash dentro do TTL devolve a busca existente com
 * `do_cache: true`, a menos que `forcar: true`. O hit vem ANTES do geocode —
 * repetição dentro do TTL não paga NEM uma chamada de mapa — e é contado em
 * `prospecting_cache_hits` (§21, FASE 13).
 * Budget guard (§24): provider pago a 100% do teto mensal recusa ANTES do
 * geocode (429) — depois do cache, para nunca barrar dado grátis.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { googlePlacesHabilitado, resolverChaveGoogle } from "@/lib/prospeccao/chave";
import { custoEfetivo } from "@/lib/prospeccao/custos";
import { gerarGrade } from "@/lib/prospeccao/grade";
import { hashDaBusca } from "@/lib/prospeccao/motor";
import { criarProvider } from "@/lib/prospeccao/providers/registro";
import { MENSAGEM_ORCAMENTO_ATINGIDO, orcamentoDoMes, registrarCacheHit } from "@/lib/prospeccao/uso";
import { buscaCreateSchema } from "@/lib/schemas/prospeccao";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TETO_CELULAS = 2000;

/** Default da instalação (§7): "30" é o piso; lixo cai no 30 também. */
function ttlInstalacao(): number {
  const bruto = Number(env.DISCOVERY_CACHE_TTL);
  return Number.isFinite(bruto) && bruto >= 0 ? bruto : 30;
}

async function cfgDaBusca(admin: Awaited<ReturnType<typeof createAdminClient>>, orgId: string) {
  const { data } = await admin
    .from("prospecting_settings")
    .select(
      "cache_ttl_dias, limite_por_busca, provider_ativo, grid_size_km, grid_overlap_pct, " +
        "orcamento_mensal_cents, preco_busca_cents, preco_detalhe_cents",
    )
    .eq("organization_id", orgId)
    .maybeSingle();
  const cfg = data as unknown as {
    cache_ttl_dias: number;
    limite_por_busca: number;
    provider_ativo: string;
    grid_size_km: number;
    grid_overlap_pct: number;
    orcamento_mensal_cents: number | null;
    preco_busca_cents: number | null;
    preco_detalhe_cents: number | null;
  } | null;
  return {
    ttl: cfg?.cache_ttl_dias ?? ttlInstalacao(),
    teto: cfg?.limite_por_busca ?? 500,
    // Mesmo default honesto do motor: sem linha de settings, só o OSM roda.
    providerAtivo: cfg?.provider_ativo ?? "osm_overpass",
    orcamentoMensalCents: cfg?.orcamento_mensal_cents ?? null,
    preco: {
      preco_busca_cents: cfg?.preco_busca_cents ?? null,
      preco_detalhe_cents: cfg?.preco_detalhe_cents ?? null,
    },
    grade: {
      tamanho: Number(cfg?.grid_size_km ?? 5),
      sobreposicao: Number(cfg?.grid_overlap_pct ?? 10),
    },
  };
}

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "prospecting_searches" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospecting_searches")
    .select(
      "id, categorias, cidade, estado, raio_km, max_empresas, provider, status, " +
        "total_celulas, celulas_processadas, encontradas, novas, duplicadas, erros, " +
        "requisicoes, custo_estimado_cents, ultimo_erro, created_at, finished_at",
    )
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    logger.error("[prospecting.searches] falha ao listar as buscas", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error.message,
    });
    return fail("internal_error", "Erro ao listar as buscas.", 500, { requestId });
  }
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_searches" });
  if (!authz.ok) return authz.response;

  const body = await req.json().catch(() => null);
  const parsed = buscaCreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const entrada = parsed.data;
  const forcar = (body as { forcar?: boolean } | null)?.forcar === true;

  if (!entrada.cidade && (entrada.latitude == null || entrada.longitude == null)) {
    return fail("validation_failed", "Informe ao menos a cidade (busca estadual usa campanha).", 422, { requestId });
  }

  const admin = createAdminClient();
  const { ttl, teto, providerAtivo, grade: cfgGrade, orcamentoMensalCents, preco } =
    await cfgDaBusca(admin, authz.org.orgId);
  // Provider escolhido é o da Configuração → Prospecção (a tela nem manda);
  // quem mandar diferente é recusado na hora, igual o motor recusaria depois.
  if (entrada.provider && entrada.provider !== providerAtivo) {
    return fail(
      "validation_failed",
      `Provider ${entrada.provider} desligado nas configurações (Configurações → Prospecção).`,
      422,
      { requestId },
    );
  }
  const provider = providerAtivo;
  if (provider === "maps_browser") {
    return fail(
      "validation_failed",
      "Provider via navegador desligado (esqueleto). Use osm_overpass (grátis) ou google_places.",
      422,
      { requestId },
    );
  }
  if (provider === "google_places" && !googlePlacesHabilitado()) {
    return fail("validation_failed", "GOOGLE_PLACES_ENABLED=false nesta instalação.", 422, { requestId });
  }
  const chave =
    provider === "google_places"
      ? (await resolverChaveGoogle(admin, authz.org.orgId)).chave
      : null;
  if (provider === "google_places" && !chave) {
    return fail(
      "validation_failed",
      "Sem chave do Google (tenant e instalação). Configure em Configurações → Prospecção ou use osm_overpass (grátis).",
      422,
      { requestId },
    );
  }

  // Cache (§7/§30): o hash usa só a entrada (cidade/UF/raio/provider), então o
  // hit vem ANTES do geocode — mesma pesquisa dentro do TTL não paga nem uma
  // chamada de mapa. Grade gigante também: hit não cria job novo.
  const hash = hashDaBusca({
    categorias: entrada.categorias,
    cidade: entrada.cidade ?? entrada.rotulo ?? null,
    estado: entrada.estado ?? null,
    raioKm: entrada.raio_km,
    provider,
    latitude: entrada.latitude ?? null,
    longitude: entrada.longitude ?? null,
  });
  if (!forcar && ttl > 0) {
    const desde = new Date(Date.now() - ttl * 86400000).toISOString();
    const { data: recente } = await admin
      .from("prospecting_searches")
      .select("id, status")
      .eq("organization_id", authz.org.orgId)
      .eq("search_hash", hash)
      .eq("status", "completed")
      .gte("finished_at", desde)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recente) {
      // O hit não cria busca nova, então só esta contagem o registra (§21).
      // Best-effort: falhar a contagem não derruba o dado grátis que devolve.
      await registrarCacheHit(admin, authz.org.orgId, (recente as unknown as { id: string }).id);
      return ok(
        {
          reutilizada: (recente as unknown as { id: string }).id,
          do_cache: true,
          ttl_dias: ttl,
        },
        { requestId },
      );
    }
  }

  // Budget guard (§24): em 100% o provider pago não aceita NOVA consulta —
  // nem a manual. O hit de cache passou antes (dado grátis, não consulta), e a
  // redução de 90% é da AUTOMAÇÃO (motor), não da busca que o operador pediu.
  if (custoEfetivo(provider, preco).busca > 0) {
    const decisao = await orcamentoDoMes(admin, authz.org.orgId, orcamentoMensalCents);
    if (decisao.estado === "bloqueio") {
      return fail("rate_limited", MENSAGEM_ORCAMENTO_ATINGIDO, 429, { requestId });
    }
  }

  // Geocodifica AGORA (falha rápida, não job falho depois de 40 células).
  // OSM usa Nominatim (grátis); Google usa Geocoding (mesma chave).
  // Com coordenadas ("Buscar nesta área"), pula o geocode e usa o ponto.
  let geo: { latitude: number; longitude: number } | null = null;
  if (entrada.latitude != null && entrada.longitude != null) {
    geo = { latitude: entrada.latitude, longitude: entrada.longitude };
  } else {
    let geoProvider;
    try {
      geoProvider = criarProvider(provider, { chaveGoogle: chave ?? "" });
    } catch (e) {
      return fail("validation_failed", e instanceof Error ? e.message : String(e), 422, { requestId });
    }
    geo = (await geoProvider
      .geocodificar?.(
        `${entrada.cidade}${entrada.estado ? `, ${entrada.estado}` : ""}, ${entrada.pais}`,
      )
      .catch(() => null)) ?? null;
  }
  if (!geo) {
    return fail("validation_failed", `Não achei "${entrada.cidade}" no mapa. Confira cidade/UF.`, 422, { requestId });
  }

  // Grade estimada antes de gravar: estado inteiro numa busca só é recusado
  // aqui, com número, em vez de travar a fila por dias.
  const grade = gerarGrade(geo.latitude, geo.longitude, entrada.raio_km, cfgGrade.tamanho, cfgGrade.sobreposicao);
  const totalCelulas = grade.length * entrada.categorias.length;
  if (totalCelulas > TETO_CELULAS) {
    return fail(
      "validation_failed",
      `${totalCelulas} células — acima do teto de ${TETO_CELULAS}. Fatie em campanha (menos raio ou menos categorias por busca).`,
      422,
      { requestId },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospecting_searches")
    .insert({
      organization_id: authz.org.orgId,
      categorias: entrada.categorias,
      cidade: entrada.cidade ?? entrada.rotulo ?? null,
      estado: entrada.estado ?? null,
      pais: entrada.pais,
      latitude: geo.latitude,
      longitude: geo.longitude,
      raio_km: entrada.raio_km,
      max_empresas: Math.min(entrada.max_empresas, teto),
      provider,
      campaign_id: entrada.campaign_id ?? null,
      status: "queued",
      grid_size_km: cfgGrade.tamanho,
      grid_overlap_pct: cfgGrade.sobreposicao,
      total_celulas: totalCelulas,
      search_hash: hash,
      created_by: authz.user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    logger.error("[prospecting.searches] falha ao criar a busca", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error?.message ?? "sem linha devolvida",
    });
    return fail("internal_error", "Erro ao criar a busca.", 500, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "prospecting_search.created",
    resourceType: "prospecting_searches",
    resourceId: (data as unknown as { id: string }).id,
    requestId,
  });

  return ok({ ...(data as unknown as Record<string, unknown>), total_celulas: totalCelulas }, { requestId, status: 201 });
}
