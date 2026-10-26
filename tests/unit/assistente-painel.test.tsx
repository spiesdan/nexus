/**
 * O assistente: gatilho na TopBar, painel de altura cheia à direita.
 *
 * ─── O defeito que este teste impede ────────────────────────────────────────
 *
 * O gatilho e o painel moram em lugares diferentes da casca (TopBar e fim do
 * `AppShell`), ligados pelo `AssistenteProvider`. Sem uma guarda, é fácil o
 * painel deixar de abrir — ou abrir sem `aria-expanded`/`aria-controls`, o que
 * quebra quem navega por leitor de tela — e ninguém percebe até a tela.
 *
 * Também prende o desenho: o painel é uma superfície de altura cheia
 * (`data-assistente="painel"`), não um balão de canto. O antigo FAB flutuante
 * não deve voltar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/app/pedidos" }));

import { AssistenteAvatar } from "@/components/assistente/AssistenteAvatar";
import { AssistentePainel } from "@/components/assistente/AssistentePainel";
import { AssistenteProvider, useAssistente } from "@/components/assistente/AssistenteProvider";

/** O gatilho, na forma que a TopBar usa. */
function Gatilho() {
  const { aberto, alternar } = useAssistente();
  return <AssistenteAvatar aberto={aberto} onToggle={alternar} />;
}

function Cena() {
  return (
    <AssistenteProvider>
      <Gatilho />
      <AssistentePainel />
    </AssistenteProvider>
  );
}

const painel = () => document.querySelector('[data-assistente="painel"]');

beforeEach(() => {
  // jsdom não implementa `Element.scrollTo` (o histórico do chat rola ao abrir).
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => undefined;
  }
  // jsdom não tem `matchMedia`. Devolver `matches: true` deixa o avatar em
  // `calmo` (imagem fixa): o teste mede o painel, não o loop de animação.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      media: "",
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("assistente — gatilho na barra e painel lateral", () => {
  it("fecha por padrão: nenhum painel no DOM", () => {
    render(<Cena />);
    expect(painel()).toBeNull();
  });

  it("o clique no gatilho abre o painel de altura cheia e anuncia o estado", () => {
    render(<Cena />);
    const botao = screen.getByRole("button", { name: "Abrir assistente" });

    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(botao).toHaveAttribute("aria-controls", "assistente-painel");

    fireEvent.click(botao);

    expect(painel()).not.toBeNull();
    // Altura cheia, encostado à direita e abaixo da TopBar (h-14): é uma aba,
    // não um balão ancorado no canto.
    expect(painel()?.className).toContain("fixed");
    expect(painel()?.className).toContain("top-14");
    expect(painel()?.className).toContain("bottom-0");
    expect(painel()?.className).toContain("right-0");
    expect(screen.getByRole("dialog", { name: "Assistente" })).toBeInTheDocument();
    expect(botao).toHaveAttribute("aria-expanded", "true");
  });

  it("`Esc` fecha, e o segundo clique no gatilho também", () => {
    render(<Cena />);
    const botao = screen.getByRole("button", { name: "Abrir assistente" });

    fireEvent.click(botao);
    expect(painel()).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(painel()).toBeNull();

    fireEvent.click(botao);
    expect(painel()).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Fechar assistente" }));
    expect(painel()).toBeNull();
  });

  it("não existe mais o avatar flutuante do canto", async () => {
    const { existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    expect(
      existsSync(resolve(process.cwd(), "components/assistente/AssistenteFlutuante.tsx")),
    ).toBe(false);
  });
});
