import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const pagina = fs.readFileSync(path.join(RAIZ, "app/app/notas/page.tsx"), "utf8");

/**
 * A FOLGA DO DOCK NA TELA DE NOTAS.
 *
 * Medido em produção (390×844): o botão de emitir ocupava 780,5–824,5 e o dock
 * começava em 787 — 37 px do botão ficavam sob a barra. O `pb-24` móvel é o
 * que reserva a faixa; o `main` já tem a sua, mas o container `h-full` desta
 * tela não a herdava para o fim do formulário.
 */
describe("notas — folga para o dock no mobile", () => {
  it("a página reserva pb-24 no mobile e mantém o desktop", () => {
    expect(pagina).toContain("p-6 pb-24 md:pb-6");
    expect(pagina).toContain("dock fixo");
  });
});
