/**
 * MATRIZ 41 · §2.3 — OS ARQUIVOS DE ESTADO DE ERRO (não são rotas).
 *
 * `app/not-found.tsx`, `app/error.tsx` e `app/global-error.tsx` existem desde
 * sempre e **não estavam na matriz**: zero menções a 404. O E2E cobria a cópia do
 * `/404`; ninguém tinha olhado a superfície (nome, ID, botões, reset).
 *
 * O 404 foi medido no navegador (vai no §2.3). Os dois boundaries não têm rota
 * de gatilho no produto — medir no navegador exigiria inventar uma exceção — e
 * ficam aqui, no que dá para provar sem mentir: estrutura, nomes e reset.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: vi.fn(async () => true) }));
// O boundary importa o SDK sob demanda (first load); aqui ele responde o ID.
vi.mock("@sentry/nextjs", () => ({ captureException: () => "evento-123" }));

import ErroDoSegmento from "@/app/error";
import ErroGlobal from "@/app/global-error";
import { SegmentError } from "@/components/feedback/SegmentError";

describe("app/error.tsx — boundary de segmento (root)", () => {
  it("mostra título, ID do erro e os dois botões com nome acessível", async () => {
    const reset = vi.fn();
    render(<ErroDoSegmento error={Object.assign(new Error("boom"), { digest: "dig-1" })} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Algo deu errado" })).toBeTruthy();
    expect(screen.getByText(/ID:/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copiar ID" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
  });

  it("o botão de tentar de novo chama o reset", () => {
    const reset = vi.fn();
    render(<SegmentError error={new Error("boom")} reset={reset} segment="root" />);

    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("app/global-error.tsx — fallback do layout raiz", () => {
  it("renderiza a página inteira em pt-BR, com ID e os dois botões", () => {
    const reset = vi.fn();
    render(<ErroGlobal error={Object.assign(new Error("raiz"), { digest: "raiz-1" })} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Algo deu errado" })).toBeTruthy();
    expect(screen.getByText(/ID:/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("não depende do tema: as cores são inline (o layout que falhou é quem carrega o CSS)", () => {
    render(<ErroGlobal error={new Error("raiz")} reset={vi.fn()} />);
    const corpo = document.querySelector("body");
    // Prova a decisão, não a aparência: se alguém trocar o inline por classe
    // (`bg-background`), este teste avisa — no boundary global não existe
    // stylesheet garantido.
    expect(corpo?.getAttribute("style") ?? "").toContain("background");
  });
});
