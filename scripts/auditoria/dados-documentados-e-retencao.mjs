/**
 * O QUE ESTÁ DOCUMENTADO, O QUE TEM DONO E O QUE EXPIRA (item 6.8).
 *
 * ─── A PERGUNTA ────────────────────────────────────────────────────────────
 *
 * "Documentar tabelas, entidades, relações, exclusão, retenção, propriedade e
 * visibilidade." Documento que ninguém consegue conferir envelhece. Aqui o
 * próprio schema responde, no `baseline.sql` — o arquivo que o self-host aplica:
 *
 *   - **documentada**: existe `comment on table`;
 *   - **dono**: a tabela tem `organization_id` (é de um tenant) ou é global;
 *   - **exclusão**: tem `deleted_at` (soft delete) ou só hard delete;
 *   - **relações**: quantas chaves estrangeiras saem dela e com que ação
 *     (`cascade`, `restrict`, `set null`);
 *   - **retenção**: quais tabelas algum cron de limpeza apaga.
 *
 * O que o instrumento NÃO faz: julgar se o tempo de retenção é o certo. Isso é
 * decisão de negócio e está nos specs.
 *
 * Uso:
 *   node scripts/auditoria/dados-documentados-e-retencao.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

const RAIZ = process.cwd();
const SQL = readFileSync(join(RAIZ, "supabase", "baseline.sql"), "utf8");
const SAIDA = "docs/auditoria/capturas/dados-documentados-e-retencao.json";

/** Blocos `create table [if not exists] [public.]nome ( ... );` */
function tabelas(sql) {
  const saida = [];
  const re = /create table (?:if not exists )?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    let i = re.lastIndex;
    let nivel = 1;
    while (i < sql.length && nivel > 0) {
      if (sql[i] === "(") nivel += 1;
      else if (sql[i] === ")") nivel -= 1;
      i += 1;
    }
    saida.push({ nome: m[1], corpo: sql.slice(re.lastIndex, i - 1) });
  }
  return saida;
}

const blocos = tabelas(SQL);
const comentadas = new Set(
  [...SQL.matchAll(/comment on table\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?\s+is/gi)].map((m) => m[1]),
);

