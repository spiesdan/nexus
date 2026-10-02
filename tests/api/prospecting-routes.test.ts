/**
 * B13 da spec 19 — a Prospecção ganha teste de rota/API (FASE 14).
 *
 * Contra os handlers REAIS, com auth e Supabase mockados (molde
 * `tests/api/followup-enrollments.test.ts`). O que este arquivo cobre do
 * checklist da FASE 14:
 *
 * - cache/TTL: o hit vem ANTES do geocode e ANTES do orçamento — repetição
 *   dentro do TTL não paga mapa nem teto, e o hit é contado na tabela nova;
 * - budget (§24): 100% em provider pago recusa com a mensagem LITERAL em
 *   429 rate_limited, antes do geocode e sem insert; 95% (redução) não
 *   barra a busca manual; o provider grátis/préço 0 segue direto;
 * - provider: mandado diferente do ativo é recusado na hora, maps_browser
 *   é esqueleto, Google desligado na instalação nomeia a env;
 * - permissões: POST de busca é agent+, config e consumo são manager+,
 *   listagem é viewer+ (o mesmo degradê do resto da API);
 * - filtros da lista: minha_fila nasce no authz e ignora query string de
 *   dono, busca_id de outra org devolve lista vazia (sem confirmar
 *   existência), id/busca_id não-uuid em 400, status fora do vocabulário
 *   cai fora em silêncio (vocabulário do Radar, FASE 11);
 * - fila: PATCH espelha a próxima ação em `commercial_tasks` (FASE 12) e
 *   DELETE cancela a espelhada antes de apagar.
 *
 * FASE 15 (B3/N+1/B15): paginação de verdade (offset + meta.total/has_more +
 * ordem estável score desc/id asc), funil em lote nas duas listas de campanha
 * (`com_funil=1`, com o fallback que não derruba a lista), mercado em modo
 * lote (`?cidades` de uma vez no lugar de uma request por cidade) e os
 * `logger.error` dos 500 das rotas do módulo.
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import * as rotaCampanhasVa from "@/app/api/v1/automatic-sales/campaigns/route";
import * as rotaCampanhas from "@/app/api/v1/prospecting/campaigns/route";
import * as rotaConsumo from "@/app/api/v1/prospecting/consumo/route";
import * as rotaMercado from "@/app/api/v1/prospecting/mercado/route";
import * as rotaProspect from "@/app/api/v1/prospecting/prospects/[id]/route";
import * as rotaProspects from "@/app/api/v1/prospecting/prospects/route";
import * as rotaSearches from "@/app/api/v1/prospecting/searches/route";
import * as rotaSettings from "@/app/api/v1/prospecting/settings/route";
import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { canonicalPhoneBR } from "@/lib/channels/phone-variants";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { googlePlacesHabilitado, resolverChaveGoogle } from "@/lib/prospeccao/chave";
import { hashDaBusca } from "@/lib/prospeccao/motor";
import { MENSAGEM_ORCAMENTO_ATINGIDO } from "@/lib/prospeccao/uso";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

const geocodificar = vi.hoisted(
  () => vi.fn(async () => ({ latitude: -26.3049, longitude: -48.8474 })),
);

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/prospeccao/chave", () => ({
  googlePlacesHabilitado: vi.fn(() => true),
  resolverChaveGoogle: vi.fn(async () => ({ chave: "AIza-teste", origem: "instalacao" })),
}));
vi.mock("@/lib/prospeccao/providers/registro", () => ({
  criarProvider: vi.fn(() => ({ geocodificar })),
}));
vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: vi.fn(async () => "CIFRA_TESTE"),
  decryptWebhookSecret: vi.fn(async () => "texto-claro"),
  encryptRuleActionSecrets: vi.fn(async () => undefined),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const OUTRO_ORG_ID = "22222222-2222-4222-8222-999999999999";
const OUTRO_USER_ID = "11111111-1111-4111-8111-999999999999";
const PROSPECT_A = "33333333-3333-4333-8333-333333333333";
const PROSPECT_B = "33333333-3333-4333-8333-444444444444";
const BUSCA_ID = "55555555-5555-4555-8555-555555555555";
const BUSCA_OUTRA_ORG = "55555555-5555-4555-8555-999999999999";
const CONTATO_ID = "66666666-6666-4666-8666-666666666666";
const PROSPECT_C = "33333333-3333-4333-8333-555555555555";
const CAMPANHA_ID = "44444444-4444-4444-8444-444444444444";
const CAMPANHA_VA_ID = "44444444-4444-4444-8444-555555555555";
const PEDIDO_ID = "77777777-7777-4777-8777-777777777777";

type Row = Record<string, unknown>;

type Filtro = { op: string; col: string; val: unknown };

/** Divide as cláusulas de um `.or()` respeitando parênteses (`in.(a,b)`). */
function clausulasOu(bruto: string): Filtro[] {
  const partes: string[] = [];
  let atual = "";
  let profundidade = 0;
  for (const ch of bruto) {
    if (ch === "(") profundidade += 1;
    if (ch === ")") profundidade -= 1;
    if (ch === "," && profundidade === 0) {
      partes.push(atual);
      atual = "";
      continue;
    }
    atual += ch;
  }
  if (atual.trim() !== "") partes.push(atual);
  return partes.map((parte) => {
    const i1 = parte.indexOf(".");
    const i2 = parte.indexOf(".", i1 + 1);
    return { op: parte.slice(i1 + 1, i2), col: parte.slice(0, i1), val: parte.slice(i2 + 1) };
  });
}

/**
 * Supabase falso em memória: registra filtros e modos, executa no await.
 * Cobre exatamente o dialeto das rotas de prospecção (eq/gte/in/is/not/
 * ilike/or + order/limit/head + insert/upsert/update/delete + single).
 */
