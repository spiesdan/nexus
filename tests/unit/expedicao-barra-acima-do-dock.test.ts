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
 *
 * 27/11/2026: o dock pode devolver `null` (papel sem destinos, rota em
 * `SEM_DOCK`). A barra perguntava nada e ficava 57 px acima do vazio; agora ela
 * lê a presença do MESMO resolvedor que o dock usa.
 */
describe("nova carga — barra de avanço acima do dock", () => {
  const cliente = ler("app/app/expedicao/nova/_client.tsx");
  const dock = ler("components/shell/MobileDock.tsx");
  const shell = ler("app/app/_components/AppShell.tsx");

  it("a nova carga continua com o dock; a exceção não virou precedente", () => {
    const semDock = dock.slice(
      dock.indexOf("const SEM_DOCK"),
      dock.indexOf("export function destinosDoDock"),
    );
    expect(semDock).toContain('"/app/pedidos/novo"');
    expect(semDock).not.toContain("/app/expedicao/nova");
  });

  it("presença do dock é decidida uma vez e publicada para a página", () => {
    // O dock e a casca não podem discordar: a regra mora em `dockPresente`.
    expect(dock).toContain("export function dockPresente(");
    expect(dock).toContain("export function destinosDoDock(");
    expect(shell).toContain("dockPresente(");
    expect(shell).toContain("DockPresenceProvider");
    expect(cliente).toContain("useDockPresente()");
  });

  it("a barra fica acima do dock e respeita a safe area", () => {
    // 57 px do dock = 44 do item + 12 do py-1.5 + 1 da borda, mais o inset.
    expect(cliente).toContain("bottom-[calc(3.5rem_+_1px_+_env(safe-area-inset-bottom))]");
    expect(cliente).toContain("md:static");
  });

  it("sem dock a barra desce ao rodapé e a safe area vai num wrapper", () => {
    // `bottom-0` no caso ausente; o `env()` do home indicator fica num
    // wrapper (o gate de espaçamento recusa `calc()` em valor arbitrário).
    expect(cliente).toContain('"bottom-0"');
    expect(cliente).toContain('"pb-[env(safe-area-inset-bottom)] md:pb-0"');
    expect(cliente).not.toContain("pb-[calc(");
    // O atributo de diagnóstico é o que o e2e lê.
    expect(cliente).toContain('data-dock={dockPresenteNaTela ? "presente" : "ausente"}');
  });

  it("o teclado reduz a viewport visual e a barra sobe junto", () => {
    expect(cliente).toContain("window.visualViewport");
    expect(cliente).toContain('vv.addEventListener("resize", medir)');
    expect(cliente).toContain("style={tecladoPx > 0 ? { bottom: tecladoPx } : undefined}");
  });

  it("o botão de avançar continua com alvo de toque e rótulo de conteúdo", () => {
    expect(cliente).toContain("Continuar: equipe e veículo");
    expect(cliente).toContain("min-h-11 w-full md:w-auto");
  });
});
