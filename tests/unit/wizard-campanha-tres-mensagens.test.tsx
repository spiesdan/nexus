/**
 * O ASSISTENTE DE CAMPANHA — três passos, cidades selecionadas e prévia real.
 *
 * O teste antigo cobrava o formulário de cinco passos com cidades digitadas
 * ("uma por linha, Cidade/UF") e uma aprovação final com checkbox. O fluxo
 * mudou de propósito: cidade agora é SELECIONADA da base, a prévia roda a
 * mesma função do disparo e criar não envia — o controle da campanha é que
 * agenda.
 *
 * O que este teste cobra:
 *   1. a fonte padrão é a base; não há preview para campanha só de busca;
 *   2. sem ver as empresas, o passo 1 não abre;
 *   3. três caixas de mensagem, "+ Variação" até 5;
 *   4. as mensagens preenchidas e o "quando" viajam no POST da campanha;
 *   5. criar termina com `aoConcluir(id)` — a tela navega para o controle.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CampanhaWizard } from "@/app/app/prospeccao/_campanha-wizard";
import type { MacroCategoria } from "@/lib/prospeccao/categorias";

const post = vi.fn();
const get = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    post: (...args: unknown[]) => post(...args),
    get,
    patch: vi.fn(),
  },
}));

vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({ data: [] }),
}));

const CATEGORIAS: MacroCategoria[] = [
  {
    macro: "Serviços",
    subcategorias: [
      { rotulo: "Oficina", busca: "oficina" },
      { rotulo: "Posto", busca: "posto" },
    ] as never,
  },
];

const PREVIA = {
  base: true,
  total: 2,
  linhas: [
    {
      id: "empresa-1",
      nome: "Oficina Silva",
      telefone: "5547999999999",
      cidade: "Canoinhas",
      categoria: "Oficina",
      categoria_original: "Oficina mecânica",
    },
    {
      id: "empresa-2",
      nome: "Auto Center Norte",
      telefone: "5547888888888",
      cidade: "Canoinhas",
      categoria: "Oficina",
      categoria_original: "Auto center",
    },
  ],
  resumo: "2 empresas prontas para o disparo.",
  limite: 500,
  ja_clientes: [],
  duplicadas: 0,
  para_revisar: [],
  em_campanha: 0,
  categoria_a_revisar: 0,
  varridas: 2,
  completa: true,
};

const PLACEHOLDER_1 = "Olá {{primeiro_nome}}! Aqui é da …";
const PLACEHOLDER_N = "Outra forma de dizer a mesma coisa";

/** O cenário padrão dos testes de texto: só há canal que aceita texto livre. */
const CANAIS_SO_TEXTO = {
  pode_texto: true,
  pode_template: false,
  oficial_conectado: false,
  templates: [],
};

const MODELO = {
  name: "boas_vindas",
  language: "pt_BR",
  status: "APPROVED",
  category: "MARKETING",
  rejectedReason: null,
  parameterFormat: "named",
  contractHash: "hash-1",
  syncedAt: "2026-10-25T00:00:00.000Z",
  slots: [],
  previews: [],
  components: [],
  aceito: true,
  motivo: null,
};

const CANAIS_SO_MODELO = {
  pode_texto: false,
  pode_template: true,
  oficial_conectado: true,
  templates: [MODELO],
};

const MODELO_POSTO = {
  ...MODELO,
  name: "posto_oferta",
  contractHash: "hash-2",
};

const CANAIS_MODELO_POR_CATEGORIA = {
  pode_texto: false,
  pode_template: true,
  oficial_conectado: true,
  templates: [MODELO, MODELO_POSTO],
};

const CANAIS_DOIS_MODOS = {
  pode_texto: true,
  pode_template: true,
  oficial_conectado: true,
  templates: [MODELO],
};

let canaisResposta: Record<string, unknown> = CANAIS_SO_TEXTO;
let canaisPendente = false;
let resolverCanais: ((valor: unknown) => void) | null = null;

afterEach(cleanup);

