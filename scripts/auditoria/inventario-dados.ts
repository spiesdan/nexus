/**
 * INVENTÁRIO DE DADOS — o que existe no schema, medido em três fontes.
 *
 * Por que três: cada uma conta uma verdade diferente, e a divergência entre
 * elas É o achado.
 *
 *   1. `lib/database.types.ts` — o que o TypeScript acha que existe (gerado do
 *      Supabase). Se está aqui e não está no SQL, alguém tem tabela só na nuvem.
 *   2. `supabase/baseline.sql` — o que uma instalação NOVA recebe.
 *   3. `supabase/migrations/*.sql` — o que uma instalação ANTIGA recebe ao
 *      atualizar. Se baseline e migrations divergem, o self-host quebra em
 *      silêncio — é o defeito mais caro do modelo de distribuição.
 *
 * O script não julga qualidade: mede presença e aponta a diferença.
 *
 * Uso: pnpm exec tsx scripts/auditoria/inventario-dados.ts
 * Saída: docs/auditoria/04-inventario-dados.md + 04-inventario-dados.json
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const SAIDA_MD = join(RAIZ, "docs", "auditoria", "04-inventario-dados.md");
const SAIDA_JSON = join(RAIZ, "docs", "auditoria", "04-inventario-dados.json");

/** Nomes no bloco `public:` de database.types.ts. */
function nomesDosTipos(fonte: string, secao: "Tables" | "Views" | "Functions" | "Enums"): string[] {
  const inicioPublic = fonte.indexOf("\n  public: {");
  if (inicioPublic < 0) return [];
  const restante = fonte.slice(inicioPublic);
  const abre = restante.indexOf(`    ${secao}: {`);
  if (abre < 0) return [];
  // A seção termina no próximo `    };` na mesma indentação.
  const fecha = restante.indexOf("\n    };", abre);
  const bloco = restante.slice(abre, fecha < 0 ? undefined : fecha);
  const nomes: string[] = [];
  for (const linha of bloco.split("\n")) {
    const m = /^ {6}([a-z0-9_]+): \{$/.exec(linha);
    if (m) nomes.push(m[1]!);
  }
  return [...new Set(nomes)].sort();
}

interface Contagem {
  tabelas: Set<string>;
  views: Set<string>;
  funcoes: Set<string>;
  enums: Set<string>;
  triggers: Set<string>;
  comRls: Set<string>;
  politicas: Map<string, number>;
}

function vazio(): Contagem {
  return {
    tabelas: new Set(),
    views: new Set(),
    funcoes: new Set(),
    enums: new Set(),
    triggers: new Set(),
    comRls: new Set(),
    politicas: new Map(),
  };
}

/**
 * Nomes entre aspas ou não, com ou sem `public.`. SQL escrito à mão no repo usa
 * as duas formas — regex que só entende uma delas subconta e o inventário mente.
 */
const NOME = String.raw`(?:"?public"?\.)?"?([a-z0-9_]+)"?`;

/**
 * SQL comentado mente: `-- create table acima` vira "tabela acima" na regex.
 * Remover comentários antes de contar é o que separa medir de inventar.
 *
 * Isto é um SCANNER, não regex — e a diferença já custou duas medições erradas:
 *   1ª: sem limpar, `-- ... acima` entrou como tabela;
 *   2ª: limpando com `/\/\*[\s\S]*?\*\//` no arquivo inteiro, um `/*` DENTRO de
 *       comentário de linha (`-- rotas /api/v1/system/*`) abriu um bloco falso e
 *       engoliu 3 `create table` reais — o inventário acusou como "ausente no
 *       baseline" três tabelas que estavam lá, na linha 9271.
 *
 * O scanner respeita, em ordem: literal '...', dollar-quote $$...$$, comentário de
 * linha, comentário de bloco (aninhado, como o Postgres aceita). Uma passada só.
 */
function limparSql(sql: string): string {
  let saida = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i]!;
    const prox = sql[i + 1];

    if (c === "'") {
      // literal: copia até o ' de fechamento, tratando '' como escape
      saida += c;
      i++;
      while (i < sql.length) {
        saida += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            saida += sql[i + 1];
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      i++;
      continue;
    }

    if (c === "$") {
      const tag = /^\$[a-zA-Z_]*\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        const fim = sql.indexOf(tag, i + tag.length);
        const ate = fim < 0 ? sql.length : fim + tag.length;
        saida += sql.slice(i, ate);
        i = ate;
        continue;
      }
    }

    if (c === "-" && prox === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }

    if (c === "/" && prox === "*") {
      let profundidade = 1;
      i += 2;
      while (i < sql.length && profundidade > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          profundidade++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          profundidade--;
          i += 2;
        } else {
          i++;
        }
      }
      saida += " ";
      continue;
    }

    saida += c;
    i++;
  }
  return saida;
}

