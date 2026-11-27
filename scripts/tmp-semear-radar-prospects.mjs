/**
 * Semeia 6 EMPRESAS (business_prospects) na base LOCAL do e2e, para a aba
 * `?aba=empresas` do Radar.
 *
 * Por que esta tabela: a lista da aba empresas lê
 * `GET /api/v1/prospecting/prospects` → `business_prospects` com
 * `organization_id` da sessão e `bloqueado = false`. `prospecting_searches` é a
 * aba `?aba=pesquisas` e não alimenta este cartão — foi o erro das rodadas
 * anteriores (18 `li` de busca e `candidatos=0`).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const api = (p) => `${url}/rest/v1/${p}`;

const orgs = await (await fetch(api("organizations?select=id"), { headers })).json();
if (!Array.isArray(orgs) || orgs.length === 0) {
  console.error("nenhuma organização na base local");
  process.exit(1);
}
console.log(`organizações no banco: ${orgs.length}`);

await fetch(api("business_prospects?provider=eq.seed-radar-prospects"), {
  method: "DELETE",
  headers,
});

const CATEGORIAS = [
  ["Padaria", "Canoinhas", "SC"],
  ["Oficina mecânica", "Mafra", "SC"],
  ["Restaurante", "Rio Negro", "PR"],
  ["Clínica odontológica", "Três Barras", "SC"],
  ["Hotel", "São Bento do Sul", "SC"],
  ["Cerâmica", "Itaiópolis", "SC"],
];

const agora = new Date();
const linhas = orgs.flatMap((o) =>
  CATEGORIAS.map(([categoria, cidade, estado], i) => ({
    organization_id: o.id,
    nome: `${categoria} ${cidade} E2E`,
    nome_normalizado: `${categoria} ${cidade} e2e`.toLowerCase(),
    categoria,
    categorias: [categoria],
    cidade,
    estado,
    pais: "Brasil",
    // Coordenadas não nulas em torno de São Paulo — `comGeo` exige geo.
    latitude: Number((-23.5505 - i * 0.01).toFixed(5)),
    longitude: Number((-46.6333 - i * 0.01).toFixed(5)),
    provider: "seed-radar-prospects",
    external_id: `seed-radar-prospects-${i + 1}`,
    source: "seed",
    // Sem chip ativo por padrão: status comercial neutro e score mediano.
    status_comercial: "novo",
    score: 40,
    bloqueado: false,
    do_not_contact: false,
    whatsapp_potencial: false,
    discovered_at: new Date(agora.getTime() - i * 60_000).toISOString(),
  })),
);

const r = await fetch(api("business_prospects"), {
  method: "POST",
  headers: { ...headers, Prefer: "return=representation" },
  body: JSON.stringify(linhas),
});
if (!r.ok) {
  console.error("falhou:", r.status, await r.text());
  process.exit(1);
}
const criadas = await r.json();
console.log(`criadas ${criadas.length} empresas em ${orgs.length} org(s)`);
