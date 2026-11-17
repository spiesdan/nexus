/**
 * O CABEÇALHO NÃO PODE ESMAGAR O TÍTULO NO TABLET.
 *
 * ─── O DEFEITO, MEDIDO ─────────────────────────────────────────────────────
 *
 * Em 834 px (tablet), `/app/pedidos` renderizava o `<h1>` com **0 px de
 * largura**: o bloco de ações (Importar Mercos, Imprimir, Criar pedido) tomava a
 * linha inteira e o bloco do título encolhia até o subtítulo virar uma coluna de
 * uma palavra por linha — "Os / pedidos / da / loja, / do / rascunho…".
 *
 * A causa estava no ponto de quebra: `sm:flex-row` (640 px) colocava título e
 * ações lado a lado cedo demais, e `min-w-0` no bloco do título permitia que ele
 * chegasse a zero sem nunca reclamar.
 *
 * ─── A REGRA ──────────────────────────────────────────────────────────────
 *
 * Cabeçalho de página empilha até `lg` (1024 px). Abaixo disso, título em cima e
 * ações embaixo — nunca os dois disputando a mesma linha. Este gate cobra a
 * classe, porque layout não se mede em jsdom.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ARQUIVO = "components/nexus-ui/layout/NexusPageHeader.tsx";

describe("NexusPageHeader no tablet", () => {
  const codigo = readFileSync(join(process.cwd(), ARQUIVO), "utf8");

  it("empilha até `lg` — não vira linha em `sm`", () => {
    expect(codigo).toContain("flex flex-col gap-3 lg:flex-row");
    expect(codigo).not.toContain("sm:flex-row");
  });

  it("as ações alinham à direita só quando há linha", () => {
    expect(codigo).toContain("lg:justify-end");
    expect(codigo).not.toContain("sm:justify-end");
  });
});
