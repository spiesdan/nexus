/**
 * DECISÃO 3 (20/11/2026) — OVERRIDE DE LIMITE É ATO DE GERENTE, COM MOTIVO.
 *
 * `ignorar_estoque`/`ignorar_credito` existiam só na API: poder invisível. A
 * decisão é liberar para gerente **com aviso do que está sendo ignorado e
 * auditoria**. O que este arquivo prende, na tela:
 *
 *  1. gerente com crédito estourado VÊ o bloco de override;
 *  2. quem não vê margem (não-gerente) NÃO vê — o poder não aparece para quem
 *     não pode exercê-lo;
 *  3. marcar sem motivo não gera pedido (a tela cobra antes do POST);
 *  4. com motivo, o corpo leva `ignorar_credito` + `motivo_override`.
 *
 * O gate do servidor (papel + motivo + auditoria) tem prova própria em
 * `commercial-orders-credito-gate.test.ts`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderEditor } from "@/app/app/pedidos/novo/_editor";
import { type LinhaDoPedido } from "@/app/app/pedidos/novo/_itens";
import type { Produto } from "@/lib/schemas/produtos";
import { apiClient } from "@/lib/api/client";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const BILL = {
  id: "c-bill",
  fantasia: "Bill Higiene",
  display_name: "BILL COMERCIO DE ESTOPAS LTDA",
  name: "BILL COMERCIO DE ESTOPAS LTDA",
  phone_number: "+5531999990000",
  email: "bill@teste.local",
};

const TEXTO = {
  titulo: "Novo pedido",
  subtitulo: "Busque o cliente e finalize.",
  cliente: "Cliente",
  buscarCliente: "Buscar cliente",
  clienteAvulso: "Cliente avulso",
  condicao: "Condição",
  formaPagamento: "Forma de pagamento",
  prazoLivre: "Prazo livre",
  prazoPrecisaNf: "Prazo com NF",
  exigeNf: "Nota fiscal",
  exigeNfOpcao: "Com NF",
  observacoes: "Observações",
  informacoesFiscais: "Informações fiscais (NF-e)",
  informacoesFiscaisDica: "Vai no infCpl da nota.",
  obsInterna: "Observação interna",
  endereco: "Endereço",
  enderecoExemplo: "Rua, número",
  transportadora: "Transportadora",
  tabelaPreco: "Tabela",
  semTabela: "Preço base",
  relacionados: "Relacionados",
  adicionar: "Adicionar",
  historico: "Histórico",
  rascunhoRestaurado: "Rascunho anterior restaurado",
  rascunhoDeOutroCliente: "Há um rascunho de outro cliente",
  rascunhoDeOutroClienteDesc: "Escolha qual manter.",
  usarClienteDoLink: "Usar o cliente do link",
  continuarRascunho: "Continuar o rascunho",
  produtos: "Produtos",
  buscarProduto: "Buscar produto",
  subtotal: "Subtotal",
  desconto: "Desconto",
  frete: "Frete",
  total: "Total",
  margem: "Margem",
  comissao: "Comissão",
  aguardandoAprovacao: "Aguardando aprovação",
  salvarRascunho: "Salvar rascunho",
  finalizar: "Gerar pedido",
  revisar: "Revisar",
  pedidoCriado: "Pedido criado",
};

function produto(over: Partial<Produto>): Produto {
  return {
    id: "p1",
    codigo: "P1",
    nome: "Produto um",
    marca: null,
    categoria: null,
    preco_cents: 5000,
    moeda: "BRL",
    custo_cents: 3000,
    controla_estoque: true,
    quantidade: 10,
    ativo: true,
    unidade: "un",
    multiplo: 1,
    ...over,
  } as unknown as Produto;
}

function linha(over: Partial<LinhaDoPedido> = {}): LinhaDoPedido {
  return {
    key: "l1",
    product_id: "p1",
    codigo: "P1",
    nome: "Produto um",
    quantidade: 1,
    permite_fracao: false,
    precoTexto: "50,00",
    descontoPct: 0,
    estoque: 10,
    unidade: "un",
    multiplo: 1,
    origemPreco: "base",
    ...over,
  };
}

function rascunho(dados: Record<string, unknown>) {
  window.localStorage.setItem(
    "pedido-rascunho:org-teste:user-teste",
    JSON.stringify({
      salvoEm: Date.now(),
      dados: {
        chavePedido: "chave-fixa",
        contatoId: null,
        clienteNome: "Bill Higiene",
        linhas: [linha()],
        condicao: "",
        observacoes: "",
        obsInterna: "",
        endereco: "",
        transportadora: "",
        rastreamento: "",
        contatoNoCliente: "",
        tabelaId: "",
        descontoTexto: "",
        descontoPctTexto: "",
        freteTexto: "",
        ...dados,
      },
    }),
  );
}


function montar({ verMargem = false }: { verMargem?: boolean } = {}) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrderEditor
        produtos={[produto({ preco_cents: 50000, quantidade: 10 })]}
        contatos={[BILL]}
        contatoInicial={null}
        tabelas={[]}
        verMargem={verMargem}
        comissaoPct={null}
        descontoMaxVendedorPct={5}
        nomeOrganizacao="Org de teste"
        nomeVendedor="Vendedor"
        escopoDoRascunho="org-teste:user-teste"
        textos={TEXTO}
      />
    </QueryClientProvider>,
  );
}

/** Crédito do cliente: limite apertado, nada em aberto. */
function creditoComLimite(limiteCents: number) {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url.includes("/credito")) {
      return Promise.resolve({
        data: { tem_limite: true, limite_cents: limiteCents, em_aberto_cents: 0 },
      }) as never;
    }
    return Promise.resolve({ data: [] }) as never;
  });
}