function makeDb(seed: Record<string, Row[]> = {}) {
  const tabelas: Record<string, Row[]> = { ...seed };
  const inseridos: Array<{ tabela: string; row: Row }> = [];
  const comErro = new Set<string>();

  function avaliar(r: Row, f: Filtro): boolean {
    const a = r[f.col];
    switch (f.op) {
      case "eq":
        return a === f.val;
      case "gte": {
        if (typeof a === "number" && typeof f.val === "number") return a >= f.val;
        return String(a ?? "") >= String(f.val ?? "");
      }
      case "neq":
        return a !== f.val;
      case "is":
        return f.val === null ? a === null || a === undefined : a === f.val;
      case "not_is":
        return f.val === null ? a !== null && a !== undefined : a !== f.val;
      case "in": {
        const lista = Array.isArray(f.val)
          ? f.val
          : String(f.val).replace(/^\(/, "").replace(/\)$/, "").split(",");
        return lista.some((x) => String(x).trim() === String(a));
      }
      case "ilike": {
        const padrao = String(f.val).replace(/%/g, "").toLowerCase();
        return String(a ?? "").toLowerCase().includes(padrao);
      }
      case "ou":
        return clausulasOu(String(f.val)).some((c) => avaliar(r, c));
      default:
        return false;
    }
  }

  function builder(tabela: string) {
    const filtros: Filtro[] = [];
    let modo: "select" | "insert" | "upsert" | "update" | "delete" = "select";
    let payload: Row | undefined;
    let querSelect = false;
    let head = false;
    // Cadeia de ordenação (PostgREST aceita vários .order; o primeiro é o
    // primário) — estável na ordem de chamada (B3: score desc, id asc).
    const ordens: Array<{ col: string; asc: boolean }> = [];
    let intervalo: { inicio: number; fim: number } | null = null;
    let limite: number | null = null;

    const casa = (l: Row) => filtros.every((f) => avaliar(l, f));

    async function executar(): Promise<{
      data: Row[] | null;
      error: { message: string } | null;
      count?: number | null;
    }> {
      if (comErro.has(tabela)) return { data: null, error: { message: `falha simulada em ${tabela}` } };
      const linhas = tabelas[tabela] ?? (tabelas[tabela] = []);

      if (modo === "insert" || modo === "upsert") {
        const corpo = payload ?? {};
        let row: Row;
        if (modo === "upsert") {
          const alvo = linhas.find(casa);
          if (alvo) {
            Object.assign(alvo, corpo);
            row = alvo;
          } else {
            row = { id: randomUUID(), ...corpo };
            linhas.push(row);
          }
        } else {
          row = { id: randomUUID(), ...corpo };
          linhas.push(row);
        }
        inseridos.push({ tabela, row });
        return { data: [row], error: null };
      }

      if (modo === "update") {
        const alvos = linhas.filter(casa);
        for (const l of alvos) Object.assign(l, payload ?? {});
        return { data: querSelect ? alvos : null, error: null };
      }

      if (modo === "delete") {
        const alvos = linhas.filter(casa);
        tabelas[tabela] = linhas.filter((l) => !alvos.includes(l));
        return { data: querSelect ? alvos : null, error: null };
      }

      let lista = linhas.filter(casa);
      // head = contagem exata do recorte (PostgREST ignora range/limit no count).
      if (head) return { data: null, error: null, count: lista.length };
      if (ordens.length > 0) {
        // Aplica do último ao primeiro: o sort estável deixa o primeiro
        // .order() como primário.
        for (const { col, asc } of [...ordens].reverse()) {
          lista = [...lista].sort((x, y) => {
            const a = x[col];
            const b = y[col];
            let cmp: number;
            if (typeof a === "number" && typeof b === "number") cmp = a - b;
            else cmp = String(a ?? "") < String(b ?? "") ? -1 : String(a ?? "") > String(b ?? "") ? 1 : 0;
            return asc ? cmp : -cmp;
          });
        }
      }
      if (intervalo) lista = lista.slice(intervalo.inicio, intervalo.fim + 1);
      if (limite !== null) lista = lista.slice(0, limite);
      return { data: lista, error: null, count: lista.length };
    }

    const b = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        querSelect = true;
        if (opts?.head) head = true;
        return b;
      },
      insert(obj: Row) {
        modo = "insert";
        payload = obj;
        return b;
      },
      upsert(obj: Row, _opts?: unknown) {
        modo = "upsert";
        payload = obj;
        return b;
      },
      update(obj: Row) {
        modo = "update";
        payload = obj;
        return b;
      },
      delete() {
        modo = "delete";
        return b;
      },
      eq(col: string, val: unknown) {
        filtros.push({ op: "eq", col, val });
        return b;
      },
      neq(col: string, val: unknown) {
        filtros.push({ op: "neq", col, val });
        return b;
      },
      gte(col: string, val: unknown) {
        filtros.push({ op: "gte", col, val });
        return b;
      },
      in(col: string, val: unknown[]) {
        filtros.push({ op: "in", col, val });
        return b;
      },
      is(col: string, val: unknown) {
        filtros.push({ op: "is", col, val });
        return b;
      },
      not(col: string, operador: string, val: unknown) {
        filtros.push({ op: operador === "is" ? "not_is" : "neq", col, val });
        return b;
      },
      ilike(col: string, val: string) {
        filtros.push({ op: "ilike", col, val });
        return b;
      },
      or(bruto: string) {
        filtros.push({ op: "ou", col: "", val: bruto });
        return b;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        ordens.push({ col, asc: opts?.ascending ?? true });
        return b;
      },
      range(inicio: number, fim: number) {
        intervalo = { inicio, fim };
        return b;
      },
      limit(n: number) {
        limite = n;
        return b;
      },
      async maybeSingle() {
        const r = await executar();
        if (r.error) return { data: null, error: r.error };
        return { data: r.data && r.data.length > 0 ? r.data[0] : null, error: null };
      },
      async single() {
        const r = await executar();
        if (r.error) return { data: null, error: r.error };
        if (!r.data || r.data.length !== 1) {
          return { data: null, error: { message: "expected a single row" } };
        }
        return { data: r.data[0], error: null };
      },
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return Promise.resolve(executar()).then(onF, onR);
      },
    };
    return b;
  }

  return {
    from: builder,
    inseridos,
    comErroEm: (tabela: string) => comErro.add(tabela),
    tabelas,
  };
}

