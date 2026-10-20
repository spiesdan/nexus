/**
 * O PAINEL DISPARO NASCE COM AS MENSAGENS DA CAMPANHA.
 *
 * Fechar o laço importa: o assistente "Encontrar empresas" grava 1..5
 * variações na campanha (0273), e o disparo é quem realmente envia. Antes,
 * abrir o Disparo pela aba Campanhas mostrava três caixas vazias — o texto
 * que o operador escreveu ficava para trás, e o envio saía com o que ele
 * digitasse de novo (ou não saía, por falta de mensagem).
 *
 * Aqui o contrato é o da TELA: veio 1..5 da campanha, a caixa aparece com o
 * texto e a contagem de variações acompanha.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DialogoDisparo } from "@/app/app/prospeccao/_disparo";

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

afterEach(cleanup);

function abrir(mensagensIniciais: string[]): void {
  render(
    <DialogoDisparo
      ids={["prospect-1"]}
      aberto
      onFechar={() => {}}
      onConcluido={() => {}}
      mensagensIniciais={mensagensIniciais}
    />,
  );
}

const OPCIONAL = "Outra forma de dizer a mesma coisa";

describe("Disparo — mensagens que vieram da campanha", () => {
  it("as três variações da campanha aparecem preenchidas", () => {
    abrir(["Primeira", "Segunda", "Terceira"]);

    expect((screen.getByDisplayValue("Primeira") as HTMLTextAreaElement).value).toBe("Primeira");
    expect((screen.getByDisplayValue("Segunda") as HTMLTextAreaElement).value).toBe("Segunda");
    expect((screen.getByDisplayValue("Terceira") as HTMLTextAreaElement).value).toBe("Terceira");
    expect(screen.getByText(/As 3 mensagens se alternam/)).toBeTruthy();
  });

  it("campanha com cinco variações abre as cinco caixas", () => {
    abrir(["A", "B", "C", "D", "E"]);

    for (const texto of ["A", "B", "C", "D", "E"]) {
      expect(screen.getByDisplayValue(texto)).toBeTruthy();
    }
    expect(screen.getByText(/As 5 mensagens se alternam/)).toBeTruthy();
  });

  it("campanha sem mensagem abre as três caixas vazias de sempre", () => {
    abrir([]);

    expect(screen.getAllByPlaceholderText(OPCIONAL)).toHaveLength(2);
    expect(screen.getByText(/A mesma mensagem para todas/)).toBeTruthy();
  });
});
