/**
 * A CAMPANHA DE RECUPERAÇÃO ABRE COM **TRÊS** CAIXAS DE MENSAGEM.
 *
 * O pedido do produto foi explícito: "3 mensagens, uma por minuto, girando".
 * O texto do rótulo até dizia "giram nesta ordem", mas nenhum teste contava as
 * caixas — trocar o `MENSAGENS_NA_TELA` para 1 (ou o `Array.from` por um vetor
 * fixo) passaria em tudo: a rota aceita 1..5, e a tela continuaria "funcionando"
 * com uma mensagem só, que é justamente o que o pedido queria evitar.
 *
 * O que este teste NÃO prova: que o motor rotaciona. Isso é
 * `lib/prospeccao/agendado.test.ts` — inclusive o `(d2)`, que fecha o ciclo
 * 1→2→3→1. Aqui o contrato é o da TELA: três campos, e o "+ Variação" indo até
 * o teto de 5.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CampanhaDeRecuperacao } from "@/app/app/radar/_components/CampanhaDeRecuperacao";
import type { ClienteInativo } from "@/lib/comercial/inatividade";

afterEach(cleanup);

const CLIENTE: ClienteInativo = {
  contact_id: "c-1",
  nome: "Mercado São Jorge",
  telefone: "+5547999990000",
  dias_sem_compra: 74,
  total_historico_cents: 125000,
  qtd_pedidos: 9,
  faixa: "morno",
  score: 80,
};

function abrir(): void {
  render(<CampanhaDeRecuperacao contatos={[CLIENTE]} />);
  fireEvent.click(screen.getByRole("button", { name: "Criar campanha de recuperação" }));
}

describe("campanha de recuperação — as três mensagens", () => {
  it("abre com três caixas (o pedido: 1ª, 2ª e 3ª variação)", () => {
    abrir();
    expect(screen.getAllByPlaceholderText("Escreva a mensagem")).toHaveLength(3);
  });

  it("'+ Variação' acrescenta até o teto de 5", () => {
    abrir();
    const adicionar = screen.getByRole("button", { name: "+ Variação" });
    fireEvent.click(adicionar);
    fireEvent.click(adicionar);
    expect(screen.getAllByPlaceholderText("Escreva a mensagem")).toHaveLength(5);
    // No teto o botão some: um sexto campo seria recusado pela rota (1..5) e a
    // tela estaria prometendo o que a API não aceita.
    expect(screen.queryByRole("button", { name: "+ Variação" })).toBeNull();
  });

  it("dá para remover, mas nunca abaixo de uma caixa", () => {
    abrir();
    fireEvent.click(screen.getAllByRole("button", { name: "Remover" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Remover" })[0]!);
    expect(screen.getAllByPlaceholderText("Escreva a mensagem")).toHaveLength(1);
    // Com uma só, o "Remover" DAQUELA LINHA desaparece: campanha sem mensagem
    // não tem o que mandar, e a rota devolve 422. A asserção é ancorada na
    // linha do textarea — o diálogo tem outros "Remover" (janelas), e um
    // `queryByRole` global mediria o botão errado.
    const linha = screen.getByPlaceholderText("Escreva a mensagem").parentElement!;
    expect(within(linha).queryByRole("button", { name: "Remover" })).toBeNull();
  });
});