type Db = ReturnType<typeof makeDb>;

function session(effectiveRole: Role, db: Db) {
  const user: AuthUser = {
    id: USER_ID,
    email: "vendedor@example.com",
    full_name: null,
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG_ID, organization_name: "Org", role: effectiveRole }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) => {
    if (ROLE_RANK[effectiveRole] >= ROLE_RANK[min]) {
      return { ok: true, user, org: { orgId: ORG_ID, name: "Org", role: effectiveRole } };
    }
    return { ok: false, response: fail("forbidden_role", `Requer role >= ${min}.`, 403, {}) };
  });
  vi.mocked(createClient).mockResolvedValue(db as never);
  vi.mocked(createAdminClient).mockReturnValue(db as never);
}

function req(metodo: string, body?: unknown, url = "http://localhost/api/v1/prospecting/searches") {
  return new NextRequest(url, {
    method: metodo,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const CFG_OSM: Row = {
  organization_id: ORG_ID,
  cache_ttl_dias: 30,
  limite_por_busca: 500,
  provider_ativo: "osm_overpass",
  grid_size_km: 5,
  grid_overlap_pct: 10,
  orcamento_mensal_cents: null,
  preco_busca_cents: null,
  preco_detalhe_cents: null,
};

const BUSCA_VALIDA = { categorias: ["restaurantes"], cidade: "Joinville", estado: "SC", raio_km: 10 };

function prospecto(overrides: Row = {}): Row {
  return {
    id: PROSPECT_A,
    organization_id: ORG_ID,
    nome: "Restaurante Bom Sabor",
    categoria: "restaurante",
    cidade: "Joinville",
    estado: "SC",
    telefone: null,
    email: null,
    website: null,
    whatsapp_potencial: false,
    nota: 4.2,
    total_avaliacoes: 10,
    provider: "osm_overpass",
    status_comercial: "novo",
    score: 70,
    contact_id: null,
    lead_id: null,
    do_not_contact: false,
    bloqueado: false,
    latitude: null,
    longitude: null,
    endereco: null,
    discovered_at: "2026-09-01T00:00:00.000Z",
    owner_user_id: null,
    proximo_passo: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(googlePlacesHabilitado).mockReturnValue(true);
  vi.mocked(resolverChaveGoogle).mockResolvedValue({ chave: "AIza-teste", origem: "instalacao" });
  vi.mocked(encryptWebhookSecret).mockResolvedValue("CIFRA_TESTE");
  geocodificar.mockImplementation(async () => ({ latitude: -26.3049, longitude: -48.8474 }));
});

describe("POST /api/v1/prospecting/searches — cache, budget e provider", () => {
  it("viewer → 403 (criar busca é papel de agent), sem geocode nem insert", async () => {
    const db = makeDb({ prospecting_settings: [CFG_OSM] });
    session("viewer", db);
    const res = await rotaSearches.POST(req("POST", BUSCA_VALIDA));
    expect(res.status).toBe(403);
    expect(geocodificar).not.toHaveBeenCalled();
    expect(db.inseridos).toHaveLength(0);
  });

  it("sem cidade e sem coordenadas → 422 validation_failed", async () => {
    const db = makeDb({ prospecting_settings: [CFG_OSM] });
    session("agent", db);
    const res = await rotaSearches.POST(req("POST", { categorias: ["restaurantes"] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("validation_failed");
  });

  it("provider mandado diferente do ativo → 422 nomeando a config", async () => {
    const db = makeDb({ prospecting_settings: [{ ...CFG_OSM, provider_ativo: "google_places" }] });
    session("agent", db);
    const res = await rotaSearches.POST(req("POST", { ...BUSCA_VALIDA, provider: "osm_overpass" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toContain("Provider osm_overpass desligado");
  });

  it("provider ativo maps_browser → 422 (esqueleto, nem geocodifica)", async () => {
    const db = makeDb({ prospecting_settings: [{ ...CFG_OSM, provider_ativo: "maps_browser" }] });
    session("agent", db);
    const res = await rotaSearches.POST(req("POST", BUSCA_VALIDA));
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toContain("via navegador");
    expect(geocodificar).not.toHaveBeenCalled();
  });

  it("Google desligado na instalação → 422 nomeando a env", async () => {
    const db = makeDb({ prospecting_settings: [{ ...CFG_OSM, provider_ativo: "google_places" }] });
    session("agent", db);
    vi.mocked(googlePlacesHabilitado).mockReturnValue(false);
    const res = await rotaSearches.POST(req("POST", BUSCA_VALIDA));
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toContain("GOOGLE_PLACES_ENABLED=false");
  });

  it("hit dentro do TTL → 200 do_cache, sem geocode, SEM insert de busca nova e hit contado", async () => {
    const hash = hashDaBusca({
      categorias: ["restaurantes"],
      cidade: "Joinville",
      estado: "SC",
      raioKm: 10,
      provider: "osm_overpass",
      latitude: null,
      longitude: null,
    });
    const db = makeDb({
      prospecting_settings: [CFG_OSM],
      prospecting_searches: [
        {
          id: BUSCA_ID,
          organization_id: ORG_ID,
          status: "completed",
          search_hash: hash,
          finished_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
    });
    session("agent", db);
    const res = await rotaSearches.POST(req("POST", BUSCA_VALIDA));
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.data.do_cache).toBe(true);
    expect(corpo.data.reutilizada).toBe(BUSCA_ID);
    expect(geocodificar).not.toHaveBeenCalled();
    const buscasNovas = db.inseridos.filter((i) => i.tabela === "prospecting_searches");
    expect(buscasNovas).toHaveLength(0);
    const hits = db.inseridos.filter((i) => i.tabela === "prospecting_cache_hits");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.row).toMatchObject({ organization_id: ORG_ID, search_id: BUSCA_ID });
  });

  it("forcar: true passa reto pela cache e cria busca nova (201)", async () => {
    const hash = hashDaBusca({
      categorias: ["restaurantes"],
      cidade: "Joinville",
      estado: "SC",
      raioKm: 10,
      provider: "osm_overpass",
      latitude: null,
      longitude: null,
    });
    const db = makeDb({
      prospecting_settings: [CFG_OSM],
      prospecting_searches: [
        {
          id: BUSCA_ID,
          organization_id: ORG_ID,
          status: "completed",
          search_hash: hash,
          finished_at: new Date().toISOString(),
        },
      ],
    });
    session("agent", db);
    const res = await rotaSearches.POST(req("POST", { ...BUSCA_VALIDA, forcar: true }));
    expect(res.status).toBe(201);
    expect(db.inseridos.filter((i) => i.tabela === "prospecting_searches")).toHaveLength(1);
    expect(db.inseridos.filter((i) => i.tabela === "prospecting_cache_hits")).toHaveLength(0);
  });

  it("orçamento em 100% (provider pago) → 429 rate_limited com a mensagem literal, antes do geocode", async () => {
    const db = makeDb({
      prospecting_settings: [
        { ...CFG_OSM, provider_ativo: "google_places", orcamento_mensal_cents: 1000, preco_busca_cents: 100 },
      ],
      prospecting_searches: [
        { id: randomUUID(), organization_id: ORG_ID, created_at: new Date().toISOString(), custo_estimado_cents: 1000 },
      ],
    });
    session("agent", db);
    const res = await rotaSearches.POST(req("POST", BUSCA_VALIDA));
    expect(res.status).toBe(429);
    const corpo = await res.json();
    expect(corpo.error.code).toBe("rate_limited");
    expect(corpo.error.message).toBe(MENSAGEM_ORCAMENTO_ATINGIDO);
    expect(geocodificar).not.toHaveBeenCalled();
    expect(db.inseridos.filter((i) => i.tabela === "prospecting_searches")).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it("o hit de cache NUNCA é barrado pelo orçamento em 100% (dado grátis passa)", async () => {
    const hash = hashDaBusca({
      categorias: ["restaurantes"],
      cidade: "Joinville",
      estado: "SC",
      raioKm: 10,
      provider: "google_places",
      latitude: null,
      longitude: null,
    });
    const db = makeDb({
      prospecting_settings: [
        { ...CFG_OSM, provider_ativo: "google_places", orcamento_mensal_cents: 1000, preco_busca_cents: 100 },
      ],
      prospecting_searches: [
        {
          id: BUSCA_ID,
          organization_id: ORG_ID,
          status: "completed",
          search_hash: hash,
          finished_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          custo_estimado_cents: 1000,
        },
      ],
    });
    session("agent", db);
    const res = await rotaSearches.POST(req("POST", BUSCA_VALIDA));
    expect(res.status).toBe(200);
    expect((await res.json()).data.do_cache).toBe(true);
  });

  it("orçamento em 95% (redução da seção 24) não barra a busca manual → 201", async () => {
    const db = makeDb({
      prospecting_settings: [
        { ...CFG_OSM, provider_ativo: "google_places", orcamento_mensal_cents: 1000, preco_busca_cents: 100 },
      ],
      prospecting_searches: [
        { id: randomUUID(), organization_id: ORG_ID, created_at: new Date().toISOString(), custo_estimado_cents: 950 },
      ],
    });
    session("agent", db);
    const res = await rotaSearches.POST(req("POST", BUSCA_VALIDA));
    expect(res.status).toBe(201);
    expect(db.inseridos.filter((i) => i.tabela === "prospecting_searches")).toHaveLength(1);
  });

  it("sucesso OSM → 201 com total_celulas e audit prospecting_search.created", async () => {
    const db = makeDb({ prospecting_settings: [CFG_OSM] });
    session("agent", db);
    const res = await rotaSearches.POST(req("POST", BUSCA_VALIDA));
    expect(res.status).toBe(201);
    const corpo = await res.json();
    expect(corpo.data.id).toBeTruthy();
    expect(corpo.data.total_celulas).toBeGreaterThan(0);
    expect(corpo.data.status).toBe("queued");
    expect(corpo.data.provider).toBe("osm_overpass");
    expect(db.inseridos.filter((i) => i.tabela === "prospecting_searches")).toHaveLength(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "prospecting_search.created", organizationId: ORG_ID }),
    );
  });
});

describe("GET /api/v1/prospecting/searches — lista", () => {
  it("viewer → 200 só com as buscas da própria org", async () => {
    const db = makeDb({
      prospecting_searches: [
        { id: BUSCA_ID, organization_id: ORG_ID, status: "completed", created_at: "2026-09-30T10:00:00.000Z" },
        { id: BUSCA_OUTRA_ORG, organization_id: OUTRO_ORG_ID, status: "completed", created_at: "2026-09-30T11:00:00.000Z" },
      ],
    });
    session("viewer", db);
    const res = await rotaSearches.GET(req("GET", undefined, "http://localhost/api/v1/prospecting/searches"));
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.data.map((l: Row) => l.id)).toEqual([BUSCA_ID]);
  });
});

describe("GET/PUT /api/v1/prospecting/settings — config", () => {
  it("GET de viewer → 403 (config é de manager)", async () => {
    session("viewer", makeDb());
    const res = await rotaSettings.GET(req("GET", undefined, "http://localhost/api/v1/prospecting/settings"));
    expect(res.status).toBe(403);
  });

  it("GET sem linha → configurado: false", async () => {
    session("manager", makeDb());
    const res = await rotaSettings.GET(req("GET", undefined, "http://localhost/api/v1/prospecting/settings"));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ configurado: false });
  });

  it("GET com chave cifrada → a chave NUNCA volta, só tem_chave", async () => {
    const db = makeDb({
      prospecting_settings: [{ ...CFG_OSM, google_api_key_encrypted: "CIFRA_TESTE" }],
    });
    session("manager", db);
    const res = await rotaSettings.GET(req("GET", undefined, "http://localhost/api/v1/prospecting/settings"));
    const corpo = await res.json();
    expect(corpo.data.configurado).toBe(true);
    expect(corpo.data.tem_chave).toBe(true);
    expect(corpo.data.google_api_key_encrypted).toBeUndefined();
    expect(JSON.stringify(corpo.data)).not.toContain("CIFRA_TESTE");
  });

  it("PUT de agent → 403, sem gravação", async () => {
    const db = makeDb({ prospecting_settings: [CFG_OSM] });
    session("agent", db);
    const res = await rotaSettings.PUT(req("PUT", { orcamento_mensal_cents: 1000 }, "http://localhost/api/v1/prospecting/settings"));
    expect(res.status).toBe(403);
    expect(db.inseridos).toHaveLength(0);
  });

  it("PUT com orçamento negativo → 422 (o constraint da seção 24 já nasce no schema)", async () => {
    session("manager", makeDb({ prospecting_settings: [CFG_OSM] }));
    const res = await rotaSettings.PUT(req("PUT", { orcamento_mensal_cents: -1 }, "http://localhost/api/v1/prospecting/settings"));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("validation_failed");
  });

  it("PUT válido grava centavos, cifra a chave e audita (upsert na org)", async () => {
    const db = makeDb({ prospecting_settings: [{ ...CFG_OSM }] });
    session("manager", db);
    const res = await rotaSettings.PUT(
      req(
        "PUT",
        {
          provider_ativo: "google_places",
          orcamento_mensal_cents: 5000,
          preco_busca_cents: 40,
          preco_detalhe_cents: 150,
          google_api_key: "chave-publica-do-google-123",
        },
        "http://localhost/api/v1/prospecting/settings",
      ),
    );
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.data.configurado).toBe(true);
    expect(corpo.data.orcamento_mensal_cents).toBe(5000);
    const linhas = db.tabelas.prospecting_settings ?? [];
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      organization_id: ORG_ID,
      provider_ativo: "google_places",
      orcamento_mensal_cents: 5000,
      preco_busca_cents: 40,
      preco_detalhe_cents: 150,
      google_api_key_encrypted: "CIFRA_TESTE",
    });
    expect(linhas[0]).not.toHaveProperty("google_api_key");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "prospecting_settings.updated" }),
    );
  });
});

