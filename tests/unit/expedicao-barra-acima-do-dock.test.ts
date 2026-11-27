import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

/**
 * A BARRA DE AVANÇO DA NOVA CARGA COMPÕE COM O DOCK.
 *
 * Medido em 26/11/2026 em 390×844: o dock fixo (~57 px) cobria o botão
 * "Continuar: equipe e veículo" quando ele entrava na viewport, e o primeiro
 * toque caía na navegação. A decisão foi compor — barra acima do dock —, não
 * esconder o dock: `SEM_DOCK` é exceção documentada para telas com barra de
 * revisão própria, e a nova carga não tinha barra fixa.
 *
 * Este teste existe para a correção não regredir para o atalho de esconder o
 * dock (que tiraria a navegação de uma tela de fluxo) nem perder o `env()` do
 * aparelho com home indicator.
 */
describe("nova carga — barra de avanço acima do dock", () => {
  const cliente = ler("app/app/expedicao/nova/_client.tsx");
  const dock = ler("components/shell/MobileDock.tsx");

  it("a nova carga continua com o dock; a exceção não virou precedente", () => {
    const semDock = dock.slice(dock.indexOf("const SEM_DOCK"), dock.indexOf("export function MobileDock"));
    expect(semDock).toContain('"/app/pedidos/novo"');
    expect(semDock).not.toContain("/app/expedicao/nova");
  });

  it("a barra fica acima do dock e respeita a safe area", () => {
    // 57 px do dock = 44 do item + 12 do py-1.5 + 1 da borda, mais o inset.
    expect(cliente).toContain("bottom-[calc(3.5rem_+_1px_+_env(safe-area-inset-bottom))]");
    expect(cliente).toContain("md:static");
  });

  it("o botão de avançar continua com alvo de toque e rótulo de conteúdo", () => {
    expect(cliente).toContain("Continuar: equipe e veículo");
    expect(cliente).toContain("min-h-11 w-full md:w-auto");
  });
});
