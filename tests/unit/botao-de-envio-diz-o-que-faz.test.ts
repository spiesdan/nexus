/**
 * BOTÃO DE ENVIO DESABILITADO E MUDO É MEIO FEEDBACK.
 *
 * ─── O QUE FOI MEDIDO (17/11/2026) ─────────────────────────────────────────
 *
 * Instrumento novo, `scripts/auditoria/feedback-e-duplicidade.mjs`: o POST é
 * interceptado e abortado depois de 2,5 s (nada grava), e o que se mede é o que
 * o usuário teria na frente — botão desabilitado? rótulo muda? erro aparece?
 *
 * No diálogo de template, o botão desabilitava e continuava escrito
 * "Criar template": o clique não dava resposta nenhuma além do silêncio. No de
 * cliente, o mesmo gesto dizia "Criando…". Medido nas duas telas.
 *
 * E a contagem estática: **4 de 35** botões de envio desabilitavam sem dizer o
 * que estava acontecendo (template, renomear agente, token de API, fonte de
 * captação). Os quatro passaram a dizer. Este gate mantém a regra.
 *
 * ─── A REGRA ──────────────────────────────────────────────────────────────
 *
 * Todo `<Button type="submit">` tem de ter `disabled` (evita duplo envio) **e**
 * um rótulo de progresso no ternário — "Criando…", "Salvando…", "Entrando..." —
 * porque desabilitar sem texto deixa a pessoa sem saber se o clique pegou.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = process.cwd();
/** Palavras que dizem "estou trabalhando" no rótulo. */
const PROGRESSO =
  /(\?[^:\n]{0,120}(\.\.\.|…|Criando|Salvando|Enviando|Aplicando|Entrando|Gerando|Processando|Verificando|Conectando))/;

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(join(RAIZ, dir))) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const relativo = join(dir, nome);
    if (statSync(join(RAIZ, relativo)).isDirectory()) saida.push(...arquivos(relativo));
    else if (nome.endsWith(".tsx") && !nome.includes(".test.")) saida.push(relativo);
  }
  return saida;
}

const TODOS = arquivos("app").concat(arquivos("components"));

describe("todo botão de envio tem disabled e diz o que está fazendo", () => {
  it("há botões de envio no produto (o teste não passa por vacuidade)", () => {
    const total = TODOS.reduce(
      (soma, arquivo) =>
        soma + [...readFileSync(join(RAIZ, arquivo), "utf8").matchAll(/<Button\b[^>]*type="submit"/g)].length,
      0,
    );
    expect(total).toBeGreaterThan(20);
  });

  it.each(TODOS)("%s", (arquivo) => {
    const codigo = semComentarios(readFileSync(join(RAIZ, arquivo), "utf8"));
    for (const m of codigo.matchAll(/<Button\b[^>]*type="submit"[^>]*>/g)) {
      const tag = m[0];
      expect(tag, `${arquivo}: botão de envio sem disabled`).toMatch(/disabled=/);
      const inicio = (m.index ?? 0) + tag.length;
      const depois = codigo.slice(inicio, inicio + 340);
      expect(depois, `${arquivo}: botão de envio não diz que está trabalhando`).toMatch(PROGRESSO);
    }
  });
});
