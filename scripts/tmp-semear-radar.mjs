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

// A tela filtra por `activeOrg.orgId`, e `limit=1` devolve uma org ARBITRÁRIA:
// num banco com mais de uma organização as linhas caíam fora da sessão do teste
// (medido: 18 `li` no DOM e 0 com área). Aqui o seed vai para TODAS — no banco
// efêmero do CI isso é seguro e torna a medição independente de ordenação.
const orgs = await (await fetch(api("organizations?select=id"), { headers })).json();
if (!Array.isArray(orgs) || orgs.length === 0) {
  console.error("nenhuma organização na base local");
  process.exit(1);
}
console.log(`organizações no banco: ${orgs.length} (${orgs.map((o) => o.id).join(", ")})`);

await fetch(api("prospecting_searches?search_hash=eq.seed-radar-estados"), {
  method: "DELETE",
  headers,
});

const agora = Date.now();
const iso = (min) => new Date(agora - min * 60_000).toISOString();

const linhas = [
  {
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

// uma cópia do conjunto por organização
// `latitude`/`longitude` NÃO podem ser nulos: a área/mapa da tela filtra por
// `comGeo` (`_empresas.tsx:736-739`) e é isso que produzia 18 `li` sem área e
// `candidatos=0`. Coordenadas em torno de São Paulo, uma por estado da lista.
const linhasPorOrg = orgs.flatMap((o) =>
  linhas.map((l, i) => ({
    ...l,
    organization_id: o.id,
    latitude: l.latitude ?? (-23.5505 - i * 0.01).toFixed(5),
    longitude: l.longitude ?? (-46.6333 - i * 0.01).toFixed(5),
  })),
);
linhas.length = 0;
linhas.push(...linhasPorOrg);

// Só colunas que EXISTEM em `prospecting_searches`. As do estado visual
// (`progresso`, `degradada`, `degradacao_motivo`, `motivo_zero`,
// `parada_solicitada_em`) são derivadas no cliente por `_buscas-estado.ts`;
// mandá-las no insert dá PGRST204 e o seed morre.
const COLUNAS_REAIS = new Set([
  "organization_id", "categorias", "cidade", "estado", "pais", "latitude", "longitude",
  "raio_km", "max_empresas", "provider", "status", "total_celulas", "celulas_processadas",
  "encontradas", "novas", "duplicadas", "erros", "requisicoes", "custo_estimado_cents",
  "ultimo_erro", "search_hash", "created_at", "finished_at", "started_at",
]);
for (const chave of [...new Set(linhas.flatMap((l) => Object.keys(l)))]) {
  if (!COLUNAS_REAIS.has(chave)) {
    console.log(`descartando coluna inexistente no insert: ${chave}`);
    for (const l of linhas) delete l[chave];
  }
}

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
