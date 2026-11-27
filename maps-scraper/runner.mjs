#!/usr/bin/env node
/**
 * Runner da descoberta: fala com o sidecar pela API de jobs dele e devolve
 * JSONL no formato que `scripts/importar-prospecao-maps-scraper.ts` já importa.
 *
 * Por que a API e não o CLI: o serviço do compose roda em modo `-web`; quem
 * chama não precisa de acesso ao binário nem ao filesystem do contêiner. E o
 * contrato é o do próprio sidecar — não inventamos um segundo.
 *
 *   node runner.mjs --termo "restaurante" --lat -26.3045 --lon -48.8487
 *   node runner.mjs ... --base http://maps-scraper:8080 --saida /tmp/x.jsonl
 *
 * Campos que o CSV do sidecar entrega e o importador espera:
 *   - o site vem em `website` no CSV (no JSON do CLI ele se chama `web_site`);
 *   - `complete_address` é uma string pronta, e o importador aceita string;
 *   - `categories` não existe no CSV — fica ausente, e o importador usa `category`.
 *
 * Erros nomeados (stderr, exit != 0): API_INDISPONIVEL | JOB_FALHOU |
 * TIMEOUT | SEM_RESULTADOS. Bloqueio do Google NÃO é contornado: o sidecar
 * devolve o que devolve, e zero resultado é tratado como nada encontrado.
 */
import { writeFile } from "node:fs/promises";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]?.startsWith("--") ? "true" : arr[i + 1] ?? "true"]);
    return acc;
  }, []),
);

function falhar(codigo, detalhe) {
  process.stderr.write(JSON.stringify({ erro: codigo, detalhe }) + "\n");
  process.exit(3);
}

const termo = args.termo;
const lat = args.lat;
const lon = args.lon;
if (!termo || lat === undefined || lon === undefined) {
  falhar("ARGUMENTO_FALTANDO", "use --termo, --lat e --lon (o serviço exige coordenadas no modo rápido)");
}

const base = (args.base ?? "http://maps-scraper:8080").replace(/\/$/, "");
const raio = Number(args.raio ?? 8000); // metros — é a unidade do sidecar
const depth = Number(args.depth ?? 2);
const timeoutS = Number(args.timeout ?? 180);
const saida = args.saida ?? null;
// `array` = contrato congelado do adaptador (uma linha = array de negócios).
// `objeto` = formato do importador legado (scripts/importar-prospecao-*.ts),
// que faz JSON.parse por linha e espera UM negócio por linha.
const formato = args.formato ?? "array";
if (!["array", "objeto"].includes(formato)) {
  falhar("ARGUMENTO_INVALIDO", "--formato aceita 'array' ou 'objeto'");
}

async function chamar(caminho, init) {
  let resp;
  try {
    resp = await fetch(base + caminho, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    falhar("API_INDISPONIVEL", `${caminho}: ${e.message}`);
  }
  if (!resp.ok) {
    falhar("API_INDISPONIVEL", `${caminho}: HTTP ${resp.status}`);
  }
  return resp;
}

const criado = await chamar("/api/v1/jobs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: `descoberta ${termo}`,
    keywords: [termo],
    lang: "pt",
    zoom: 15,
    // O sidecar declara lat/lon como string.
    lat: String(lat),
    lon: String(lon),
    fast_mode: true,
    radius: raio,
    depth,
    max_time: timeoutS,
  }),
});
const { id } = await criado.json();

const limite = Date.now() + timeoutS * 1000;
let status = "pending";
// Estados do sidecar: pending, working, ok, failed. Qualquer coisa que não
// seja final segue aguardando — "working" era o que faltava e fazia o runner
// desistir no primeiro segundo de uma busca que ia bem.
const FINAIS = new Set(["ok", "failed"]);
while (!FINAIS.has(status)) {
  if (Date.now() > limite) falhar("TIMEOUT", `job ${id} ainda em ${status} depois de ${timeoutS}s`);
  await new Promise((r) => setTimeout(r, 1000));
  const corpo = await (await chamar(`/api/v1/jobs/${id}`)).json();
  status = String(corpo.Status ?? "").toLowerCase();
}
if (status !== "ok") falhar("JOB_FALHOU", `job ${id} terminou em ${status}`);

const csv = await (await chamar(`/api/v1/jobs/${id}/download`)).text();

/** Parser RFC 4180 mínimo: o CSV do Maps tem vírgula, aspas e quebra dentro de campo. */
function linhasCsv(texto) {
  const linhas = [];
  let campo = "";
  let linha = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i += 1; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo !== "" || linha.length > 0) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

const [cabecalho, ...registros] = linhasCsv(csv);
if (!cabecalho) falhar("SEM_RESULTADOS", "download vazio");
const col = Object.fromEntries(cabecalho.map((nome, i) => [nome, i]));
const pegar = (linha, nome) => {
  const v = linha[col[nome] ?? -1];
  return v === undefined || v === "" || v === "null" ? undefined : v;
};
const jsonDeCampo = (v) => {
  if (!v) return null;
  try {
    const p = JSON.parse(v);
    return p && typeof p === "object" ? p : null;
  } catch {
    return null;
  }
};

// Formato CONGELADO pelo adaptador (commit 96edde72b):
// - uma linha = ARRAY de negócios (não um objeto por linha);
// - site em `web_site`;
// - `complete_address` como OBJETO (no CSV ele vem como string JSON);
// - `cid` como string de 19 dígitos.
// O CSV do sidecar entrega `website` e `complete_address` textual; a conversão
// é aqui, para o adaptador não precisar saber que o transporte foi CSV.
const negocios = registros
  .filter((l) => l.length > 1)
  .map((l) => ({
    title: pegar(l, "title"),
    category: pegar(l, "category"),
    address: pegar(l, "address"),
    complete_address: jsonDeCampo(pegar(l, "complete_address")),
    phone: pegar(l, "phone"),
    web_site: pegar(l, "website"),
    place_id: pegar(l, "place_id"),
    cid: pegar(l, "cid"),
    latitude: Number(pegar(l, "latitude")),
    longitude: Number(pegar(l, "longitude")),
    review_rating: Number(pegar(l, "review_rating")),
    review_count: Number(pegar(l, "review_count")),
    open_hours: jsonDeCampo(pegar(l, "open_hours")),
    link: pegar(l, "link"),
  }))
  .filter((r) => r.title || r.place_id);

if (!negocios.length) falhar("SEM_RESULTADOS", `job ${id} sem nenhum negócio`);

const texto =
  formato === "array"
    ? JSON.stringify(negocios) + "\n"
    : negocios.map((n) => JSON.stringify(n)).join("\n") + "\n";
if (saida) await writeFile(saida, texto);
process.stdout.write(texto);
process.stderr.write(JSON.stringify({ ok: true, job: id, negocios: negocios.length, formato }) + "\n");
