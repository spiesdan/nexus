/**
 * A SUPERFÍCIE DAS APIS EM NÚMEROS — paginação, limite, rate limit, idempotência
 * e contrato de resposta (itens 6.2 e 6.5).
 *
 * ─── O QUE ESTE INSTRUMENTO CONTA ─────────────────────────────────────────
 *
 * Em todo `app/api/**\/route.ts`:
 *   - **paginação**: o handler declara `limit`/`range`/`offset`/`page`/`cursor`;
 *   - **teto**: existe um limite máximo explícito (`Math.min`, `MAX_`, `cap`);
 *   - **rate limit**: chama `checkRateLimit` / `authRateLimited`;
 *   - **idempotência**: lê `Idempotency-Key`;
 *   - **contrato**: devolve por `ok()`/`fail()` (o wrapper canônico) ou monta
 *     `NextResponse`/`Response` na mão;
 *   - **service-role**: usa `createAdminClient` / `SUPABASE_SERVICE_ROLE`.
 *
 * Contagem não é julgamento: um `DELETE /recurso/[id]` não precisa de paginação,
 * e uma rota de cron não precisa de rate limit. O relatório cruza os números com
 * o tipo de rota antes de chamar qualquer coisa de defeito.
 *
 * Uso:
 *   node scripts/auditoria/superficie-de-api.mjs
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = process.cwd();
const SAIDA = "docs/auditoria/capturas/superficie-de-api.json";

function rotas(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...rotas(caminho));
    else if (nome === "route.ts") {
      const rel = relative(join(RAIZ, "app"), dir).split(sep).join("/");
      saida.push({ rota: "/" + rel, arquivo: caminho });
    }
  }
  return saida;
}

/** Tira comentário: `// limit` num comentário não é paginação. */
function semComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const todas = rotas(join(RAIZ, "app", "api"));
const porRota = [];
const totais = {
  rotas: todas.length,
  comPaginacao: 0,
  comTeto: 0,
  comRateLimit: 0,
  comIdempotencia: 0,
  comWrapperCanonico: 0,
  comResponseNaMao: 0,
  comServiceRole: 0,
};

for (const { rota, arquivo } of todas) {
  const fonte = semComentarios(readFileSync(arquivo, "utf8"));
  const get = /export\s+(async\s+)?function\s+GET|export\s+const\s+GET/.test(fonte);
  const muta = /export\s+(async\s+)?function\s+(POST|PATCH|PUT|DELETE)/.test(fonte);
  // Paginação de verdade é `.limit(` / `.range(` / `Math.min(` — a palavra
  // "limit" solta aparecia em comentário e em nome de variável, e contava rota
  // que devolve tudo como paginada.
  const paginacao = /\.limit\(|\.range\(|Math\.min\(/.test(fonte);
  // O teto pode viver no HANDLER ou ser passado a um helper da lib (ex.:
  // `/agenda/agendamentos` passa `limite` para `lib/agenda/consulta.ts`, que
  // aplica default 200 e máximo 500). Contar só o `.limit(` do arquivo dava
  // falso positivo nesse caso — medido em 17/11/2026.
  const teto =
    /Math\.min\(|MAX_[A-Z_]+|TETO_|LIMITE_|\.limit\(|\.range\(/.test(fonte) ||
    /\blimite\s*[:,)]|\blimit\s*[:,)]%?\s*\d/.test(fonte) ||
    /\blimite\s*:\s*(?:Number|parseInt|\w+\.)/.test(fonte);
  const rate = /checkRateLimit|authRateLimited/.test(fonte);
  const idem = /idempotency-key|idempotency_key/i.test(fonte);
  const wrapper = /\bok\(|\bfail\(/.test(fonte);
  const manual = /new Response\(|NextResponse\.json\(/.test(fonte);
  const service = /createAdminClient|SUPABASE_SERVICE_ROLE/.test(fonte);

  totais.comPaginacao += paginacao ? 1 : 0;
  totais.comTeto += teto ? 1 : 0;
  totais.comRateLimit += rate ? 1 : 0;
  totais.comIdempotencia += idem ? 1 : 0;
  totais.comWrapperCanonico += wrapper ? 1 : 0;
  totais.comResponseNaMao += manual ? 1 : 0;
  totais.comServiceRole += service ? 1 : 0;

  porRota.push({ rota, get, muta, paginacao, teto, rate, idem, wrapper, manual, service });
}

/**
 * GETs de LISTA que não declaram teto. Detalhe (`[id]`), callback e OAuth ficam
 * de fora: `GET /recurso/[id]` devolve UMA linha e não precisa de `limit`.
 */
const NAO_E_LISTA = /\[[^\]]+\]|callback|connect|\/auth|health/i;
const getSemTeto = porRota
  .filter((r) => r.get && !r.teto && !NAO_E_LISTA.test(r.rota))
  .map((r) => r.rota);
const detalheSemTetoDescartado = porRota.filter((r) => r.get && !r.teto && NAO_E_LISTA.test(r.rota)).length;

writeFileSync(
  join(RAIZ, SAIDA),
  JSON.stringify(
    {
      medido_em: new Date().toISOString(),
      totais,
      getSemTeto,
      detalheSemTetoDescartado,
      porRota,
    },
    null,
    2,
  ) + "\n",
);

console.log(`rotas: ${totais.rotas}`);
console.log(`  com paginação/limit: ${totais.comPaginacao}`);
console.log(`  com teto explícito:  ${totais.comTeto}`);
console.log(`  com rate limit:      ${totais.comRateLimit}`);
console.log(`  com idempotência:    ${totais.comIdempotencia}`);
console.log(`  wrapper canônico:    ${totais.comWrapperCanonico}`);
console.log(`  Response na mão:     ${totais.comResponseNaMao}`);
console.log(`  service-role:        ${totais.comServiceRole}`);
console.log(`\nGET de LISTA sem teto explícito: ${getSemTeto.length} (detalhes/callbacks fora da conta: ${detalheSemTetoDescartado})`);
for (const r of getSemTeto.slice(0, 20)) console.log("  " + r);
console.log(`\nartefato: ${SAIDA}`);