describe("GET /api/v1/prospecting/consumo — painel §21", () => {
  it("de agent → 403 (consumo mora junto da config)", async () => {
    session("agent", makeDb());
    const res = await rotaConsumo.GET(req("GET", undefined, "http://localhost/api/v1/prospecting/consumo"));
    expect(res.status).toBe(403);
  });

  it("manager → 200 com a régua do §21: consultas, hits, misses, custo e estado do teto", async () => {
    const agora = new Date().toISOString();
    const db = makeDb({
      prospecting_settings: [
        { organization_id: ORG_ID, provider_ativo: "google_places", orcamento_mensal_cents: 1000 },
      ],
      prospecting_searches: [
        {
          id: randomUUID(),
          organization_id: ORG_ID,
          created_at: agora,
          requisicoes: 5,
          detalhes: 1,
          encontradas: 12,
          novas: 3,
          custo_estimado_cents: 1000,
        },
      ],
      prospecting_cache_hits: [{ id: randomUUID(), organization_id: ORG_ID, hit_at: agora }],
    });
    session("manager", db);
    const res = await rotaConsumo.GET(req("GET", undefined, "http://localhost/api/v1/prospecting/consumo"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.provider_ativo).toBe("google_places");
    expect(data.hoje).toEqual({ consultas: 5 });
    expect(data.mes).toEqual({
      consultas: 5,
      hits: 1,
      misses: 1,
      descobertas: 12,
      novas: 3,
      enriquecimentos: 1,
      custo_cents: 1000,
    });
    expect(data.orcamento).toEqual({
      limite_cents: 1000,
      gasto_cents: 1000,
      pct: 100,
      estado: "bloqueio",
      alerta: MENSAGEM_ORCAMENTO_ATINGIDO,
    });
  });

  it("erro ao ler settings → 500 internal_error", async () => {
    const db = makeDb();
    db.comErroEm("prospecting_settings");
    session("manager", db);
    const res = await rotaConsumo.GET(req("GET", undefined, "http://localhost/api/v1/prospecting/consumo"));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal_error");
  });
});

describe("GET /api/v1/prospecting/prospects — filtros", () => {
  it("minha_fila nasce no authz e ignora query string de dono", async () => {
    const db = makeDb({
      business_prospects: [
        prospecto({ id: PROSPECT_A, owner_user_id: USER_ID }),
        prospecto({ id: PROSPECT_B, owner_user_id: OUTRO_USER_ID, score: 60 }),
      ],
    });
    session("viewer", db);
    const url = `http://localhost/api/v1/prospecting/prospects?minha_fila=true&owner_user_id=${OUTRO_USER_ID}`;
    const res = await rotaProspects.GET(req("GET", undefined, url));
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.data.map((l: Row) => l.id)).toEqual([PROSPECT_A]);
  });

  it("busca_id de outra org → 200 com lista vazia (sem confirmar existência)", async () => {
    const db = makeDb({ business_prospects: [prospecto()] });
    session("viewer", db);
    const url = `http://localhost/api/v1/prospecting/prospects?busca_id=${BUSCA_ID}`;
    const res = await rotaProspects.GET(req("GET", undefined, url));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });

  it("busca_id não-uuid → 400 validation_failed", async () => {
    session("viewer", makeDb());
    const res = await rotaProspects.GET(
      req("GET", undefined, "http://localhost/api/v1/prospecting/prospects?busca_id=nao-e-uuid"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_failed");
  });

  it("id não-uuid → 400 validation_failed", async () => {
    session("viewer", makeDb());
    const res = await rotaProspects.GET(
      req("GET", undefined, "http://localhost/api/v1/prospecting/prospects?id=lixo"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_failed");
  });

  it("status no vocabulário filtra; status fora do vocabulário cai fora em silêncio", async () => {
    const db = makeDb({
      business_prospects: [
        prospecto({ id: PROSPECT_A, status_comercial: "novo", score: 70 }),
        prospecto({ id: PROSPECT_B, status_comercial: "contatado", score: 60 }),
      ],
    });
    session("viewer", db);
    const filtrada = await rotaProspects.GET(
      req("GET", undefined, "http://localhost/api/v1/prospecting/prospects?status=novo"),
    );
    expect((await filtrada.json()).data.map((l: Row) => l.id)).toEqual([PROSPECT_A]);
    const silencio = await rotaProspects.GET(
      req("GET", undefined, "http://localhost/api/v1/prospecting/prospects?status=status_inventado"),
    );
    expect((await silencio.json()).data).toHaveLength(2);
  });

  it("match de telefone com contacts vira cliente na classificação (§9/§10)", async () => {
    const telefone = "(47) 99999-9999";
    const db = makeDb({
      business_prospects: [prospecto({ telefone })],
      contacts: [
        { id: CONTATO_ID, organization_id: ORG_ID, phone_number: canonicalPhoneBR(telefone), email: null },
      ],
    });
    session("viewer", db);
    const res = await rotaProspects.GET(req("GET", undefined, "http://localhost/api/v1/prospecting/prospects"));
    expect(res.status).toBe(200);
    const [linha] = (await res.json()).data as Array<Row>;
    expect(linha).toMatchObject({
      ja_e_cliente: true,
      classificacao: "cliente_existente",
    });
  });
});

describe("PATCH/DELETE /api/v1/prospecting/prospects/[id] — fila", () => {
  function patchReq(id: string, body: unknown) {
    return { req: req("PATCH", body, "http://localhost/api/v1/prospecting/prospects/x"), params: Promise.resolve({ id }) };
  }
  function deleteReq(id: string) {
    return { req: req("DELETE", undefined, "http://localhost/api/v1/prospecting/prospects/x"), params: Promise.resolve({ id }) };
  }

  it("viewer → 403 (editar fila é papel de agent)", async () => {
    session("viewer", makeDb({ business_prospects: [prospecto()] }));
    const { req: r, params } = patchReq(PROSPECT_A, { status_comercial: "contatado" });
    const res = await rotaProspect.PATCH(r, { params });
    expect(res.status).toBe(403);
  });

  it("body vazio → 422 (nada para atualizar)", async () => {
    session("agent", makeDb({ business_prospects: [prospecto()] }));
    const { req: r, params } = patchReq(PROSPECT_A, {});
    const res = await rotaProspect.PATCH(r, { params });
    expect(res.status).toBe(422);
  });

  it("prospect de outra org → 404, sem audit", async () => {
    const db = makeDb({ business_prospects: [prospecto({ organization_id: OUTRO_ORG_ID })] });
    session("agent", db);
    const { req: r, params } = patchReq(PROSPECT_A, { status_comercial: "contatado" });
    const res = await rotaProspect.PATCH(r, { params });
    expect(res.status).toBe(404);
    expect(audit).not.toHaveBeenCalled();
  });

  it("patch simples → 200 + audit prospect.updated (sem espelho)", async () => {
    const db = makeDb({ business_prospects: [prospecto()] });
    session("agent", db);
    const { req: r, params } = patchReq(PROSPECT_A, { status_comercial: "contatado" });
    const res = await rotaProspect.PATCH(r, { params });
    expect(res.status).toBe(200);
    expect((await res.json()).data.status_comercial).toBe("contatado");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "prospect.updated", resourceId: PROSPECT_A }),
    );
    expect(db.tabelas.commercial_tasks ?? []).toHaveLength(0);
  });

  it("proximo_passo espelha em commercial_tasks (FASE 12, Meu Dia)", async () => {
    const db = makeDb({ business_prospects: [prospecto()] });
    session("agent", db);
    const { req: r, params } = patchReq(PROSPECT_A, { proximo_passo: "Ligar amanhã de manhã" });
    const res = await rotaProspect.PATCH(r, { params });
    expect(res.status).toBe(200);
    const tarefas = db.tabelas.commercial_tasks ?? [];
    expect(tarefas).toHaveLength(1);
    expect(tarefas[0]).toMatchObject({
      organization_id: ORG_ID,
      titulo: "Ligar amanhã de manhã - Restaurante Bom Sabor",
      status: "pendente",
      tipo: "outro",
      prospect_id: PROSPECT_A,
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "commercial_task.created" }),
    );
  });

  it("DELETE cancela a espelhada ANTES de apagar e audita", async () => {
    const db = makeDb({
      business_prospects: [prospecto()],
      commercial_tasks: [
        { id: randomUUID(), organization_id: ORG_ID, prospect_id: PROSPECT_A, status: "pendente" },
      ],
    });
    session("agent", db);
    const { req: r, params } = deleteReq(PROSPECT_A);
    const res = await rotaProspect.DELETE(r, { params });
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(PROSPECT_A);
    expect(db.tabelas.business_prospects ?? []).toHaveLength(0);
    expect(db.tabelas.commercial_tasks?.[0]?.status).toBe("cancelada");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "prospect.deleted", resourceId: PROSPECT_A }),
    );
  });

  it("DELETE de id inexistente → 404", async () => {
    session("agent", makeDb({ business_prospects: [prospecto()] }));
    const { req: r, params } = deleteReq(randomUUID());
    const res = await rotaProspect.DELETE(r, { params });
    expect(res.status).toBe(404);
  });
});

