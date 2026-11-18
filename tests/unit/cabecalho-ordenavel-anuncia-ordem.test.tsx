/**
 * CABEÇALHO QUE ORDENA PRECISA DIZER POR ONDE E EM QUE DIREÇÃO.
 *
 * ─── O ESTADO MEDIDO (18/11/2026) ─────────────────────────────────────────
 *
 * `scope="col"` (V-63) diz "esta célula é o cabeçalho da coluna". Não diz que a
 * tabela está ordenada, nem por qual coluna, nem em que sentido — e é isso que
 * `aria-sort` carrega, no `columnheader` (não no botão).
 *
 * Varredura do produto: **uma** tabela ordenável, `/app/contacts`, e ela já
 * declara `aria-sort` desde a V-48 (`components/contacts/ContactsTable.tsx:83`).
 * Ou seja, o defeito não existe hoje — este teste existe para que a próxima
 * coluna ordenável não nasça muda, que é como o defeito nasceria.
 *
 * A régua: um `<TableHead>` que contém `<button>` (o gatilho de ordenação)
 * precisa declarar `aria-sort` no próprio `<TableHead>` — nunca no botão, onde
 * o axe reprova (`aria-allowed-attr`) e o leitor de tela ignora.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = process.cwd();

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of fs.readdirSync(path.join(RAIZ, dir))) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const rel = path.join(dir, nome);
    if (fs.statSync(path.join(RAIZ, rel)).isDirectory()) saida.push(...arquivos(rel));
    else if (/\.tsx$/.test(nome) && !nome.includes(".test.")) saida.push(rel);
  }
  return saida;
}

const TODOS = arquivos("app").concat(arquivos("components"));

describe("cabeçalho ordenável anuncia a ordem", () => {
  it("existe pelo menos uma coluna ordenável — senão o teste não mede nada", () => {
    const ordenaveis = TODOS.filter((f) =>
      /aria-sort/.test(fs.readFileSync(path.join(RAIZ, f), "utf8")),
    );
    expect(ordenaveis.length).toBeGreaterThan(0);
  });

  it.each(TODOS)("%s", (arquivo) => {
    const codigo = semComentarios(fs.readFileSync(path.join(RAIZ, arquivo), "utf8"));

    // Cada `<TableHead>` e o seu conteúdo até o fechamento.
    for (const achado of codigo.matchAll(/<TableHead\b([\s\S]{0,4000}?)<\/TableHead>/g)) {
      const bloco = achado[0];
      const abertura = bloco.slice(0, bloco.indexOf(">") + 1);
      const temBotao = /<button\b/.test(bloco);
      if (!temBotao) continue;

      expect(
        /aria-sort=/.test(abertura),
        `${arquivo}: cabeçalho com botão de ordenação sem aria-sort no <TableHead>`,
      ).toBe(true);
    }

    // E o inverso: `aria-sort` no botão não vale (axe reprova).
    for (const botao of codigo.matchAll(/<button\b[^>]*>/g)) {
      expect(
        /aria-sort=/.test(botao[0]),
        `${arquivo}: aria-sort no <button> — o atributo é do columnheader`,
      ).toBe(false);
    }
  });
});
