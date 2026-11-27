/**
 * Semeia os estados do Radar na base LOCAL do e2e.
 * Marca as linhas com search_hash='seed-radar-estados' e apaga só as marcadas.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const api = (p) => `${url}/rest/v1/${p}`;

const org = await (await fetch(api("organizations?select=id&limit=1"), { headers })).json();
if (!Array.isArray(org) || org.length === 0) {
  console.error("nenhuma organização na base local");
  process.exit(1);
}
const organization_id = org[0].id;

await fetch(api("prospecting_searches?search_hash=eq.seed-radar-estados"), {
  method: "DELETE",
  headers,
});

const agora = Date.now();
const iso = (min) => new Date(agora - min * 60_000).toISOString();

const linhas = [
  {
    organization_id,
    search_hash: "seed-radar-estados",
    categorias: ["oficina mecânica", "auto peças"],
    cidade: "Canoinhas",
    estado: "SC",
    raio_km: 30,
    max_empresas: 20,
    provider: "maps_browser",
    status: "running",
    encontradas: 40,
    novas: 12,
    duplicadas: 28,
    progresso: {
      termos_total: 2,
      termos_concluidos: ["oficina mecânica"],
      termos_falhos: [],
      termo_atual: "auto peças",
      tentativas: 1,
      bloqueio: null,
      termos_encontradas: { "oficina mecânica": 40 },
    },
    created_at: iso(4),
    started_at: iso(3),
  },
  {
    organization_id,
    search_hash: "seed-radar-estados",
    categorias: ["restaurante", "padaria"],
    cidade: "Mafra",
    estado: "SC",
    raio_km: 25,
    max_empresas: 20,
    provider: "maps_browser",
    status: "running",
    encontradas: 18,
    novas: 6,
    duplicadas: 12,
    parada_solicitada_em: iso(1),
    progresso: {
      termos_total: 2,
      termos_concluidos: ["restaurante"],
      termos_falhos: [],
      termo_atual: "padaria",
      tentativas: 0,
      bloqueio: null,
      termos_encontradas: { restaurante: 18 },
    },
    created_at: iso(7),
    started_at: iso(6),
  },
  {
    organization_id,
    search_hash: "seed-radar-estados",
    categorias: ["clínica odontológica", "farmácia"],
    cidade: "Rio Negro",
    estado: "PR",
    raio_km: 40,
    max_empresas: 20,
    provider: "maps_browser",
    status: "completed",
    encontradas: 40,
    novas: 12,
    duplicadas: 28,
    progresso: {
      termos_total: 2,
      termos_concluidos: ["clínica odontológica"],
      termos_falhos: ["farmácia"],
      termo_atual: null,
      tentativas: 0,
      bloqueio: null,
      termos_encontradas: { "clínica odontológica": 40 },
    },
    created_at: iso(20),
    started_at: iso(19),
    finished_at: iso(12),
  },
  {
    organization_id,
    search_hash: "seed-radar-estados",
    categorias: ["cerâmica"],
    cidade: "Três Barras",
    estado: "SC",
    raio_km: 15,
    max_empresas: 20,
    provider: "maps_browser",
    status: "completed",
    encontradas: 0,
    novas: 0,
    duplicadas: 0,
    motivo_zero: "sem_resultados",
    progresso: {
      termos_total: 1,
      termos_concluidos: ["cerâmica"],
      termos_falhos: [],
      termo_atual: null,
      tentativas: 0,
      bloqueio: null,
      termos_encontradas: { cerâmica: 0 },
    },
    created_at: iso(30),
    started_at: iso(29),
    finished_at: iso(28),
  },
  {
    organization_id,
    search_hash: "seed-radar-estados",
    categorias: ["hotel", "pousada"],
    cidade: "São Bento do Sul",
    estado: "SC",
    raio_km: 30,
    max_empresas: 20,
    provider: "maps_browser",
    status: "paused",
    encontradas: 0,
    novas: 0,
    duplicadas: 0,
    degradada: true,
    degradacao_motivo:
      "sidecar_em_modo_navegador: o job não confirmou fast_mode=true; abortado antes de rodar (a imagem distroless não tem Chromium).",
    progresso: {
      termos_total: 2,
      termos_concluidos: [],
      termos_falhos: [],
      termo_atual: null,
      tentativas: 0,
      bloqueio: {
        motivo:
          "sidecar_em_modo_navegador: o job não confirmou fast_mode=true; abortado antes de rodar (a imagem distroless não tem Chromium).",
        em: iso(40),
      },
      termos_encontradas: {},
    },
    created_at: iso(45),
    started_at: iso(44),
    finished_at: iso(40),
  },
  {
    organization_id,
    search_hash: "seed-radar-estados",
    categorias: ["marcenaria"],
    cidade: "Itaiópolis",
    estado: "SC",
    raio_km: 30,
    max_empresas: 20,
    provider: "maps_browser",
    status: "queued",
    encontradas: 0,
    novas: 0,
    duplicadas: 0,
    progresso: {
      termos_total: 2,
      termos_concluidos: [],
      termos_falhos: [],
      termo_atual: null,
      tentativas: 0,
      bloqueio: null,
      termos_encontradas: {},
    },
    created_at: iso(0),
  },
];

const chaves = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
const normalizadas = linhas.map((l) =>
  Object.fromEntries(chaves.map((k) => [k, k in l ? l[k] : k === "degradada" ? false : null])),
);

const r = await fetch(api("prospecting_searches"), {
  method: "POST",
  headers: { ...headers, Prefer: "return=representation" },
  body: JSON.stringify(normalizadas),
});
if (!r.ok) {
  console.error("falhou:", r.status, await r.text());
  process.exit(1);
}
const criadas = await r.json();
console.log(JSON.stringify(criadas.map((c) => ({ id: c.id, cidade: c.cidade, status: c.status })), null, 2));