function contarSql(texto: string, alvo: Contagem): void {
  const sql = limparSql(texto);
  const add = (re: RegExp, destino: Set<string>) => {
    for (const m of sql.matchAll(re)) if (m[1]) destino.add(m[1]);
  };

  add(new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${NOME}`, "gi"), alvo.tabelas);
  add(new RegExp(String.raw`create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+${NOME}`, "gi"), alvo.views);
  add(new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+${NOME}`, "gi"), alvo.funcoes);
  add(new RegExp(String.raw`create\s+type\s+${NOME}\s+as\s+enum`, "gi"), alvo.enums);
  add(new RegExp(String.raw`create\s+trigger\s+"?([a-z0-9_]+)"?`, "gi"), alvo.triggers);
  add(
    new RegExp(
      String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NOME}\s+enable\s+row\s+level\s+security`,
      "gi",
    ),
    alvo.comRls,
  );

  for (const m of sql.matchAll(new RegExp(String.raw`create\s+policy\s+"?([^"\s]+)"?\s+on\s+${NOME}`, "gi"))) {
    const tabela = m[2]!;
    alvo.politicas.set(tabela, (alvo.politicas.get(tabela) ?? 0) + 1);
  }
}

const tipos = readFileSync(join(RAIZ, "lib", "database.types.ts"), "utf8");
const doTipos = {
  tabelas: nomesDosTipos(tipos, "Tables"),
  views: nomesDosTipos(tipos, "Views"),
  funcoes: nomesDosTipos(tipos, "Functions"),
  enums: nomesDosTipos(tipos, "Enums"),
};

const baseline = readFileSync(join(RAIZ, "supabase", "baseline.sql"), "utf8");
const doBaseline = vazio();
contarSql(baseline, doBaseline);

const dirMigrations = join(RAIZ, "supabase", "migrations");
const arquivos = readdirSync(dirMigrations).filter((f) => f.endsWith(".sql")).sort();
const doMigrations = vazio();
for (const arquivo of arquivos) contarSql(readFileSync(join(dirMigrations, arquivo), "utf8"), doMigrations);

const diferenca = (a: string[], b: Set<string>): string[] => a.filter((x) => !b.has(x)).sort();
const semTipo = (conjunto: Set<string>, lista: string[]): string[] =>
  [...conjunto].filter((x) => !lista.includes(x)).sort();

const tabelasSemRls = [...doBaseline.tabelas].filter((t) => !doBaseline.comRls.has(t)).sort();
const semPolitica = [...doBaseline.comRls].filter((t) => !doBaseline.politicas.has(t)).sort();
const politicasTotal = [...doBaseline.politicas.values()].reduce((a, b) => a + b, 0);

const resumo = {
  gerado_em: new Date().toISOString(),
  fontes: {
    tipos: {
      tabelas: doTipos.tabelas.length,
      views: doTipos.views.length,
      funcoes: doTipos.funcoes.length,
      enums: doTipos.enums.length,
    },
    baseline: {
      tabelas: doBaseline.tabelas.size,
      views: doBaseline.views.size,
      funcoes: doBaseline.funcoes.size,
      enums: doBaseline.enums.size,
      triggers: doBaseline.triggers.size,
      com_rls: doBaseline.comRls.size,
      politicas: politicasTotal,
    },
    migrations: {
      arquivos: arquivos.length,
      tabelas: doMigrations.tabelas.size,
      views: doMigrations.views.size,
      funcoes: doMigrations.funcoes.size,
      enums: doMigrations.enums.size,
      triggers: doMigrations.triggers.size,
      com_rls: doMigrations.comRls.size,
      politicas: [...doMigrations.politicas.values()].reduce((a, b) => a + b, 0),
    },
  },
  divergencias: {
    no_tipo_sem_baseline: diferenca(doTipos.tabelas, doBaseline.tabelas),
    no_tipo_sem_migration: diferenca(doTipos.tabelas, doMigrations.tabelas),
    no_baseline_sem_migration: diferenca([...doBaseline.tabelas], doMigrations.tabelas),
    nas_migrations_sem_baseline: diferenca([...doMigrations.tabelas], doBaseline.tabelas),
  },
  rls: {
    tabelas_sem_rls: tabelasSemRls,
    com_rls_sem_politica: semPolitica,
  },
  funcoes_sem_tipo: semTipo(doBaseline.funcoes, doTipos.funcoes),
};

