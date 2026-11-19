/**
 * LISTA VAZIA DE NOTAS DE ENTRADA OFERECE O PRÓXIMO PASSO.
 *
 * O vazio dizia "use Sincronizar na Visão Geral" — e não levava a lugar nenhum.
 * Quem abre a aba de entradas sem nenhuma nota ficava com uma instrução e
 * nenhum controle: o caminho era adivinhar onde fica a Visão Geral.
 *
 * A ação é um LINK (navegação), não um botão que dispara POST: a tela de
 * entradas não sincroniza por conta própria — quem sincroniza é a Visão Geral,
 * e a ficha 5.8 registra isso como regra observada, não como convite a mudar.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));

import { TabelaDeEntradas } from "@/app/app/fiscal/_components/TabelaDeEntradas";

afterEach(cleanup);

describe("notas de entrada — estado vazio", () => {
  it("sem nenhuma nota, oferece a Visão Geral como saída", () => {
    render(<TabelaDeEntradas inicial={[]} />);

    expect(screen.getByText("Nenhuma nota de entrada ainda.")).toBeInTheDocument();
    const acao = screen.getByRole("link", { name: "Abrir a Visão Geral" });
    expect(acao).toHaveAttribute("href", "/app/fiscal");
  });

  it("com filtro sem resultado, o texto é o do filtro (não o de 'nada ainda')", () => {
    render(<TabelaDeEntradas inicial={[]} modo="todas" />);
    // Sem linhas e sem filtro aplicado, não é "filtro sem resultado".
    expect(screen.queryByText("Nenhuma nota com esse filtro.")).not.toBeInTheDocument();
  });
});
