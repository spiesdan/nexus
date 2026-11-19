/**
 * O FILTRO DE CIDADE NA TELA DE CLIENTES — posição, consulta e remoção.
 *
 * O servidor tem teste próprio (handler: `ilike` + organização; rota de
 * cidades). Este mede a LIGAÇÃO, que é onde o defeito costuma morar:
 *
 *  1. o seletor existe com `id="filtro-cidade"` e fica IMEDIATAMENTE depois do
 *     Tag (a ordem foi pedida; um seletor no fim da barra é outra tela);
 *  2. escolher a cidade entra na consulta como `cidade` (não como `search`);
 *  3. o chip aparece com o nome e removê-lo volta a lista sem cidade;
 *  4. "Limpar filtros" também limpa a cidade (era o esquecimento clássico:
 *     limpar tudo menos o filtro novo).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const useContactList = vi.fn();

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/hooks/contacts/useContactList", () => ({ useContactList: (...a: unknown[]) => useContactList(...a) }));
vi.mock("@/hooks/contacts/useContactCities", () => ({
  useContactCities: () => ({
    data: [
      {
        nome: "Ribeirão Preto",
        uf: "SP",
        rotulo: "Ribeirão Preto/SP",
        variantes: ["Ribeirão Preto", "RIBEIRAO PRETO"],
      },
      {
        nome: "São Paulo",
        uf: "SP",
        rotulo: "São Paulo/SP",
        variantes: ["São Paulo", "SAO PAULO", "sao paulo"],
      },
    ],
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ContactsListClient } from "@/app/app/contacts/_client";

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContactsListClient />
    </QueryClientProvider>,
  );
}

function paginacaoVazia() {
  return {
    data: { pages: [{ data: [] }] },
    isLoading: false,
    isError: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  };
}

afterEach(() => {
  cleanup();
  useContactList.mockReset();
});

describe("Clientes — filtro por cidade", () => {
  it("renderiza o seletor imediatamente depois do Tag", () => {
    useContactList.mockReturnValue(paginacaoVazia());
    renderizar();

    const tag = document.getElementById("filtro-tag");
    const cidade = document.getElementById("filtro-cidade");
    expect(tag).not.toBeNull();
    expect(cidade).not.toBeNull();
    // O próximo controle da barra depois do Tag é o Cidade.
    const depoisDoTag = tag!.compareDocumentPosition(cidade!);
    // compareDocumentPosition: DOCUMENT_POSITION_FOLLOWING = 4.
    expect(depoisDoTag & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const selects = Array.from(document.querySelectorAll("select"));
    expect(selects.indexOf(tag as HTMLSelectElement)).toBe(
      selects.indexOf(cidade as HTMLSelectElement) - 1,
    );
    expect((cidade as HTMLSelectElement).options[0]?.text).toBe("Todas as cidades");
  });

  it("escolher cidade entra na consulta; o chip remove e 'Limpar filtros' limpa", () => {
    useContactList.mockReturnValue(paginacaoVazia());
    renderizar();

    const cidade = document.getElementById("filtro-cidade") as HTMLSelectElement;
    fireEvent.change(cidade, { target: { value: "São Paulo/SP" } });

    const ultimo = useContactList.mock.calls.at(-1)?.[0] as { cidade?: string[] };
    // O filtro recebe TODAS as variantes canônicas — é o `IN` que casa acento
    // e caixa sem migration.
    expect(ultimo.cidade).toEqual(["São Paulo", "SAO PAULO", "sao paulo"]);

    // Chip com o rótulo canônico e botão de remover.
    const chip = screen.getByText("Cidade: São Paulo/SP");
    expect(chip).toBeTruthy();
    const remover = chip.closest("button") ?? chip.parentElement?.querySelector("button");
    if (remover) fireEvent.click(remover);
    expect(
      (useContactList.mock.calls.at(-1)?.[0] as { cidade?: string[] }).cidade,
    ).toBeUndefined();

    // Escolhe de novo e usa "Limpar filtros".
    fireEvent.change(cidade, { target: { value: "Ribeirão Preto/SP" } });
    fireEvent.click(screen.getByRole("button", { name: /Limpar filtros/ }));
    expect(
      (useContactList.mock.calls.at(-1)?.[0] as { cidade?: string[] }).cidade,
    ).toBeUndefined();
  });
});