const detalhes = blocos.map(({ nome, corpo }) => {
  const colunas = [...corpo.matchAll(/^\s{1,8}"?([a-z_][a-z0-9_]*)"?\s+([a-z][a-z0-9_ ()[\].,"]*)/gim)]
    .map((m) => m[1])
    .filter((c) => !["constraint", "primary", "unique", "foreign", "check", "references"].includes(c));
  const fks = [...corpo.matchAll(/references\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi)].map((m) => m[1]);
  const acoes = {
    cascade: (corpo.match(/on delete cascade/gi) ?? []).length,
    restrict: (corpo.match(/on delete restrict/gi) ?? []).length,
    setNull: (corpo.match(/on delete set null/gi) ?? []).length,
  };
  const destinos = [...corpo.matchAll(/references\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?[^,)]*?(on delete (?:cascade|restrict|set null))?/gi)].map(
    (m) => ({ alvo: m[1], acao: m[2] ?? "no action" }),
  );
  return {
    tabela: nome,
    colunas: colunas.length,
    destinos,
    documentada: comentadas.has(nome),
    temOrganizationId: /\borganization_id\b/.test(corpo),
    softDelete: /\bdeleted_at\b/.test(corpo),
    fks: fks.length,
    acoes,
  };
});

// Retenção: crons que apagam de alguma tabela.
const crons = [];
const fs = await import("node:fs");
function andar(dir) {
  const saida = [];
  for (const nome of fs.readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (fs.statSync(caminho).isDirectory()) saida.push(...andar(caminho));
    else if (nome === "route.ts") saida.push(caminho);
  }
  return saida;
}
for (const arquivo of andar(join(RAIZ, "app", "api", "v1", "cron"))) {
  const fonte = fs.readFileSync(arquivo, "utf8");
  // Limpeza pode ser `.from().delete(` OU RPC (`fn_purge_*`). A primeira versão
  // só olhava `.delete(` e perdia exatamente o cron de retenção.
  const apaga = [...fonte.matchAll(/\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)[\s\S]{0,300}?\.delete\(/g)].map((m) => m[1]);
  // O nome da RPC aparece na UNIÃO DE TIPOS (`rpc(nome: "fn_podar_..." | ...)`),
  // não dentro de `.rpc("...")` — por isso a busca é por qualquer ocorrência.
  const rpcs = [...new Set([...fonte.matchAll(/(fn_(?:podar|expurgar)_[a-z0-9_]+)/g)].map((m) => m[1]))];
  // Retenção é quem APAGA por prazo: caminho com \"retention\" ou RPC de poda.
  // Comentário citando \"retenção\" não faz do cron um podador — foi assim que
  // `agenda-google-sync` entrou na lista na primeira versão.
  const mencionaRetencao = /retention|retencao/i.test(arquivo);
  if (apaga.length > 0 || rpcs.length > 0 || mencionaRetencao) {
    crons.push({
      rota:
        "/" +
        arquivo
          .split(sep)
          .slice(arquivo.split(sep).indexOf("cron"))
          .join("/")
          .replace(/\/route\.ts$/, ""),
      tabelas: [...new Set(apaga)],
      rpcs,
      mencionaRetencao,
    });
  }
}

const resumo = {
  tabelas: detalhes.length,
  documentadas: detalhes.filter((d) => d.documentada).length,
  comOrganizationId: detalhes.filter((d) => d.temOrganizationId).length,
  globais: detalhes.filter((d) => !d.temOrganizationId).length,
  comSoftDelete: detalhes.filter((d) => d.softDelete).length,
  fksTotal: detalhes.reduce((s, d) => s + d.fks, 0),
  onDelete: {
    cascade: detalhes.reduce((s, d) => s + d.acoes.cascade, 0),
    restrict: detalhes.reduce((s, d) => s + d.acoes.restrict, 0),
    setNull: detalhes.reduce((s, d) => s + d.acoes.setNull, 0),
  },
  cronsComLimpeza: crons.length,
};

writeFileSync(
  join(RAIZ, SAIDA),
  JSON.stringify({ medido_em: new Date().toISOString(), resumo, crons, semComentario: detalhes.filter((d) => !d.documentada).map((d) => d.tabela), detalhes }, null, 2) + "\n",
);

// ── Documento gerado: tabelas, relações e dono ────────────────────────────
const linhas = [
  "# Tabelas e relações — gerado do `baseline.sql`",
  "",
  "> Gerado por `node scripts/auditoria/dados-documentados-e-retencao.mjs`.",
  "> Não editar à mão: o que envelhece é a prosa, não o schema.",
  "",
  "| Medida | Valor |",
  "|---|---|",
  `| Tabelas | **${resumo.tabelas}** |`,
  `| Com \`COMMENT ON TABLE\` | **${resumo.documentadas}** |`,
  `| Com \`organization_id\` (de um tenant) | **${resumo.comOrganizationId}** |`,
  `| Globais (plataforma) | **${resumo.globais}** |`,
  `| Com \`deleted_at\` (soft delete) | **${resumo.comSoftDelete}** |`,
  `| Chaves estrangeiras | **${resumo.fksTotal}** (cascade ${resumo.onDelete.cascade} · restrict ${resumo.onDelete.restrict} · set null ${resumo.onDelete.setNull}) |`,
  `| Crons com retenção/limpeza | **${resumo.cronsComLimpeza}** |`,
  "",
  "## Exclusão",
  "",
  "Não há `deleted_at` em nenhuma tabela: a exclusão é **hard delete** com",
  `\`on delete cascade\` em ${resumo.onDelete.cascade} chaves, \`set null\` em ${resumo.onDelete.setNull} e \`restrict\` em ${resumo.onDelete.restrict}.`,
  "O que a LGPD exige preservar não é apagado: é **anonimizado** em cascata por",
  "`POST /api/v1/lgpd/anonymize` (nulifica PII, marca `is_anonymized`/`anonymized_at`,",
  "reescreve `display_name`, redige payload de atividades), e a trilha de auditoria",
  "é retida por prazo (abaixo).",
  "",
  "## Retenção",
  "",
  "As janelas estão em `lib/retencao/politica.ts`, com piso que o knob não fura:",
  "",
  "| Trilha | Variável | Padrão | Piso |",
  "|---|---|---|---|",
  "| Fila de jobs (`job_queue`) | `JOB_QUEUE_RETENTION_DAYS` | 90 dias | 7 dias |",
  "| Auditoria (`api_audit_log`/`event_log`) | `AUDIT_LOG_RETENTION_DAYS` | **1825 dias (5 anos — regra L-10)** | 90 dias |",
  "| Espelho de agenda | `CALENDAR_MIRROR_RETENTION_DAYS` | 90 dias | 7 dias |",
  "| Captação de lead | `LEAD_CAPTURE_RETENTION_DAYS` | 365 dias | 30 dias |",
  "| Log de webhook — corpo | `WEBHOOK_LOG_BODY_RETENTION_DAYS` | 7 dias | — |",
  "| Log de webhook — linha | `WEBHOOK_LOG_ROW_RETENTION_DAYS` | 90 dias | — |",
  "",
  "E os crons que executam: " +
    crons
      .map((c) => {
        const papel = c.rpcs.length > 0 ? "poda por prazo (RPC)" : c.mencionaRetencao ? "retenção própria" : "reconciliação";
        return `\`${c.rota}\` (${papel})`;
      })
      .join(", ") +
    ".",
  "",
  "Poda por prazo chama RPC no banco: `fn_podar_fila_de_jobs`,",
  "`fn_expurgar_auditoria_vencida`, `fn_expurgar_espelho_da_agenda` e",
  "`fn_expurgar_nonces_de_oauth` — a auditoria de cada rodada fica em",
  "`retention.sweep_run` no `event_log`.",
  "",
  "## Tabelas",
  "",
  "| Tabela | Colunas | Dono | FKs | Documentada |",
  "|---|---|---|---|---|",
  ...detalhes
    .slice()
    .sort((a, b) => a.tabela.localeCompare(b.tabela))
    .map(
      (d) =>
        `| \`${d.tabela}\` | ${d.colunas} | ${d.temOrganizationId ? "tenant" : "**plataforma**"} | ${d.fks} | ${d.documentada ? "sim" : "—"} |`,
    ),
  "",
];
fs.writeFileSync(join(RAIZ, "docs", "auditoria", "15-tabelas-e-relacoes.md"), linhas.join("\n") + "\n");
console.log(`documento gerado: docs/auditoria/15-tabelas-e-relacoes.md`);

console.log(`tabelas: ${resumo.tabelas}`);
console.log(`  com COMMENT ON TABLE: ${resumo.documentadas}`);
console.log(`  com organization_id:  ${resumo.comOrganizationId} · globais: ${resumo.globais}`);
console.log(`  com deleted_at:       ${resumo.comSoftDelete}`);
console.log(`  FKs: ${resumo.fksTotal} (cascade ${resumo.onDelete.cascade} · restrict ${resumo.onDelete.restrict} · set null ${resumo.onDelete.setNull})`);
console.log(`  crons com DELETE:     ${resumo.cronsComLimpeza}`);
console.log(`\nartefato: ${SAIDA}`);
