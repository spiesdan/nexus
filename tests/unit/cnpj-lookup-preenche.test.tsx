import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: (...args: unknown[]) => getMock(...args) },
}));

const sucesso = vi.fn();
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: (...args: unknown[]) => sucesso(...args), error: vi.fn() },
}));

import { CnpjLookup } from "@/components/contacts/CnpjLookup";

const DADOS = {
  cnpj: "11222333000181",
  name: "EMPRESA X LTDA",
  display_name: "EMPRESA X",
  email: "contato@empresax.com.br",
  phone_number: "47999999999",
  fantasia: "EMPRESA X",
  logradouro: "RUA A",
  numero_end: "100",
  bairro: "CENTRO",
  cidade: "VIDEIRA",
  uf: "SC",
  cep: "89560000",
};

beforeEach(() => {
  getMock.mockReset();
  sucesso.mockReset();
});

/**
 * O "Buscar dados" lia o corpo CRU da API e o `ok()` embrulha tudo em `{ data }`
 * (`lib/api/wrappers.ts`). Resultado: `aoPreencher` recebia o envelope, os
 * diálogos copiavam `undefined` por cima dos campos e o formulário era LIMPO em
 * vez de preenchido — com um toast de sucesso. Nenhum teste pegava isso porque
 * a rota estava certa: o defeito era a leitura no cliente.
 */
describe("CnpjLookup", () => {
  it("desembrulha o { data } e entrega os campos preenchidos", async () => {
    getMock.mockResolvedValue({ data: { ja_cadastrado: false, ...DADOS } });
    const aoPreencher = vi.fn();

    render(
      <CnpjLookup
        id="cnpj"
        valor="11.222.333/0001-81"
        aoMudar={() => {}}
        aoPreencher={aoPreencher}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /buscar dados/i }));

    await waitFor(() => expect(aoPreencher).toHaveBeenCalledTimes(1));
    const recebido = aoPreencher.mock.calls[0]?.[0] as Record<string, unknown>;
    // O que o diálogo copia: se vier `undefined`, ele apaga o que a pessoa digitou.
    expect(recebido.name).toBe(DADOS.name);
    expect(recebido.cnpj).toBe(DADOS.cnpj);
    expect(recebido.cidade).toBe(DADOS.cidade);
    expect(recebido).not.toHaveProperty("data");
    expect(sucesso).toHaveBeenCalled();
  });

  it("CNPJ já cadastrado: avisa e não preenche nada", async () => {
    getMock.mockResolvedValue({
      data: { ja_cadastrado: true, contact_id: "c1", nome: "EMPRESA X LTDA" },
    });
    const aoPreencher = vi.fn();

    render(
      <CnpjLookup id="cnpj" valor="11222333000181" aoMudar={() => {}} aoPreencher={aoPreencher} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /buscar dados/i }));

    expect(await screen.findByText(/Já cadastrado/)).toBeInTheDocument();
    expect(aoPreencher).not.toHaveBeenCalled();
  });

  it("CNPJ com menos de 14 dígitos não chama a API", () => {
    render(<CnpjLookup id="cnpj" valor="123" aoMudar={() => {}} aoPreencher={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /buscar dados/i }));
    expect(getMock).not.toHaveBeenCalled();
  });
});
