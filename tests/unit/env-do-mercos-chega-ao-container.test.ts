/**
 * ENV DOCUMENTADA E ENV ENTREGUE — a distância entre as duas é um recurso que não existe.
 *
 * Medido em 25/11/2026: `MERCOS_DE` e `MERCOS_ATE` entraram no `.env.example`,
 * no `workers/mercos/main.mjs` e no teste — e **não** no `docker-compose.prod.yml`.
 * Resultado: o `.env` da VPS dizia `MERCOS_DE=01/01/2026`, o container subia com
 * ela **vazia** (`echo $MERCOS_DE` → `[]`), e a recuperação de período não fazia
 * nada. O código estava certo; o invólucro não entregava a variável.
 *
 * A regra que este gate impõe é estreita de propósito: **toda `MERCOS_*`
 * documentada no `.env.example` tem que aparecer no `docker-compose.prod.yml`**.
 *
 * Por que só as documentadas, e não toda `process.env.MERCOS_*` do código:
 * o worker lê várias variáveis que ele mesmo injeta ao chamar o coletor
 * (`MERCOS_SAIDA`, `MERCOS_RUN_ID`, `MERCOS_TMP_DIR`) e outras que são sintonia
 * interna com default. Exigi-las no compose produziria uma lista de exceções
 * que ninguém mantém — e gate com allowlist grande não protege nada. A variável
 * que o operador configura é, por definição, a que está no `.env.example`; é
 * ela que precisa chegar ao container.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const EXEMPLO = readFileSync(join(RAIZ, ".env.example"), "utf8");
const COMPOSE = readFileSync(join(RAIZ, "docker-compose.prod.yml"), "utf8");

/** Só as linhas ativas: `# MERCOS_X=...` num comentário não documenta nada. */
function chavesDoExemplo(): string[] {
  const chaves = EXEMPLO.split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .map((l) => l.match(/^(MERCOS_[A-Z0-9_]+)=/)?.[1])
    .filter((k): k is string => Boolean(k));
  return [...new Set(chaves)].sort();
}

function chavesDoCompose(): string[] {
  // Comentário no compose não passa variável para o container: o teste olha a
  // linha de mapeamento (`MERCOS_X: ${...}`).
  const chaves = COMPOSE.split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .map((l) => l.match(/^\s+(MERCOS_[A-Z0-9_]+):\s*\$\{/)?.[1])
    .filter((k): k is string => Boolean(k));
  return [...new Set(chaves)].sort();
}

describe("env do Mercos: documentada = entregue", () => {
  it("o exemplo tem chaves (controle positivo — sem isso o teste passa vazio)", () => {
    expect(chavesDoExemplo().length).toBeGreaterThan(3);
  });

  it("o compose entrega todas as chaves documentadas no .env.example", () => {
    const documentadas = chavesDoExemplo();
    const entregues = new Set(chavesDoCompose());
    const faltando = documentadas.filter((k) => !entregues.has(k));

    expect(
      faltando,
      `Estas variáveis estão no .env.example e o compose NÃO passa ao container — ` +
        `o operador configura e o container nasce vazio: ${faltando.join(", ")}`,
    ).toEqual([]);
  });

  it("a recuperação de período é entregue (as duas juntas ou nenhuma)", () => {
    const entregues = new Set(chavesDoCompose());
    // `MERCOS_DE` sozinho não alcança pedido antigo: o coletor percorre a LISTA
    // por período, então os dois lados da janela precisam chegar.
    expect(entregues.has("MERCOS_DE")).toBe(true);
    expect(entregues.has("MERCOS_ATE")).toBe(true);
  });
});
