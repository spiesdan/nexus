/**
 * NENHUMA ROTA ESCREVE COLUNA QUE NÃO EXISTE.
 *
 * ═══ A ARMADILHA ═════════════════════════════════════════════════════════
 *
 * `automatic_sales_campaigns` **não tem** coluna `created_by` — nem no banco
 * de produção, nem em `lib/database.types.ts`. E a rota escrevia:
 *
 *     .insert({ ..., responsavel_user_id, created_by: authz.user.id })
 *
 * O TypeScript **aceita**, porque o `.insert()` do cliente não é estrito o
 * bastante para reclamar de uma chave a mais. O Postgres **recusa**, com
 * "column not found", e a rota devolve 500 — em TODA criação de campanha de
 * venda automática, que é o botão que o dono usa.
 *
 * É a MESMA classe do `comando_da_conversa` (que é função, não coluna), e as
 * duas apareceram na mesma semana. Por isso o teste é geral: não é "esta
 * coluna existe", é "**toda** coluna que esta rota escreve existe no tipo
 * gerado" — que é o espelho do schema.
 *
 * ─── MUTAÇÃO PROVADA ═════════════════════════════════════════════════════
 *
 * Readicionar qualquer chave que não exista no tipo gerado no `.insert()` desta
 * rota reprova `toda coluna escrita existe no tipo gerado do schema`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const TIPOS = readFileSync(join(process.cwd(), "lib/database.types.ts"), "utf8");
const RAIZ = process.cwd();

/** As chaves declaradas na Row de uma tabela, lidas do arquivo gerado. */
export function colunasDaTabela(tabela: string): Set<string> {
  const linhas = TIPOS.split("\n");
  const inicio = linhas.findIndex((l) => l.trim() === `${tabela}: {`);
  if (inicio < 0) return new Set();
  const row = linhas.findIndex((l, i) => i > inicio && l.trim() === "Row: {");
  const colunas = new Set<string>();
  for (let i = row + 1; i < linhas.length; i++) {
    const l = linhas[i] ?? "";
    if (l.trim() === "};") break;
    const m = /^\s+([a-z_][a-z0-9_]*):/.exec(l);
    if (m?.[1]) colunas.add(m[1]);
  }
  return colunas;
}

/** As chaves de um `.insert({...})` numa rota, por nome de arquivo. */
function chavesDoInsert(arquivo: string, tabela: string): string[] {
  const fonte = readFileSync(join(RAIZ, arquivo), "utf8");
  const linhas = fonte.split("\n");
  const i = linhas.findIndex((l) => l.includes(`"${tabela}"`) && l.includes(".from("));
  if (i < 0) return [];
  const abre = linhas.findIndex((l, k) => k > i && l.includes(".insert({"));
  if (abre < 0) return [];
  const chaves: string[] = [];
  for (let k = abre + 1; k < linhas.length; k++) {
    const m = /^\s+([a-z_][a-z0-9_]*):/.exec(linhas[k] ?? "");
    if (m?.[1]) chaves.push(m[1]);
    if ((linhas[k] ?? "").includes("})")) break;
  }
  return chaves;
}

describe("automatic-sales/campaigns — o insert bate com o schema", () => {
  const TABELA = "automatic_sales_campaigns";
  const ARQUIVO = "app/api/v1/automatic-sales/campaigns/route.ts";

  it("a tabela é lida do tipo gerado (guarda de vácuo)", () => {
    // Um `Set` vazio faz TODO `expect` abaixo passar. Esta linha é a que
    // impede o teste de ser verde por não estar medindo nada.
    const colunas = colunasDaTabela(TABELA);
    expect(colunas.size).toBeGreaterThan(10);
    expect(colunas.has("nome")).toBe(true);
  });

  it("o insert da rota tem colunas para ler (guarda de vácuo)", () => {
    expect(chavesDoInsert(ARQUIVO, TABELA).length).toBeGreaterThan(5);
  });

  it("toda coluna escrita existe no tipo gerado do schema", () => {
    const colunas = colunasDaTabela(TABELA);
    const escritas = chavesDoInsert(ARQUIVO, TABELA);
    const inexistentes = escritas.filter((c) => !colunas.has(c));
    expect(
      inexistentes,
      `${inexistentes.join(", ")} não existe em ${TABELA} — o Postgres recusa com ` +
        `"column not found" e a rota devolve 500. Se a coluna for necessária, ela ` +
        `entra por migration + apêndice do baseline + MANIFEST.`,
    ).toEqual([]);
  });

  it("NAO escreve created_by — a coluna nunca existiu nessa tabela", () => {
    // A asserção nomeada: a falha diz a HISTÓRIA, não só o sintoma.
    expect(chavesDoInsert(ARQUIVO, TABELA)).not.toContain("created_by");
    expect(colunasDaTabela(TABELA).has("created_by")).toBe(false);
  });

  it("created_by NÃO é só esta tabela — outras têm, e por isso a confusão", () => {
    // `commercial_orders` TEM `created_by`. Uma rota que olha "uso created_by em
    // outra tabela" e conclui que o padrão existe em todas passa o typecheck e
    // quebra só nesta.
    expect(colunasDaTabela("commercial_orders").has("created_by")).toBe(true);
  });
});