// --- FASE 15 (B3/N+1/B15): paginação de verdade, funil em lote, mercado lote.

describe("GET /api/v1/prospecting/prospects — paginação (B3, FASE 15)", () => {
  it("offset devolve a página seguinte; meta.total/has_more falam de TODO o recorte", async () => {
    const db = makeDb({
      business_prospects: [
        prospecto({ id: PROSPECT_A, score: 90 }),
        prospecto({ id: PROSPECT_B, score: 50 }),
        prospecto({ id: PROSPECT_C, score: 70 }),
      ],
    });
    session("viewer", db);
    const primeira = await rotaProspects.GET(
      req("GET", undefined, "http://localhost/api/v1/prospecting/prospects?limite=2&offset=0"),
    );
    const c0 = await primeira.json();
    expect(c0.data.map((l: Row) => l.id)).toEqual([PROSPECT_A, PROSPECT_C]);
    expect(c0.meta).toEqual({ total: 3, limite: 2, offset: 0, has_more: true });
    const segunda = await rotaProspects.GET(
      req("GET", undefined, "http://localhost/api/v1/prospecting/prospects?limite=2&offset=2"),
    );
    const c1 = await segunda.json();
    expect(c1.data.map((l: Row) => l.id)).toEqual([PROSPECT_B]);
    expect(c1.meta).toEqual({ total: 3, limite: 2, offset: 2, has_more: false });
  });

  it("empate de score desempata por id — ordem estável entre páginas", async () => {
    const db = makeDb({
      business_prospects: [
        prospecto({ id: PROSPECT_B, score: 50 }),
        prospecto({ id: PROSPECT_A, score: 50 }),
      ],
    });
    session("viewer", db);
    const primeira = await rotaProspects.GET(
      req("GET", undefined, "http://localhost/api/v1/prospecting/prospects?limite=1&offset=0"),
    );
    expect((await primeira.json()).data.map((l: Row) => l.id)).toEqual([PROSPECT_A]);
    const segunda = await rotaProspects.GET(
      req("GET", undefined, "http://localhost/api/v1/prospecting/prospects?limite=1&offset=1"),
    );
    expect((await segunda.json()).data.map((l: Row) => l.id)).toEqual([PROSPECT_B]);
  });

  it("minha_fila corta no servidor e o meta.total acompanha o recorte", async () => {
    const db = makeDb({
      business_prospects: [
        prospecto({ id: PROSPECT_A, owner_user_id: USER_ID }),
        prospecto({ id: PROSPECT_B, owner_user_id: OUTRO_USER_ID, score: 60 }),
      ],
    });
    session("viewer", db);
    const res = await rotaProspects.GET(
      req("GET", undefined, "http://localhost/api/v1/prospecting/prospects?minha_fila=true"),
    );
    const corpo = await res.json();
    expect(corpo.data.map((l: Row) => l.id)).toEqual([PROSPECT_A]);
    expect(corpo.meta).toEqual({ total: 1, limite: 50, offset: 0, has_more: false });
  });

  it("erro na query → 500 internal_error (com logger, FASE 15)", async () => {
    const db = makeDb({ business_prospects: [prospecto()] });
    db.comErroEm("business_prospects");
    session("viewer", db);
    const res = await rotaProspects.GET(req("GET", undefined, "http://localhost/api/v1/prospecting/prospects"));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal_error");
  });
});

