/**
 * A BUSCA DE CLIENTE DO PEDIDO MOSTRA A FANTASIA PRIMEIRO.
 *
 * Regra do dono (18/11/2026): na busca de cliente e no cadastro feito na hora
 * de criar o pedido, o nome que aparece primeiro é o **nome fantasia**; sem
 * fantasia, razão social/nome. O campo `contacts.fantasia` já existia — o que
 * faltava era a precedência aplicada.
 *
 * Este arquivo prova o TEXTO que a lista de opções imprime (e o `aria-label`,
 * que é o que o leitor de tela anuncia), com fantasia diferente da razão social.
 * A regra pura está em `tests/unit/nome-de-exibicao.test.ts`.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomerSelector, type ContatoOpcao } from "@/app/app/pedidos/novo/_cliente";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn().mockResolvedValue({ data: [] }) },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

afterEach(() => cleanup());

const TEXTO = { cliente: "Cliente", buscarCliente: "Buscar cliente", clienteAvulso: "Avulso" };

const COM_FANTASIA: ContatoOpcao = {
  id: "c1",
  fantasia: "Bill Higiene",
  display_name: "BILL COMERCIO DE ESTOPAS LTDA",
  name: "BILL COMERCIO DE ESTOPAS LTDA",
  phone_number: "+5531999990000",
  email: "contato@bill.test",
};

const SEM_FANTASIA: ContatoOpcao = {
  id: "c2",
  fantasia: "   ",
  display_name: "RAZAO SOCIAL LTDA",
  name: "RAZAO",
  phone_number: null,
  email: null,
};

describe("CustomerSelector — nome fantasia primeiro", () => {
  it("a opção mostra a fantasia, não a razão social", () => {
    render(
      <CustomerSelector
        contatos={[COM_FANTASIA]}
        contatoId={null}
        clienteNome=""
        aoEscolher={vi.fn()}
        textos={TEXTO}
      />,
    );

    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "bill" } });

    const opcao = screen.getByRole("button", { name: /Bill Higiene/ });
    expect(opcao.textContent).toContain("Bill Higiene");
    expect(opcao.getAttribute("aria-label")).toContain("Bill Higiene");
    expect(opcao.textContent).not.toContain("BILL COMERCIO DE ESTOPAS LTDA");
  });

  it("fantasia só de espaços cai para a razão social", () => {
    render(
      <CustomerSelector
        contatos={[SEM_FANTASIA]}
        contatoId={null}
        clienteNome=""
        aoEscolher={vi.fn()}
        textos={TEXTO}
      />,
    );

    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "razao" } });

    expect(screen.getByRole("button", { name: /RAZAO SOCIAL LTDA/ }).textContent).toContain(
      "RAZAO SOCIAL LTDA",
    );
  });

  it("buscar pela fantasia encontra o contato", () => {
    render(
      <CustomerSelector
        contatos={[COM_FANTASIA]}
        contatoId={null}
        clienteNome=""
        aoEscolher={vi.fn()}
        textos={TEXTO}
      />,
    );

    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "higiene" } });
    expect(screen.getByRole("button", { name: /Bill Higiene/ })).toBeTruthy();
  });

  it("escolher a opção devolve a fantasia como nome do pedido", () => {
    const aoEscolher = vi.fn();
    render(
      <CustomerSelector
        contatos={[COM_FANTASIA]}
        contatoId={null}
        clienteNome=""
        aoEscolher={aoEscolher}
        textos={TEXTO}
      />,
    );

    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "bill" } });
    fireEvent.click(screen.getByRole("button", { name: /Bill Higiene/ }));
    expect(aoEscolher).toHaveBeenCalledWith("c1", "Bill Higiene");
  });
});
