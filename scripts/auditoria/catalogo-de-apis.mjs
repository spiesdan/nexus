/**
 * CATÁLOGO DE APIS, SEGUNDA METADE — payload e EFEITO DE DADOS (item 6.1).
 *
 * ─── O QUE O INVENTÁRIO JÁ DIZ ────────────────────────────────────────────
 *
 * `inventario-completo.ts` já cataloga, por handler: métodos, guarda, nome do
 * schema de validação, efeitos declarados (auditoria, event_log, fila, HTTP,
 * e-mail, storage), idempotência e rate limit.
 *
 * Faltavam duas colunas que o item pede explicitamente:
 *   - **payload**: quais campos o corpo aceita (as chaves do `z.object` inline);
 *   - **efeito de dados**: QUAIS TABELAS o handler escreve.
 *
 * ─── COMO O EFEITO É LIDO ─────────────────────────────────────────────────
 *
 * O encadeamento do Supabase é `.from("tabela")…insert(` / `.update(` /
 * `.upsert(` / `.delete(`. O instrumento procura a tabela na MESMA cadeia (até
 * 400 caracteres depois do `.from`), e não no arquivo inteiro — `from` para ler
 * e `from` para gravar convivem no mesmo handler.
 *
 * Isso é leitura de código, não execução: aparece o que o handler **declara**
 * escrever. Query montada em outro módulo (`lib/...`) não entra — e o relatório
 * diz isso, para ninguém ler o número como cobertura total.
 *
 * Uso:
 *   node scripts/auditoria/catalogo-de-apis.mjs
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = process.cwd();
const SAIDA = "docs/auditoria/capturas/catalogo-de-apis.json";

function arquivosRotas(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosRotas(caminho));
    else if (nome === "route.ts") {
      saida.push({
        rota: "/" + relative(join(RAIZ, "app"), dir).split(sep).join("/"),
        arquivo: caminho,
      });
    }
  }
  return saida;
}

/** Chaves do `z.object({ ... })` inline (primeiro nível). */
function chavesDoPayload(fonte) {
  const bloco = fonte.match(/z\s*\.\s*object\(\s*\{([\s\S]{0,1200}?)\}\s*\)/);
  if (!bloco) return [];
  const chaves = [];
  for (const linha of bloco[1].split("\n")) {
    const m = linha.match(/^\s{0,10}([a-z_][a-z0-9_]*)\s*:/i);
    if (m) chaves.push(m[1]);
  }
  return [...new Set(chaves)];
}

const metodosDe = (fonte) =>
  ["GET", "POST", "PATCH", "PUT", "DELETE"].filter((m) =>
    new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${m}\\b`).test(fonte),
  );

const todas = arquivosRotas(join(RAIZ, "app", "api"));
const catalogo = [];

for (const { rota, arquivo } of todas) {
  const fonte = readFileSync(arquivo, "utf8");
  const metodos = metodosDe(fonte);

  // Efeito de dados: `.from("t")` seguido de escrita na mesma cadeia.
  const escritas = [];
  for (const m of fonte.matchAll(/\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)/g)) {
    const trecho = fonte.slice(m.index, m.index + 400);
    if (/\.(insert|update|upsert|delete)\(/.test(trecho)) escritas.push(m[1]);
  }

  // Leitura: `.from(...)` que não é escrita.
  const lidas = [...new Set([...fonte.matchAll(/\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)/g)].map((m) => m[1]))].filter(
    (t) => !escritas.includes(t),
  );

  // Validação de verdade: um schema sendo USADO (`X.parse`, `safeParse`) ou um
  // `z.object` inline. A palavra "Schema" solta casava import e nome de tipo.
  const valida = /[A-Za-z0-9_]*Schema\s*\.\s*(parse|safeParse)|safeParse\(|z\s*\.\s*object\(/.test(
    fonte,
  );
  const muta = metodos.some((m) => ["POST", "PATCH", "PUT"].includes(m));
  // Rota que LÊ CORPO precisa validar; rota de ação (`/pause`, `/duplicate`)
  // não tem corpo para validar — contá-la como "sem validação" seria ruído.
  const leCorpo = /(?:req|request)\s*\.\s*json\(|await\s+req\.text\(|formData\(\)/.test(fonte);

  catalogo.push({
    rota,
    metodos,
    muta,
    leCorpo,
    payload: chavesDoPayload(fonte),
    validaPayload: valida,
    tabelasEscritas: [...new Set(escritas)],
    tabelasLidas: lidas,
  });
}

const porTabela = new Map();
for (const c of catalogo) for (const t of c.tabelasEscritas) porTabela.set(t, (porTabela.get(t) ?? 0) + 1);

const mutacoesSemValidacao = catalogo.filter((c) => c.leCorpo && !c.validaPayload);
const mutacoesSemCorpo = catalogo.filter((c) => c.muta && !c.leCorpo).length;
const comPayload = catalogo.filter((c) => c.payload.length > 0);
const semEscritaDeclarada = catalogo.filter((c) => c.muta && c.tabelasEscritas.length === 0);

writeFileSync(
  join(RAIZ, SAIDA),
  JSON.stringify(
    {
      medido_em: new Date().toISOString(),
      total: catalogo.length,
      comPayloadInline: comPayload.length,
      mutacoesSemValidacao: mutacoesSemValidacao.map((c) => c.rota),
      mutacoesSemCorpo,
      mutacoesSemEscritaDeclarada: semEscritaDeclarada.map((c) => c.rota),
      tabelasMaisEscritas: [...porTabela].sort((a, b) => b[1] - a[1]).slice(0, 20),
      catalogo,
    },
    null,
    2,
  ) + "\n",
);

console.log(`handlers: ${catalogo.length}`);
console.log(`com payload inline (chaves do z.object): ${comPayload.length}`);
console.log(`mutações que LEEM corpo sem validação identificável: ${mutacoesSemValidacao.length}`);
console.log(`mutações sem corpo (ação: pause, duplicate…): ${mutacoesSemCorpo}`);
console.log(`mutações sem escrita de tabela declarada no próprio arquivo: ${semEscritaDeclarada.length}`);
console.log("\ntabelas mais escritas:");
for (const [t, n] of [...porTabela].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${t} (${n})`);
console.log(`\nartefato: ${SAIDA}`);
