/**
 * ENDPOINTS SEM CHAMADOR E POSSÍVEIS LEGADOS (item 6.4).
 *
 * ─── A PERGUNTA ────────────────────────────────────────────────────────────
 *
 * "Existem endpoints duplicados, sem uso ou legados?" O inventário responde
 * quantos existem (418) e como cada um se protege. Não responde **quem chama**.
 *
 * ─── COMO ESTE INSTRUMENTO RESPONDE ───────────────────────────────────────
 *
 * Para cada `route.ts`, monta o caminho e procura o PREFIXO em todo o código que
 * não é rota: `app/` (telas e componentes), `components/`, `hooks/`, `lib/`,
 * `workers/`, `scripts/`. Um caminho com zero menções fora de `app/api/` é
 * **candidato a legado ou a rota externa** — e as duas coisas se distinguem pelo
 * lugar: `/api/internal/`, `/api/mcp/`, `/api/v1/cron/` e as rotas de webhook
 * são chamadas por FORA (integração, cron, WAHA), então "sem chamador interno"
 * ali é esperado.
 *
 * O relatório NÃO decide remoção: o prompt manda não remover sem consulta. Ele
 * entrega a lista com o motivo de cada classificação.
 *
 * Uso:
 *   node scripts/auditoria/apis-sem-chamador.mjs
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = process.cwd();
const SAIDA = "docs/auditoria/capturas/apis-sem-chamador.json";

/** Caminho de `app/api/**\/route.ts` → `/api/...` (sem `route.ts`). */
function rotas(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      saida.push(...rotas(caminho));
    } else if (nome === "route.ts") {
      const rel = relative(join(RAIZ, "app"), dir).split(sep).join("/");
      saida.push("/" + rel);
    }
  }
  return saida;
}

function arquivos(dir) {
  const saida = [];
  let itens;
  try {
    itens = readdirSync(join(RAIZ, dir));
  } catch {
    return saida;
  }
  for (const nome of itens) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const rel = join(dir, nome);
    if (statSync(join(RAIZ, rel)).isDirectory()) saida.push(...arquivos(rel));
    else if (/\.(ts|tsx|mjs)$/.test(nome) && !nome.includes(".test.")) saida.push(rel);
  }
  return saida;
}

const FONTES = ["app", "components", "hooks", "lib", "workers", "scripts"]
  .flatMap((d) => arquivos(d))
  .filter((f) => !f.startsWith(join("app", "api") + sep));

const CORPO = FONTES.map((f) => ({ arquivo: f, texto: readFileSync(join(RAIZ, f), "utf8") }));

/** Caminho de API → prefixo procurável (sem segmentos dinâmicos). */
function prefixo(rota) {
  const partes = rota.split("/").filter(Boolean);
  const fixas = [];
  for (const p of partes) {
    if (p.startsWith("[") || p.startsWith("(")) break;
    fixas.push(p);
  }
  return "/" + fixas.join("/");
}

const EXTERNAS = [/^\/api\/internal\//, /^\/api\/mcp\//, /^\/api\/v1\/cron\//, /webhook/i, /^\/auth\//, /^\/api\/public/];

const todas = rotas(join(RAIZ, "app", "api")).sort();
const semChamador = [];
const porGuarda = new Map();

for (const rota of todas) {
  const pre = prefixo(rota);
  const chamadores = CORPO.filter((f) => f.texto.includes(pre)).map((f) => f.arquivo);
  if (chamadores.length === 0) {
    const externa = EXTERNAS.some((re) => re.test(rota));
    semChamador.push({ rota, prefixo: pre, externa, motivo: externa ? "rota de integração/cron — chamador é de fora" : "sem menção fora de app/api" });
  }
  // A guarda conta por TIPO, lida no próprio handler.
  const fonte = readFileSync(join(RAIZ, "app", rota, "route.ts"), "utf8");
  const tipo = /requireRole|requirePlatformAdmin/.test(fonte)
    ? "RBAC"
    : /INTERNAL_SECRET|internal_secret|CRON_SECRET|x-internal-secret/i.test(fonte)
      ? "secret"
      : "outro";
  porGuarda.set(tipo, (porGuarda.get(tipo) ?? 0) + 1);
}

const internasSemChamador = semChamador.filter((r) => !r.externa);

writeFileSync(
  join(RAIZ, SAIDA),
  JSON.stringify(
    {
      medido_em: new Date().toISOString(),
      total: todas.length,
      semChamador: semChamador.length,
      semChamadorInterno: internasSemChamador.length,
      candidatos: internasSemChamador,
      externas: semChamador.filter((r) => r.externa),
      porTipoDeGuarda: Object.fromEntries([...porGuarda].sort((a, b) => b[1] - a[1])),
    },
    null,
    2,
  ) + "\n",
);

console.log(`rotas de API: ${todas.length}`);
console.log(`sem chamador fora de app/api: ${semChamador.length} (${internasSemChamador.length} internas, ${semChamador.length - internasSemChamador.length} de integração)`);
console.log("\ncandidatos internos sem chamador:");
for (const c of internasSemChamador.slice(0, 40)) console.log("  " + c.rota);
console.log(`\nartefato: ${SAIDA}`);