/** Rascunho com 1 item de R$ 500,00 e cliente escolhido (o crédito precisa de contato). */
function vendaAcimaDoLimite() {
  rascunho({
    contatoId: BILL.id,
    linhas: [linha({ precoTexto: "500,00", quantidade: 1 })],
  });
}

const gerar = () => fireEvent.click(screen.getByTestId("gerar-pedido"));

describe("decisão 3 — override de crédito: gerente, motivo e auditoria", () => {
  it("gerente vê o bloco de override quando o crédito estoura", async () => {
    creditoComLimite(10_000); // R$ 100 de limite para um pedido de R$ 500
    vendaAcimaDoLimite();
    montar({ verMargem: true });

    await waitFor(() => expect(screen.getByTestId("override-de-limites")).toBeTruthy());
    expect(screen.getByText(/Ignorar o limite de crédito/)).toBeTruthy();
  });

  it("quem não vê margem (não-gerente) NÃO vê o bloco", async () => {
    creditoComLimite(10_000);
    vendaAcimaDoLimite();
    montar({ verMargem: false });

    await waitFor(() => expect(screen.getByText(/passa do limite de crédito/i)).toBeTruthy());
    expect(screen.queryByTestId("override-de-limites")).toBeNull();
  });

  it("marcar o override sem motivo NÃO gera pedido — a tela cobra antes do POST", async () => {
    creditoComLimite(10_000);
    vendaAcimaDoLimite();
    montar({ verMargem: true });
    await waitFor(() => expect(screen.getByTestId("override-de-limites")).toBeTruthy());

    fireEvent.click(screen.getByLabelText(/Ignorar o limite de crédito/));
    gerar();

    await waitFor(() =>
      expect(vi.mocked(nexusToast.error)).toHaveBeenCalledWith(
        expect.stringMatching(/motivo do override/i),
      ),
    );
    expect(vi.mocked(apiClient.post)).not.toHaveBeenCalled();
  });

  it("com motivo, envia ignorar_credito + motivo_override no corpo", async () => {
    creditoComLimite(10_000);
    vendaAcimaDoLimite();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: "pedido-1", numero: 1 } } as never);
    montar({ verMargem: true });
    await waitFor(() => expect(screen.getByTestId("override-de-limites")).toBeTruthy());

    fireEvent.click(screen.getByLabelText(/Ignorar o limite de crédito/));
    fireEvent.change(screen.getByTestId("motivo-override"), {
      target: { value: "Cliente antigo, liberado pelo dono nesta semana." },
    });
    gerar();

    await waitFor(() => expect(vi.mocked(apiClient.post)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiClient.post).mock.calls[0]?.[1]).toMatchObject({
      ignorar_credito: true,
      motivo_override: "Cliente antigo, liberado pelo dono nesta semana.",
    });
  });
});
