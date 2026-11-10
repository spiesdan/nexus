import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 0301 · a tag única do Mercos.
 *
 * A segunda tag `mercos:pedido-sem-cadastro` marcava o "stub" — a ficha criada
 * só para o pedido não ficar órfão. Com o cadastro virando o cadastro do ERP
 * (1:1), a ficha criada PELA importação é o próprio cadastro do cliente: o stub
 * deixou de existir.
 *
 * Este teste trava a DIREITA no código de produto: nenhum arquivo que escreva em
 * `contacts.tags` pode reintroduzir a tag dupla. As regras de fusão e as funções
 * RPC do banco têm invariante próprio em `tests/invariants/mercos-cadastro-1_para_1.test.ts`.
 */

const RAIZ = join(process.cwd());

function diretorios(rel: string): string[] {
  const base = join(RAIZ, rel);
  const sai: string[] = [];
  for (const entrada of readdirSync(base, { withFileTypes: true })) {
    const caminho = join(base, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "node_modules" || entrada.name === ".next" || entrada.name === "build" || entrada.name === "dist") continue;
      sai.push(...diretorios(join(rel, entrada.name)));
    } else if (entrada.isFile() && /\.(ts|tsx|mjs|js)$/.test(entrada.name)) {
      sai.push(caminho);
    }
  }
  return sai;
}

const ESCRITORES = [
  ...diretorios("lib"),
  ...diretorios("app"),
  ...diretorios("workers"),
  ...diretorios("scripts"),
];

describe("0301 · a tag do Mercos é única (`mercos`)", () => {
  it("nenhum módulo de produto escreve mais a tag `mercos:pedido-sem-cadastro`", () => {
    const escritas = ESCRITORES.filter((caminho) => readFileSync(caminho, "utf8").includes("mercos:pedido-sem-cadastro"));
    expect(escritas).toEqual([]);
  });

  it("o importador legado e o RPC da importação marcam com a tag única", () => {
    const legado = readFileSync(join(RAIZ, "docs/legacy/mercos-scrape/importar-mercos.ts"), "utf8");
    expect(legado).toContain('tags: ["mercos"]');

    const rota = readFileSync(join(RAIZ, "app/api/v1/commercial-orders/importar-mercos/route.ts"), "utf8");
    // A rota apenas enfileira; quem grava é a RPC. A garantia de tag mora no
    // corpo da função — esta asserção trava que a superfície pública não nasceu
    // com o vocabulário antigo.
    expect(rota).not.toContain("pedido-sem-cadastro");
  });
});
