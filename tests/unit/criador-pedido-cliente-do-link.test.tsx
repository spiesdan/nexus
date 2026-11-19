/**
 * "GERAR PEDIDO" NO PERFIL DO CLIENTE ABRE O EDITOR COM ELE ESCOLHIDO.
 *
 * O defeito relatado pelo dono: entrar em Clientes, clicar em "Gerar pedido" e
 * cair em `/app/pedidos/novo` **sem** o cliente. O link não levava o id, a
 * página não lia `searchParams` e o editor nascia com `contatoId = null`.
 *
 * Aqui se prova o contrato do editor:
 *  1. com `contatoInicial`, abre com o cliente e o nome preenchidos;
 *  2. sem ele, o comportamento de sempre (rascunho restaura sozinho);
 *  3. rascunho de OUTRO cliente não é aplicado em silêncio: a tela pede a
 *     decisão (usar o cliente do link × continuar o rascunho);
 *  4. rascunho do MESMO cliente restaura sem perguntar.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProximasAcoes } from "@/app/app/contacts/[id]/_acoes";
import { OrderEditor } from "@/app/app/pedidos/novo/_editor";
import { custoSomenteParaQuemVeMargem } from "@/lib/pedidos/custo-so-para-quem-ve-margem";
import { linkDoNovoPedido } from "@/lib/pedidos/link-do-novo-pedido";
import { apiClient } from "@/lib/api/client";
import { chaveDoRascunho, rascunhoDeOutroCliente } from "@/app/app/pedidos/novo/_autosave";
import type { ContatoOpcao } from "@/app/app/pedidos/novo/_cliente";
import type { Produto } from "@/lib/schemas/produtos";

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

beforeEach(() => {
  window.localStorage.clear();
});

const ORG = "org-teste";
const USUARIO = "user-teste";
const CHAVE_DO_RASCUNHO = chaveDoRascunho(ORG, USUARIO);

const BILL: ContatoOpcao = {
  id: "c-bill",
  fantasia: "Bill Higiene",
  display_name: "BILL COMERCIO DE ESTOPAS LTDA",
  name: "BILL COMERCIO DE ESTOPAS LTDA",
  phone_number: "+5531999990000",
  email: "bill@teste.local",
};

const OUTRO: ContatoOpcao = {
  id: "c-outro",
  fantasia: null,
  display_name: "Cliente Antigo",
  name: "Cliente Antigo",
  phone_number: null,
  email: null,
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

const LINHA = {
  key: "linha-1",
  product_id: "produto-1",
  codigo: "P1",
  nome: "Produto um",
  quantidade: 1,
  permite_fracao: false,
  precoTexto: "10,00",
  descontoPct: 0,
  estoque: null,
};

function rascunho(dados: { contatoId: string | null; clienteNome: string; chavePedido?: string }) {
  window.localStorage.setItem(
    CHAVE_DO_RASCUNHO,
    JSON.stringify({
      salvoEm: Date.now(),
      dados: {
        chavePedido: "chave-fixa",
        ...dados,
        linhas: [LINHA],
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
      },
    }),
  );
}

function montar(contatoInicial?: string | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OrderEditor
        produtos={[] as Produto[]}
        contatos={[BILL, OUTRO]}
        contatoInicial={contatoInicial}
        tabelas={[]}
        verMargem={false}
        comissaoPct={null}
        descontoMaxVendedorPct={5}
        nomeOrganizacao="Org de teste"
        nomeVendedor="Vendedor"
        donoDoRascunho={{ orgId: ORG, userId: USUARIO }}
        textos={TEXTO}
      />
    </QueryClientProvider>,
  );
}

const campoCliente = () => document.getElementById("busca-cliente") as HTMLInputElement;

describe("criador de pedidos — cliente vindo do link", () => {
  it("abre com o cliente do link selecionado e o nome preenchido", () => {
    montar(BILL.id);

    expect(campoCliente().value).toBe("Bill Higiene");
    expect(screen.queryByTestId("conflito-rascunho")).toBeNull();
  });

  it("sem o link, o comportamento atual continua: rascunho restaura sozinho", () => {
    rascunho({ contatoId: OUTRO.id, clienteNome: "Cliente Antigo" });

    montar(null);

    expect(campoCliente().value).toBe("Cliente Antigo");
    expect(screen.queryByTestId("conflito-rascunho")).toBeNull();
  });

  it("rascunho do MESMO cliente restaura sem perguntar", () => {
    rascunho({ contatoId: BILL.id, clienteNome: "Bill Higiene" });

    montar(BILL.id);

    expect(campoCliente().value).toBe("Bill Higiene");
    expect(screen.queryByTestId("conflito-rascunho")).toBeNull();
  });

  it("rascunho de outro cliente pede decisão e 'continuar' restaura a venda", () => {
    rascunho({ contatoId: OUTRO.id, clienteNome: "Cliente Antigo" });

    montar(BILL.id);

    expect(screen.getByTestId("conflito-rascunho")).toBeTruthy();
    // A tela abre com o cliente do link; o rascunho só entra se a pessoa mandar.
    expect(campoCliente().value).toBe("Bill Higiene");

    fireEvent.click(screen.getByRole("button", { name: "Continuar o rascunho" }));

    expect(screen.queryByTestId("conflito-rascunho")).toBeNull();
    expect(campoCliente().value).toBe("Cliente Antigo");
  });

  it("'usar o cliente do link' descarta o rascunho e mantém o cliente do link", () => {
    rascunho({ contatoId: OUTRO.id, clienteNome: "Cliente Antigo" });

    montar(BILL.id);
    fireEvent.click(screen.getByRole("button", { name: "Usar o cliente do link" }));

    expect(screen.queryByTestId("conflito-rascunho")).toBeNull();
    expect(campoCliente().value).toBe("Bill Higiene");
    expect(window.localStorage.getItem(CHAVE_DO_RASCUNHO)).toBeNull();
  });
});

describe("o botão da ficha leva o cliente na URL", () => {
  it("monta /app/pedidos/novo?contato=<id>", () => {
    expect(linkDoNovoPedido("c-bill")).toBe("/app/pedidos/novo?contato=c-bill");
    expect(linkDoNovoPedido(null)).toBe("/app/pedidos/novo");
    expect(linkDoNovoPedido(undefined)).toBe("/app/pedidos/novo");
  });

  it("o link 'Criar pedido' das Próximas ações carrega o id", () => {
    render(<ProximasAcoes contactId="c-bill" nome="Bill" conversaId={null} anonimo={false} />);

    expect(screen.getByRole("link", { name: "Criar pedido" }).getAttribute("href")).toBe(
      "/app/pedidos/novo?contato=c-bill",
    );
  });
});

describe("autosave restaura TODOS os campos editáveis", () => {
  it("desconto (% e R$), frete, tabela, detalhes e observações voltam iguais", async () => {
    const get = vi.mocked(apiClient.get);
    get.mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/price-tables/")) {
        return Promise.resolve({ itens: [] }) as never;
      }
      return Promise.resolve({ data: [] }) as never;
    });
    window.localStorage.setItem(
      CHAVE_DO_RASCUNHO,
      JSON.stringify({
        salvoEm: Date.now(),
        dados: {
          chavePedido: "chave-fixa",
          contatoId: BILL.id,
          clienteNome: "Bill Higiene",
          linhas: [LINHA],
          condicao: "30 dias",
          formaPagamento: "agendado_30",
          exigeNf: true,
          observacoes: "Obs do cliente",
          obsInterna: "Só equipe",
          endereco: "Rua A, 10",
          transportadora: "Transportes X",
          rastreamento: "BR123",
          contatoNoCliente: "João",
          tabelaId: "tab-1",
          descontoTexto: "15,00",
          descontoPctTexto: "3,5",
          freteTexto: "25,00",
        },
      }),
    );

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <OrderEditor
          produtos={[] as Produto[]}
          contatos={[BILL, OUTRO]}
          contatoInicial={null}
          tabelas={[{ id: "tab-1", nome: "Tabela Ouro", desconto_pct: 0 }]}
          verMargem={false}
          comissaoPct={null}
          descontoMaxVendedorPct={5}
          nomeOrganizacao="Org de teste"
          nomeVendedor="Vendedor"
          donoDoRascunho={{ orgId: ORG, userId: USUARIO }}
          textos={TEXTO}
        />
      </QueryClientProvider>,
    );

    const valor = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    expect(valor("desconto")).toBe("15,00");
    // O input é `type=number`: vírgula no rascunho é normalizada para ponto.
    expect(valor("desconto-pct")).toBe("3.5");
    expect(valor("frete")).toBe("25,00");
    expect(valor("condicao")).toBe("30 dias");
    expect(valor("obs")).toBe("Obs do cliente");
    expect(valor("obs-interna")).toBe("Só equipe");
    expect(valor("endereco")).toBe("Rua A, 10");
    expect(valor("transportadora")).toBe("Transportes X");
    expect(valor("rastreamento")).toBe("BR123");
    expect(valor("contato-no-cliente")).toBe("João");
    expect((document.getElementById("forma-pagamento") as HTMLSelectElement).value).toBe(
      "agendado_30",
    );
    expect(screen.getByText("Tabela Ouro")).toBeTruthy();
    expect((document.getElementById("exige-nf") as HTMLInputElement).checked).toBe(true);
  });
});

describe("rascunho só com cliente e proteção de navegação", () => {
  function rascunhoSemItens(dados: { contatoId: string | null; clienteNome: string }) {
    window.localStorage.setItem(
      CHAVE_DO_RASCUNHO,
      JSON.stringify({
        salvoEm: Date.now(),
        dados: {
          ...dados,
          linhas: [],
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
        },
      }),
    );
  }

  it("cliente escolhido sem itens também volta (quando não há link)", () => {
    rascunhoSemItens({ contatoId: OUTRO.id, clienteNome: "Cliente Antigo" });

    montar(null);

    expect(campoCliente().value).toBe("Cliente Antigo");
  });

  it("com link, rascunho só de cliente NÃO troca o cliente do link", () => {
    rascunhoSemItens({ contatoId: OUTRO.id, clienteNome: "Cliente Antigo" });

    montar(BILL.id);

    expect(campoCliente().value).toBe("Bill Higiene");
    expect(screen.queryByTestId("conflito-rascunho")).toBeNull();
  });

  it("fechar/recarregar com itens pede confirmação; sem itens, não", () => {
    rascunho({ contatoId: BILL.id, clienteNome: "Bill Higiene" });
    montar(null);
    expect(campoCliente().value).toBe("Bill Higiene");

    const comItens = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(comItens);
    expect(comItens.defaultPrevented).toBe(true);

    cleanup();
    window.localStorage.clear();
    montar(null);
    const vazio = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(vazio);
    expect(vazio.defaultPrevented).toBe(false);
  });
});

function produto(over: Partial<Produto>): Produto {
  return {
    id: "p1",
    codigo: "P1",
    nome: "Produto um",
    marca: null,
    preco_cents: 5000,
    custo_cents: 3000,
    controla_estoque: false,
    quantidade: 0,
    ativo: true,
    unidade: "un",
    multiplo: 1,
    ...over,
  } as unknown as Produto;
}

describe("revisão antes de finalizar (B.7)", () => {
  it("a prévia mostra itens, unidade, descontos, frete, total, parcelas, endereço e observações", () => {
    window.localStorage.setItem(
      CHAVE_DO_RASCUNHO,
      JSON.stringify({
        salvoEm: Date.now(),
        dados: {
          chavePedido: "chave-fixa",
          contatoId: BILL.id,
          clienteNome: "Bill Higiene",
          linhas: [
            {
              ...LINHA,
              key: "linha-1",
              quantidade: 2,
              precoTexto: "50,00",
              descontoPct: 10,
              unidade: "kg",
              origemPreco: "tabela",
            },
          ],
          condicao: "30/60",
          formaPagamento: "agendado_30",
          exigeNf: true,
          observacoes: "Entregar à tarde",
          obsInterna: "Conferir",
          endereco: "Rua A, 10",
          transportadora: "",
          rastreamento: "",
          contatoNoCliente: "",
          tabelaId: "",
          descontoTexto: "10,00",
          descontoPctTexto: "5",
          freteTexto: "20,00",
        },
      }),
    );

    montar(null);
    fireEvent.click(screen.getByRole("button", { name: "Visualizar" }));

    // B.9: o resumo deixa explícito que R$ e % são cumulativos e qual é o teto.
    expect(screen.getByText(/R\$ e % somam/)).toBeTruthy();
    expect(screen.getByText(/Teto de desconto do vendedor: 5%/)).toBeTruthy();

    const previa = within(screen.getByRole("dialog"));
    expect(previa.getByText("Bill Higiene")).toBeTruthy();
    expect(previa.getByText("30/60")).toBeTruthy();
    expect(previa.getByText("Agendado — 30 dias")).toBeTruthy();
    expect(previa.getByText("Sim")).toBeTruthy();
    expect(previa.getByText("Rua A, 10")).toBeTruthy();
    expect(previa.getByText("Produto um")).toBeTruthy();
    expect(previa.getByText(/2 kg × R\$ 50,00/)).toBeTruthy();
    expect(previa.getByText(/desconto 10%/)).toBeTruthy();
    expect(previa.getByText(/preço da tabela/)).toBeTruthy();
    // Linha = 2 × 50 − 10% = 90,00; duas vezes (linha e subtotal).
    expect(previa.getAllByText(/R\$ 90,00/).length).toBeGreaterThanOrEqual(1);
    expect(previa.getByText(/R\$ 10,00/)).toBeTruthy();
    expect(previa.getByText(/R\$ 4,50/)).toBeTruthy();
    expect(previa.getByText(/R\$ 20,00/)).toBeTruthy();
    expect(previa.getByText(/R\$ 95,50/)).toBeTruthy();
    expect(previa.getByText(/1ª ·/)).toBeTruthy();
    expect(previa.getByText(/2ª ·/)).toBeTruthy();
    expect(previa.getByText("Entregar à tarde")).toBeTruthy();
    expect(previa.getByText("Conferir")).toBeTruthy();
    // 10% (item) > teto de 5%: a consequência aparece ANTES de gerar.
    expect(previa.getByText(/Aguardando aprovação/)).toBeTruthy();
  });
});

describe("margem só para quem pode (B.12)", () => {
  it("custo não atravessa a fronteira sem permissão", () => {
    expect(custoSomenteParaQuemVeMargem([{ custo_cents: 3000 }], false)[0]?.custo_cents).toBeNull();
    expect(custoSomenteParaQuemVeMargem([{ custo_cents: 3000 }], true)[0]?.custo_cents).toBe(3000);
  });

  it("a linha de margem não renderiza para quem não pode ver", () => {
    rascunho({ contatoId: BILL.id, clienteNome: "Bill Higiene" });
    const produtos = [produto({ id: "produto-1" })];

    const semPermissao = render(
      <QueryClientProvider client={new QueryClient()}>
        <OrderEditor
          produtos={produtos}
          contatos={[BILL, OUTRO]}
          tabelas={[]}
          verMargem={false}
          comissaoPct={null}
          descontoMaxVendedorPct={5}
          nomeOrganizacao="Org"
          nomeVendedor="V"
          donoDoRascunho={{ orgId: ORG, userId: USUARIO }}
          textos={TEXTO}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByText("Margem")).toBeNull();
    semPermissao.unmount();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <OrderEditor
          produtos={produtos}
          contatos={[BILL, OUTRO]}
          tabelas={[]}
          verMargem
          comissaoPct={null}
          descontoMaxVendedorPct={5}
          nomeOrganizacao="Org"
          nomeVendedor="V"
          donoDoRascunho={{ orgId: ORG, userId: USUARIO }}
          textos={TEXTO}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Margem")).toBeTruthy();
  });
});

describe("falha ao salvar o rascunho (B.15)", () => {
  it("avisa que o rascunho não foi salvo e deixa continuar", async () => {
    rascunho({ contatoId: BILL.id, clienteNome: "Bill Higiene" });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    montar(null);

    await waitFor(() => expect(screen.getByTestId("rascunho-nao-salvo")).toBeTruthy(), {
      timeout: 3000,
    });
    expect(screen.getByTestId("gerar-pedido").hasAttribute("disabled")).toBe(false);
  });
});

describe("clique duplo e retry não duplicam o pedido", () => {
  it("Cmd/Ctrl+Enter duas vezes no mesmo envio chama o POST uma vez", async () => {
    const post = vi.mocked(apiClient.post);
    post.mockReset();
    let resolver!: (valor: unknown) => void;
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }) as never,
    );
    rascunho({ contatoId: BILL.id, clienteNome: "Bill Higiene" });

    montar(null);
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[1]).toMatchObject({ chave_sincronizacao: "chave-fixa" });

    resolver({ data: { id: "pedido-1", numero: 1 } });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  });

  it("depois de um erro, o retry reusa a MESMA chave (o servidor deduplica)", async () => {
    const post = vi.mocked(apiClient.post);
    post.mockReset();
    post
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ data: { id: "pedido-1", numero: 1 } });
    rascunho({ contatoId: BILL.id, clienteNome: "Bill Higiene", chavePedido: "chave-fixa" });

    montar(null);
    fireEvent.click(screen.getByTestId("gerar-pedido"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("gerar-pedido"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));

    expect(post.mock.calls[0]?.[1]).toMatchObject({ chave_sincronizacao: "chave-fixa" });
    expect(post.mock.calls[1]?.[1]).toMatchObject({ chave_sincronizacao: "chave-fixa" });
  });
});

describe("rascunhoDeOutroCliente", () => {
  it("só conflita quando há link E o dono do rascunho é diferente", () => {
    expect(rascunhoDeOutroCliente({ contatoId: "a" }, "b")).toBe(true);
    expect(rascunhoDeOutroCliente({ contatoId: "a" }, "a")).toBe(false);
    expect(rascunhoDeOutroCliente({ contatoId: "a" }, null)).toBe(false);
    expect(rascunhoDeOutroCliente(null, "a")).toBe(false);
    // Sem cliente no rascunho (avulso/versão antiga) e link com cliente: conflito.
    expect(rascunhoDeOutroCliente({ contatoId: null }, "a")).toBe(true);
  });
});
