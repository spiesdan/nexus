import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const pagina = fs.readFileSync(path.join(RAIZ, "app/app/notas/page.tsx"), "utf8");

/**
 * A FOLGA DO DOCK NA TELA DE NOTAS.
 *
 * Medido em produção (390×844): o botão de emitir ocupava 780,5–824,5 e o dock
 * começava em 787. O padding no wrapper NÃO resolvia: o wrapper é `h-full` e o
 * scroll é o `main`; a folga precisa ser um espaçador dentro do conteúdo do
 * TabsContent de emitir, depois do botão.
 */
describe("notas — folga para o dock no mobile", () => {
  it("o espaçador entra no TabsContent de emitir, dentro do fluxo de rolagem", () => {
    expect(pagina).toContain('data-testid="nfe-folga-dock"');
    expect(pagina).toContain("h-24 md:hidden");
    // O wrapper não é o scroller; padding nele não entrou no fluxo.
    expect(pagina).not.toContain("p-6 pb-24 md:pb-6");
  });
});
