/**
 * O POST DA AVULSA LEVA O PAYLOAD INTEIRO — E PASSA PELO /validar.
 *
 * Antes, `emitirAvulsa` mandava só `{extras:{avulsa}}`: complementares, fisco,
 * cobrança, transporte, destinatário e entrega digitados eram descartados sem
 * aviso, e a pré-validação que existe para pedido não rodava para balcão.
 * Aqui o operador escolhe um contato com CPF só no metadado, digita um texto e
 * emite: o que chega ao `/validar` e ao POST é o mesmo payload cheio.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ID = "11111111-1111-4111-8111-111111111111";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
const { get, post, push, refresh } = mocks;

vi.mock("@/lib/api/client", () => ({ apiClient: { get: mocks.get, post: mocks.post } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/components/nexus-ui/forms/ConfirmacaoProvider", () => ({
  useConfirmar: () => async () => true,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("@/app/app/pedidos/novo/_cliente", () => ({
  CustomerSelector: ({ aoEscolher }: { aoEscolher: (id: string, nome: string) => void }) => (
    <button onClick={() => aoEscolher(ID, "Maria da Silva")}>escolher</button>
  ),
}));
vi.mock("@/app/app/pedidos/novo/_produtos", () => ({
  ProductSearch: ({ aoAdicionar }: { aoAdicionar: (p: unknown, q: number) => void }) => (
    <button
      type="button"
      onClick={() =>
        aoAdicionar(
          {
            id: "22222222-2222-4222-8222-222222222222",
            nome: "Pão",
            codigo: "PAO-1",
            unidade: "UN",
            ncm: "19059090",
            preco_cents: 1000,
          },
          1,
        )
      }
    >
      adicionar produto
    </button>
  ),
}));

import { EmitirNota } from "@/app/app/notas/_components/EmitirNota";
import type { ConfigFiscalSalva } from "@/lib/schemas/fiscal";

const CONFIG: ConfigFiscalSalva = {
  serie: "1",
  natureza_operacao: "Venda",
  cfop_padrao: "5102",
  emitente_documento: "27493187000169",
  ie: "123456",
  crt: "1",
  logradouro: "Rua da Empresa",
  numero_end: "9",
  bairro: "Centro",
  municipio: "Mafra",
  codigo_municipio: "4209102",
  uf: "SC",
  cep: "89300000",
  ambiente: "homologacao",
  provedor: "fake",
  certificado_path: "/tmp/fake.pfx",
};

const TEXTOS = new Proxy({} as ComponentProps<typeof EmitirNota>["textos"], {
  get: (_alvo, prop) => String(prop),
});

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  push.mockReset();
  refresh.mockReset();
  get.mockResolvedValue({
    data: {
      id: ID,
      display_name: "Maria da Silva",
      cnpj: null,
      tipo_pessoa: "FISICA",
      source_metadata: { mercos: { documento: "420.409.069-91" } },
      logradouro: "Rua das Flores",
      numero_end: "123",
      bairro: "Centro",
      cidade: "Mafra",
      uf: "SC",
      cep: "89300-000",
    },
  });
  post.mockResolvedValue({ data: { ok: true, pendencias: [] } });
});

afterEach(() => cleanup());

describe("emissão da NF-e avulsa", () => {
  it("preenche o CPF do cadastro e envia destinatário/entrega/digitados no mesmo payload do /validar", async () => {
    render(<EmitirNota faturados={[]} configInicial={CONFIG} textos={TEXTOS} />);

    fireEvent.click(screen.getByText("NF-e de venda avulsa"));
    fireEvent.click(screen.getByText("escolher"));
    await waitFor(() => expect((screen.getByLabelText("CPF ou CNPJ") as HTMLInputElement).value).toBe("42040906991"));

    fireEvent.click(screen.getByText("adicionar produto"));
    await screen.findByTestId("nfe-item");
    // Catálogo NÃO preenche preço: a linha avisa e a emissão fica bloqueada.
    expect(screen.getByTestId("nfe-item-sem-preco")).toBeVisible();
    expect(screen.getByTestId("nfe-emitir")).toBeDisabled();
    expect(screen.queryByTestId("nfe-formulario-pronto")).toBeNull();
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Preço (centavos)"), { target: { value: "10" } });
    expect(screen.queryByTestId("nfe-item-sem-preco")).toBeNull();
    expect(screen.getByTestId("nfe-formulario-pronto")).toBeVisible();
    // O que o operador digita no campo visível vence o que veio do cadastro.
    fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), {
      target: { value: "11111111111" },
    });

    expect(screen.getByTestId("nfe-emitir")).toBeEnabled();
    fireEvent.click(screen.getByTestId("nfe-emitir"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));

    const [rotaValidar, corpoValidar] = post.mock.calls[0] as [string, { extras: Record<string, unknown> }];
    const [rotaEmissao, corpoEmissao] = post.mock.calls[1] as [string, { extras: Record<string, unknown> }];
    expect(rotaValidar).toBe("/api/v1/invoices/validar");
    expect(rotaEmissao).toBe("/api/v1/invoices");
    expect(corpoValidar.extras).toEqual(corpoEmissao.extras);

    const extras = corpoEmissao.extras;
    expect(extras.avulsa).toMatchObject({ cliente_documento: "11111111111" });
    expect(extras.destinatario).toMatchObject({ documento: "11111111111" });
    expect(extras.entrega).toMatchObject({ logradouro: "Rua das Flores", uf: "SC" });
  });

  it("mostra as pendências devolvidas pelo /validar e não enfileira a nota", async () => {
    post.mockResolvedValueOnce({
      data: {
        ok: false,
        pendencias: [{ campo: "cliente", mensagem: "Cliente: ajuste logradouro", onde: "/app/contacts/x" }],
      },
    });
    render(<EmitirNota faturados={[]} configInicial={CONFIG} textos={TEXTOS} />);
    fireEvent.click(screen.getByText("NF-e de venda avulsa"));
    fireEvent.click(screen.getByText("escolher"));
    await waitFor(() =>
      expect((screen.getByLabelText("CPF ou CNPJ") as HTMLInputElement).value).toBe("42040906991"),
    );
    fireEvent.click(screen.getByText("adicionar produto"));
    await screen.findByTestId("nfe-item");
    // Catálogo NÃO preenche preço: a linha avisa e a emissão fica bloqueada.
    expect(screen.getByTestId("nfe-item-sem-preco")).toBeVisible();
    expect(screen.getByTestId("nfe-emitir")).toBeDisabled();
    expect(screen.queryByTestId("nfe-formulario-pronto")).toBeNull();
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Preço (centavos)"), { target: { value: "10" } });
    expect(screen.queryByTestId("nfe-item-sem-preco")).toBeNull();
    expect(screen.getByTestId("nfe-formulario-pronto")).toBeVisible();

    expect(screen.getByTestId("nfe-emitir")).toBeEnabled();
    fireEvent.click(screen.getByTestId("nfe-emitir"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[0]).toBe("/api/v1/invoices/validar");
    expect(await screen.findByText(/Cliente: ajuste logradouro/)).toBeTruthy();
  });
});