describe("GET /api/v1/prospecting/campaigns — funil em lote (N+1, FASE 15)", () => {
  const CAMPANHA: Row = {
    id: CAMPANHA_ID,
    organization_id: ORG_ID,
    nome: "Centro restaurantes",
    objetivo: null,
    categorias: ["restaurantes"],
    cidades: ["Joinville/SC"],
    status: "ativa",
    recorrencia_dias: null,
    ultima_execucao_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    created_by: USER_ID,
  };

  it("sem com_funil → linhas sem o campo funil (comportamento de antes)", async () => {
    session("viewer", makeDb({ prospecting_campaigns: [CAMPANHA] }));
    const res = await rotaCampanhas.GET(
      req("GET", undefined, "http://localhost/api/v1/prospecting/campaigns"),
    );
    const corpo = await res.json();
    expect(corpo.data).toHaveLength(1);
    expect(corpo.data[0]).not.toHaveProperty("funil");
  });

  it("com_funil=1 → cada linha ganha funil com todos os estágios", async () => {
    session("viewer", makeDb({ prospecting_campaigns: [CAMPANHA] }));
    const res = await rotaCampanhas.GET(
      req("GET", undefined, "http://localhost/api/v1/prospecting/campaigns?com_funil=1"),
    );
    const corpo = await res.json();
    expect(corpo.data[0].funil).toEqual({
      encontrados: 0,
      selecionados: 0,
      contatados: 0,
      responderam: 0,
      qualificados: 0,
      oportunidades: 0,
      pedidos: 0,
      faturamento_cents: 0,
    });
  });

  it("busca → resultados → prospects da campanha contam no funil", async () => {
    const db = makeDb({
      prospecting_campaigns: [CAMPANHA],
      prospecting_searches: [
        { id: BUSCA_ID, organization_id: ORG_ID, campaign_id: CAMPANHA_ID, status: "concluida" },
      ],
      prospect_search_results: [
        { organization_id: ORG_ID, search_id: BUSCA_ID, prospect_id: PROSPECT_A },
        { organization_id: ORG_ID, search_id: BUSCA_ID, prospect_id: PROSPECT_B },
      ],
      business_prospects: [
        prospecto({ id: PROSPECT_A, status_comercial: "novo" }),
        prospecto({ id: PROSPECT_B, status_comercial: "contatado" }),
      ],
    });
    session("viewer", db);
    const res = await rotaCampanhas.GET(
      req("GET", undefined, "http://localhost/api/v1/prospecting/campaigns?com_funil=1"),
    );
    const corpo = await res.json();
    expect(corpo.data[0].funil).toMatchObject({ encontrados: 2, pedidos: 0, faturamento_cents: 0 });
  });

  it("erro no banco DURANTE o funil → lista volta SEM funil (não derruba)", async () => {
    const db = makeDb({ prospecting_campaigns: [CAMPANHA] });
    db.comErroEm("prospecting_searches");
    session("viewer", db);
    const res = await rotaCampanhas.GET(
      req("GET", undefined, "http://localhost/api/v1/prospecting/campaigns?com_funil=1"),
    );
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.data).toHaveLength(1);
    expect(corpo.data[0]).not.toHaveProperty("funil");
  });
});