writeFileSync(SAIDA_JSON, JSON.stringify({ resumo, tabelas: [...doBaseline.tabelas].sort() }, null, 2) + "\n");

const l: string[] = [];
l.push("# Inventário de dados — medido no schema");
l.push("");
l.push("> Gerado por `pnpm exec tsx scripts/auditoria/inventario-dados.ts`. Não editar à mão.");
l.push("");
l.push("Três fontes, três verdades. Divergência entre elas é achado, não ruído.");
l.push("");
l.push("| Medida | `database.types.ts` | `baseline.sql` | `migrations/` |");
l.push("|---|---|---|---|");
l.push(`| Tabelas | ${doTipos.tabelas.length} | ${doBaseline.tabelas.size} | ${doMigrations.tabelas.size} |`);
l.push(`| Views | ${doTipos.views.length} | ${doBaseline.views.size} | ${doMigrations.views.size} |`);
l.push(`| Funções | ${doTipos.funcoes.length} | ${doBaseline.funcoes.size} | ${doMigrations.funcoes.size} |`);
l.push(`| Enums | ${doTipos.enums.length} | ${doBaseline.enums.size} | ${doMigrations.enums.size} |`);
l.push(`| Triggers | — | ${doBaseline.triggers.size} | ${doMigrations.triggers.size} |`);
l.push(`| Tabelas com RLS (texto) | — | ${doBaseline.comRls.size} | ${doMigrations.comRls.size} |`);
l.push(`| Políticas (texto) | — | ${politicasTotal} | ${[...doMigrations.politicas.values()].reduce((a, b) => a + b, 0)} |`);
l.push("");
l.push(
  "> **As duas últimas linhas contam TEXTO, não banco.** Elas casam",
  "> `enable row level security` e `create policy` no arquivo. O baseline liga RLS",
  "> também por laço (`execute format('alter table public.%I enable row level",
  "> security', t)` em quatro blocos), então a contagem textual SUBESTIMA a",
  "> cobertura. Medido num Postgres limpo com o baseline aplicado: **179 de 179",
  "> tabelas de `public` com RLS ligada, 0 sem** — e 300 políticas em `public`",
  "> (305 com `storage`). A medida no banco, com o diagnóstico de RLS e o replay",
  "> de migrations, está em `docs/auditoria/12-migrations-e-rls.md`.",
);

const lista = (titulo: string, itens: string[]) => {
  l.push(`## ${titulo} (${itens.length})`);
  l.push("");
  if (itens.length === 0) {
    l.push("Nenhum.");
  } else {
    for (const i of itens) l.push(`- \`${i}\``);
  }
  l.push("");
};

lista("Tabelas no TypeScript que NÃO estão no baseline", resumo.divergencias.no_tipo_sem_baseline);
lista("Tabelas no baseline que NÃO estão nas migrations", resumo.divergencias.no_baseline_sem_migration);
lista("Tabelas nas migrations que NÃO estão no baseline", resumo.divergencias.nas_migrations_sem_baseline);
// O título é literal e chato de propósito: a lista abaixo é "sem o comando
// LITERAL no arquivo", NÃO "sem RLS no banco". Chamar de "sem RLS" produziu um
// achado falso de 38 tabelas que, medidas num Postgres real, têm RLS ligada por
// laço. Inventário que mede texto tem de dizer que mede texto.
lista("Tabelas sem `enable row level security` LITERAL no baseline (não é ausência de RLS)", resumo.rls.tabelas_sem_rls);
lista("Tabelas com RLS e NENHUMA política", resumo.rls.com_rls_sem_politica);
lista("Funções no baseline que o TypeScript não conhece", resumo.funcoes_sem_tipo);

writeFileSync(SAIDA_MD, l.join("\n") + "\n");

console.log(
  `ok: baseline ${doBaseline.tabelas.size} tabelas/${doBaseline.comRls.size} com RLS/${politicasTotal} políticas · ` +
    `${resumo.divergencias.no_baseline_sem_migration.length} no baseline sem migration · ` +
    `${tabelasSemRls.length} sem RLS`,
);