beforeEach(() => {
  post.mockReset();
  post.mockImplementation(async (url: string) => {
    if (url.endsWith("/preview")) return { data: PREVIA };
    if (url.endsWith("/executar")) return { data: { buscas: 1, sem_mapa: [] } };
    return { data: { id: "campanha-1" } };
  });

  canaisResposta = CANAIS_SO_TEXTO;
  canaisPendente = false;
  resolverCanais = null;
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === "/api/v1/prospecting/campaigns/canais") {
      if (canaisPendente) {
        return new Promise((resolve) => {
          resolverCanais = resolve;
        });
      }
      return { data: canaisResposta };
    }
    return {
      data: {
        cidades: [{ cidade: "Canoinhas", estado: "SC", total: 12 }],
      },
    };
  });
});

function abrir(aoConcluir = vi.fn()): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CampanhaWizard categorias={CATEGORIAS} aoConcluir={aoConcluir} />
    </QueryClientProvider>,
  );
}

/**
 * Passa do passo 0 para o 1 no fluxo da base: nome, cidade da lista,
 * categoria, prévia e Continuar.
 */
async function irAteAsMensagens(rotulos: string[] = ["Oficina"]): Promise<void> {
  fireEvent.change(screen.getByLabelText("Nome da campanha"), {
    target: { value: "Oficinas do Norte" },
  });
  fireEvent.click(await screen.findByRole("button", { name: /Canoinhas\/SC/ }));
  for (const rotulo of rotulos) {
    fireEvent.click(screen.getByRole("button", { name: rotulo }));
  }
  fireEvent.click(screen.getByRole("button", { name: "Ver empresas" }));
  await screen.findAllByText(/prontas para o disparo/i);
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

describe("assistente de campanha — público e mensagens", () => {
  it("não abre as mensagens antes de ver as empresas da base", async () => {
    abrir();
    fireEvent.change(screen.getByLabelText("Nome da campanha"), {
      target: { value: "Oficinas do Norte" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /Canoinhas\/SC/ }));
    fireEvent.click(screen.getByRole("button", { name: "Oficina" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.queryByText("Mensagens da campanha")).toBeNull();
    expect(screen.getByText("Empresas que vão receber")).toBeTruthy();
  });

  it("abre com TRÊS caixas: a primeira obrigatória e duas variações", async () => {
    abrir();
    await irAteAsMensagens();

    expect(screen.getByLabelText(/Mensagem 1/)).toBeTruthy();
    expect(screen.getByPlaceholderText(PLACEHOLDER_1)).toBeTruthy();
    expect(screen.getAllByPlaceholderText(PLACEHOLDER_N)).toHaveLength(2);
  });

  it("com só canal oficial, mostra o modelo no lugar das três caixas", async () => {
    canaisResposta = CANAIS_SO_MODELO;
    abrir();
    await irAteAsMensagens();

    expect(await screen.findByLabelText("Escolher modelo oficial")).toBeTruthy();
    expect(screen.getByText("Modelo aprovado")).toBeTruthy();
    expect(screen.queryByLabelText(/Mensagem 1/)).toBeNull();
    expect(screen.queryByPlaceholderText(PLACEHOLDER_1)).toBeNull();
    // Sem escolha possível, o seletor "texto ou modelo" não aparece.
    expect(screen.queryByRole("button", { name: /Texto livre/ })).toBeNull();
  });

  it("enquanto lê os canais, não pisca as caixas de texto", async () => {
    canaisPendente = true;
    abrir();
    await irAteAsMensagens();

    expect(screen.getByText("Lendo canais e modelos…")).toBeTruthy();
    expect(screen.queryByLabelText(/Mensagem 1/)).toBeNull();
    expect(screen.queryByPlaceholderText(PLACEHOLDER_1)).toBeNull();

    await act(async () => {
      resolverCanais?.({ data: CANAIS_SO_MODELO });
    });
    expect(await screen.findByLabelText("Escolher modelo oficial")).toBeTruthy();
    expect(screen.queryByLabelText(/Mensagem 1/)).toBeNull();
  });

  it("com os dois canais, nasce no modelo e deixa trocar para texto", async () => {
    canaisResposta = CANAIS_DOIS_MODOS;
    abrir();
    await irAteAsMensagens();

    expect(await screen.findByLabelText("Escolher modelo oficial")).toBeTruthy();
    expect(screen.queryByLabelText(/Mensagem 1/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Texto livre/ }));
    expect(screen.getByLabelText(/Mensagem 1/)).toBeTruthy();
    expect(screen.queryByLabelText("Escolher modelo oficial")).toBeNull();
  });

  it("'+ Variação' acrescenta até o teto de 5 e para", async () => {
    abrir();
    await irAteAsMensagens();

    const adicionar = screen.getByRole("button", { name: "+ Variação" });
    fireEvent.click(adicionar);
    fireEvent.click(adicionar);
    expect(screen.getAllByPlaceholderText(PLACEHOLDER_N)).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "+ Variação" })).toBeNull();
  });

  it("o que foi digitado nas três caixas vai no POST da campanha", async () => {
    const aoConcluir = vi.fn();
    abrir(aoConcluir);
    await irAteAsMensagens();

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER_1), {
      target: { value: "Oi, tudo bem? Falo da Bill Higiene." },
    });
    const opcionais = screen.getAllByPlaceholderText(PLACEHOLDER_N);
    fireEvent.change(opcionais[0]!, { target: { value: "Passando para apresentar a loja." } });
    fireEvent.change(opcionais[1]!, { target: { value: "Temos preço especial para oficinas." } });

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }));

    await waitFor(() => expect(aoConcluir).toHaveBeenCalledWith("campanha-1"));
    const chamada = post.mock.calls.find(
      ([url]) => url === "/api/v1/prospecting/campaigns",
    ) as [string, Record<string, unknown>] | undefined;
    expect(chamada).toBeTruthy();
    const corpo = chamada![1];
    expect(corpo.mensagens).toEqual([
      "Oi, tudo bem? Falo da Bill Higiene.",
      "Passando para apresentar a loja.",
      "Temos preço especial para oficinas.",
    ]);
    // A fonte padrão é a base: criar NÃO dispara busca no Google.
    expect(corpo.fonte_publico).toBe("base");
    expect(corpo.cidades).toEqual([{ cidade: "Canoinhas", estado: "SC" }]);
    expect(corpo.categorias).toEqual(["oficina"]);
    // A trava anti-ban viaja junto: o padrão é 60s entre duas mensagens e a tela
    // deixa o operador mudar (o teste do campo está logo abaixo).
    expect(corpo.espaco_ms).toBe(60_000);
    // E o "quando": período, janelas e cota do dia saem da tela para a campanha.
    expect(corpo.data_inicio).toBeTruthy();
    expect(corpo.data_fim).toBeTruthy();
    expect(Array.isArray(corpo.janelas)).toBe(true);
    expect((corpo.janelas as Array<{ inicio: string; fim: string }>).length).toBeGreaterThan(0);
  });

  it("o intervalo entre mensagens é escolhido na criação e vira o ritmo da campanha", async () => {
    const aoConcluir = vi.fn();
    abrir(aoConcluir);
    await irAteAsMensagens();

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER_1), {
      target: { value: "Oi, tudo bem? Falo da Bill Higiene." },
    });

    // Nasce em 60s — o padrão seguro — e o campo fica na mesma etapa do limite.
    const campo = screen.getByLabelText("Intervalo entre mensagens (s)") as HTMLInputElement;
    expect(campo.value).toBe("60");

    fireEvent.change(campo, { target: { value: "120" } });
    // O resumo mostra o que VAI SER GRAVADO, não o que foi digitado: é isso que
    // o operador confere antes de criar.
    expect(screen.getAllByText(/uma mensagem a cada 2 min/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }));

    await waitFor(() => expect(aoConcluir).toHaveBeenCalledWith("campanha-1"));
    const chamada = post.mock.calls.find(
      ([url]) => url === "/api/v1/prospecting/campaigns",
    ) as [string, Record<string, unknown>] | undefined;
    expect(chamada?.[1].espaco_ms).toBe(120_000);
  });

  it("caixa vazia não vira variação: só o que tem texto viaja", async () => {
    const aoConcluir = vi.fn();
    abrir(aoConcluir);
    await irAteAsMensagens();

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER_1), {
      target: { value: "Só esta mensagem." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }));

    await waitFor(() => expect(aoConcluir).toHaveBeenCalled());
    const chamada = post.mock.calls.find(
      ([url]) => url === "/api/v1/prospecting/campaigns",
    ) as [string, Record<string, unknown>] | undefined;
    expect(chamada![1].mensagens).toEqual(["Só esta mensagem."]);
  });

  it("fonte Google cria a campanha e inicia a busca, sem prévia da base", async () => {
    const aoConcluir = vi.fn();
    abrir(aoConcluir);

    fireEvent.change(screen.getByLabelText("Nome da campanha"), {
      target: { value: "Oficinas novas" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Google/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Canoinhas\/SC/ }));
    fireEvent.click(screen.getByRole("button", { name: "Oficina" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER_1), {
      target: { value: "Olá! Somos a Bill Higiene." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }));

    await waitFor(() => expect(aoConcluir).toHaveBeenCalledWith("campanha-1"));
    const chamada = post.mock.calls.find(
      ([url]) => url === "/api/v1/prospecting/campaigns",
    ) as [string, Record<string, unknown>] | undefined;
    expect(chamada![1].fonte_publico).toBe("busca");
    expect(
      post.mock.calls.some(([url]) => url === "/api/v1/prospecting/campaigns/campanha-1/executar"),
    ).toBe(true);
  });

  it("com duas categorias, escolhe um modelo por categoria e envia o mapeamento", async () => {
    canaisResposta = CANAIS_MODELO_POR_CATEGORIA;
    const aoConcluir = vi.fn();
    abrir(aoConcluir);
    await irAteAsMensagens(["Oficina", "Posto"]);

    fireEvent.change(await screen.findByLabelText("Modelo de Oficina"), {
      target: { value: "boas_vindas|pt_BR" },
    });
    fireEvent.change(screen.getByLabelText("Modelo de Posto"), {
      target: { value: "posto_oferta|pt_BR" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }));

    await waitFor(() => expect(aoConcluir).toHaveBeenCalledWith("campanha-1"));
    const chamada = post.mock.calls.find(
      ([url]) => url === "/api/v1/prospecting/campaigns",
    ) as [string, Record<string, unknown>] | undefined;
    const corpo = chamada![1];
    expect(corpo.mensagem_tipo).toBe("template");
    expect(corpo.templates_por_categoria).toEqual([
      {
        categoria: "oficina",
        name: "boas_vindas",
        language: "pt_BR",
        contract_hash: "hash-1",
        values: {},
      },
      {
        categoria: "posto",
        name: "posto_oferta",
        language: "pt_BR",
        contract_hash: "hash-2",
        values: {},
      },
    ]);
    // O bind legado é o PRIMEIRO mapeamento: a constraint da 0284 continua
    // satisfeita e o curinga histórico tem um modelo declarado.
    expect(corpo.template_name).toBe("boas_vindas");
    expect(corpo.template_contract_hash).toBe("hash-1");
  });

  it("categoria sem modelo impede criar e diz qual falta", async () => {
    canaisResposta = CANAIS_MODELO_POR_CATEGORIA;
    abrir();
    await irAteAsMensagens(["Oficina", "Posto"]);

    fireEvent.change(await screen.findByLabelText("Modelo de Oficina"), {
      target: { value: "boas_vindas|pt_BR" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    // Não avança: a revisão não abre enquanto uma categoria estiver sem modelo.
    expect(screen.queryByText("Revise antes de criar")).toBeNull();
    expect(
      screen.getByText("Sem modelo — a campanha não pode ser ativada sem ele."),
    ).toBeTruthy();
  });

  it("'Aplicar às demais' replica o modelo escolhido para as outras categorias", async () => {
    canaisResposta = CANAIS_MODELO_POR_CATEGORIA;
    const aoConcluir = vi.fn();
    abrir(aoConcluir);
    await irAteAsMensagens(["Oficina", "Posto"]);

    fireEvent.change(await screen.findByLabelText("Modelo de Oficina"), {
      target: { value: "boas_vindas|pt_BR" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar às demais" }));

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }));

    await waitFor(() => expect(aoConcluir).toHaveBeenCalledWith("campanha-1"));
    const chamada = post.mock.calls.find(
      ([url]) => url === "/api/v1/prospecting/campaigns",
    ) as [string, Record<string, unknown>] | undefined;
    const binds = chamada![1].templates_por_categoria as Array<{
      categoria: string;
      name: string;
    }>;
    expect(binds.map((b) => b.name)).toEqual(["boas_vindas", "boas_vindas"]);
  });
});