describe("GET /api/v1/automatic-sales/campaigns — funil em lote (N+1, FASE 15)", () => {
  const CAMPANHA_VA: Row = {
    id: CAMPANHA_VA_ID,
    organization_id: ORG_ID,
    nome: "Follow-up compradores",
    status: "active",
    cidade: "Joinville",
    uf: "SC",
    categorias: ["restaurantes"],
    limite_diario: 100,
    janela_inicio: "09:00",
    janela_fim: "18:00",
    created_at: "2026-09-01T00:00:00.000Z",
  };

  it("sem com_funil → sem campo; com com_funil=1 → funil presente", async () => {
    session("viewer", makeDb({ automatic_sales_campaigns: [CAMPANHA_VA] }));
    const sem = await rotaCampanhasVa.GET(
      req("GET", undefined, "http://localhost/api/v1/automatic-sales/campaigns"),
    );
    expect((await sem.json()).data[0]).not.toHaveProperty("funil");
    const com = await rotaCampanhasVa.GET(
      req("GET", undefined, "http://localhost/api/v1/automatic-sales/campaigns?com_funil=1"),
    );
    expect((await com.json()).data[0].funil).toMatchObject({
      encontrados: 0,
      oportunidades: 0,
      pedidos: 0,
      faturamento_cents: 0,
    });
  });

  it("erro na fila → lista volta SEM funil (não derruba)", async () => {
    const db = makeDb({ automatic_sales_campaigns: [CAMPANHA_VA] });
    db.comErroEm("automatic_sales_queue");
    session("viewer", db);
    const res = await rotaCampanhasVa.GET(
      req("GET", undefined, "http://localhost/api/v1/automatic-sales/campaigns?com_funil=1"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data[0]).not.toHaveProperty("funil");
  });
});

describe("GET /api/v1/prospecting/mercado — lote ?cidades (B15, FASE 15)", () => {
  const SEED: Record<string, Row[]> = {
    business_prospects: [
      prospecto({
        id: PROSPECT_A,
        cidade: "Campinas",
        estado: "SP",
        telefone: "1933333333",
        contact_id: CONTATO_ID,
      }),
      prospecto({ id: PROSPECT_B, cidade: "Campinas", estado: "SP" }),
      prospecto({ id: PROSPECT_C, cidade: "Sorocaba", estado: "SP" }),
    ],
    commercial_orders: [
      {
        id: PEDIDO_ID,
        organization_id: ORG_ID,
        contact_id: CONTATO_ID,
        status: "pago",
        total_cents: 1000,
        created_at: "2026-09-10T00:00:00.000Z",
      },
    ],
  };

  it("duas cidades num request → uma linha por cidade pedida, totais deduplicados", async () => {
    session("viewer", makeDb(SEED));
    const url = "http://localhost/api/v1/prospecting/mercado?cidades=Campinas&cidades=Sorocaba";
    const res = await rotaMercado.GET(req("GET", undefined, url));
    const { totais, por_cidade, por_categoria } = (await res.json()).data;
    expect(por_cidade.map((c: Row) => c.cidade)).toEqual(["Campinas", "Sorocaba"]);
    expect(por_cidade[0]).toMatchObject({ empresas: 2, clientes: 1, penetracao_pct: 50, potencial: 1 });
    expect(por_cidade[1]).toMatchObject({ empresas: 1, clientes: 0, penetracao_pct: 0, potencial: 1 });
    expect(totais).toMatchObject({ empresas: 3, clientes_vinculados: 1, prospects: 2 });
    expect(Array.isArray(por_categoria)).toBe(true);
  });

  it("linha que casa com DUAS cidades pedidas conta uma vez no total", async () => {
    session("viewer", makeDb(SEED));
    const url = "http://localhost/api/v1/prospecting/mercado?cidades=Camp&cidades=Campinas";
    const res = await rotaMercado.GET(req("GET", undefined, url));
    const { totais, por_cidade } = (await res.json()).data;
    expect(por_cidade[0].empresas).toBe(2);
    expect(por_cidade[1].empresas).toBe(2);
    expect(totais.empresas).toBe(2);
  });

  it("modo simples continua agrupando por Cidade/UF", async () => {
    session("viewer", makeDb(SEED));
    const url = "http://localhost/api/v1/prospecting/mercado?cidade=Campinas";
    const res = await rotaMercado.GET(req("GET", undefined, url));
    const { totais, por_cidade } = (await res.json()).data;
    expect(por_cidade).toEqual([
      { cidade: "Campinas/SP", empresas: 2, clientes: 1, penetracao_pct: 50, potencial: 1 },
    ]);
    expect(totais.empresas).toBe(2);
  });

  it("erro na varredura → 500 internal_error (com logger, FASE 15)", async () => {
    const db = makeDb(SEED);
    db.comErroEm("business_prospects");
    session("viewer", db);
    const res = await rotaMercado.GET(req("GET", undefined, "http://localhost/api/v1/prospecting/mercado"));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal_error");
  });
});
