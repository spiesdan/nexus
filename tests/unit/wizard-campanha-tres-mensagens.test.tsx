/**

 * O ASSISTENTE "ENCONTRAR EMPRESAS" ABRE COM **TRÊS** MENSAGENS — E SALVA.
 *
 * Medido na tela do dono em 2026-10-20: o passo "Mensagem" tinha UM campo, e
 * o texto nem entrava no POST da campanha. Quem escrevia a abordagem ali
 * perdia o texto ao aprovar, e o painel Disparo (que sempre aceitou 1..5
 * variações em rotação) abria vazio.
 *
 * Este teste cobra o contrato mínimo do pedido:
 *   1. três caixas na tela, "+ Variação" até o teto de 5;
 *   2. as mensagens PREENCHIDAS viajam no corpo do POST da campanha.
 *
 * O que ele NÃO prova: que o motor alterna. Isso é `agendado.test.ts` (o caso
 * `(d2)` fecha 1→2→3→1) e `disparo.test.ts` (a rotação do planejador).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CampanhaWizard } from "@/app/app/prospeccao/_campanha-wizard";
import type { MacroCategoria } from "@/lib/prospeccao/categorias";

const post = vi.fn();

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    post: (...args: unknown[]) => post(...args),
    get: vi.fn(async () => ({ data: [] })),
    patch: vi.fn(),
  },
}));

vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({ data: [] }),
}));

const CATEGORIAS: MacroCategoria[] = [
  {
    macro: "Serviços",
    subcategorias: [{ rotulo: "Oficina", busca: "oficina" }] as never,
  },
];

afterEach(cleanup);

beforeEach(() => {
  post.mockReset();
  post.mockImplementation(async (url: string) => {
    if (url.endsWith("/executar")) return { data: { buscas: 1, sem_mapa: [] } };
    return { data: { id: "campanha-1" } };
  });
});

function abrir(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CampanhaWizard categorias={CATEGORIAS} aoConcluir={() => {}} />
    </QueryClientProvider>,
  );
}

/** Passa do passo 0 (segmentação) para o passo 1 e daí para o 2. */
function irAteAsMensagens(): void {
  fireEvent.change(screen.getByLabelText("Nome da campanha"), {
    target: { value: "Oficinas do Norte" },
  });
  fireEvent.click(screen.getByText("Oficina"));
  fireEvent.change(screen.getByLabelText("Cidades (uma por linha, Cidade/UF)"), {
    target: { value: "Canoinhas/SC" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  // O passo 1 estima o mercado; mesmo sem dados, dá para continuar.
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

const PLACEHOLDER_1 = "Olá {{primeiro_nome}}! Aqui é da …";
const PLACEHOLDER_N = "Outra forma de dizer a mesma coisa";

describe("assistente de campanha — as mensagens da abordagem", () => {
  it("abre com TRÊS caixas: a primeira obrigatória e duas variações", () => {
    abrir();
    irAteAsMensagens();

    expect(screen.getByRole("textbox", { name: /Mensagem 1 \(sai primeiro\)/i })).toBeTruthy();
    expect(screen.getByPlaceholderText(PLACEHOLDER_1)).toBeTruthy();
    // As duas opcionais aparecem com o placeholder da variação.
    expect(screen.getAllByPlaceholderText(PLACEHOLDER_N)).toHaveLength(2);
  });

  it("'+ Variação' acrescenta até o teto de 5 e para", () => {
    abrir();
    irAteAsMensagens();

    const adicionar = screen.getByRole("button", { name: "+ Variação" });
    fireEvent.click(adicionar);
    fireEvent.click(adicionar);
    expect(screen.getAllByPlaceholderText(PLACEHOLDER_N)).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "+ Variação" })).toBeNull();
  });

  it("o que foi digitado nas três caixas vai no POST da campanha", async () => {
    abrir();
    irAteAsMensagens();

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER_1), {
      target: { value: "Oi, tudo bem? Falo da Bill Higiene." },
    });
    const opcionais = screen.getAllByPlaceholderText(PLACEHOLDER_N);
    fireEvent.change(opcionais[0]!, { target: { value: "Passando para apresentar a loja." } });
    fireEvent.change(opcionais[1]!, { target: { value: "Temos preço especial para oficinas." } });

    fireEvent.click(screen.getByRole("button", { name: "Continuar" })); // aprovação
    fireEvent.click(screen.getByLabelText(/Aprovo a execução desta campanha/));
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e executar" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [url, corpo] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe("/api/v1/prospecting/campaigns");
    expect(corpo.mensagens).toEqual([
      "Oi, tudo bem? Falo da Bill Higiene.",
      "Passando para apresentar a loja.",
      "Temos preço especial para oficinas.",
    ]);
  });

  it("caixa vazia não vira variação: só o que tem texto viaja", async () => {
    abrir();
    irAteAsMensagens();

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER_1), {
      target: { value: "Só esta mensagem." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByLabelText(/Aprovo a execução desta campanha/));
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e executar" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [, corpo] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(corpo.mensagens).toEqual(["Só esta mensagem."]);
  });
});
