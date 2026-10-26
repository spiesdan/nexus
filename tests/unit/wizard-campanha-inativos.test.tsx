/**
 * O ASSISTENTE — audiência de CLIENTES INATIVOS.
 *
 * A recuperação entra no mesmo assistente da prospecção de propósito: mesmas
 * três mensagens em rotação, mesma agenda, mesmo intervalo anti-ban. O que o
 * teste prende é o que muda:
 *
 *   1. o recorte é "há quantos dias sem comprar", não cidade/categoria;
 *   2. sem prévia não avança — a mesma promessa verificável da base;
 *   3. só os contatos `elegivel` viajam, e o POST vai para a rota de
 *      recuperação (não para a de garimpagem);
 *   4. modelo oficial é UM só, porque cliente não tem categoria.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    subcategorias: [{ rotulo: "Oficina", busca: "oficina" }] as never,
  },
];

const ELEGIVEL_1 = {
  contact_id: "11111111-1111-4111-8111-111111111111",
  nome: "Maria Silva",
  telefone: "+5547999999999",
  dias_sem_compra: 120,
  total_historico_cents: 250000,
  qtd_pedidos: 4,
  faixa: "frio" as const,
  score: 90,
  com_telefone: true,
  em_campanha: false,
  elegivel: true,
};

const ELEGIVEL_2 = {
  ...ELEGIVEL_1,
  contact_id: "22222222-2222-4222-8222-222222222222",
  nome: "João Souza",
  telefone: "+5547888888888",
  dias_sem_compra: 95,
  total_historico_cents: 120000,
  qtd_pedidos: 2,
  score: 60,
};

const SEM_TELEFONE = {
  ...ELEGIVEL_1,
  contact_id: "33333333-3333-4333-8333-333333333333",
  nome: "Sem WhatsApp",
  telefone: null,
  com_telefone: false,
  elegivel: false,
};

const RESERVADO = {
  ...ELEGIVEL_1,
  contact_id: "44444444-4444-4444-8444-444444444444",
  nome: "Em outra campanha",
  em_campanha: true,
  elegivel: false,
};

const PREVIA_INATIVOS = {
  dias_sem_compra: 90,
  total: 4,
  com_telefone: 3,
  sem_telefone: 1,
  em_campanha: 1,
  elegiveis: 2,
  varridos: 12,
  completa: true,
  resumo:
    "4 clientes sem compra há 90 dias · 3 com WhatsApp · 2 prontos para receber",
  linhas: [ELEGIVEL_1, ELEGIVEL_2, SEM_TELEFONE, RESERVADO],
};

const PLACEHOLDER_1 = "Olá {{primeiro_nome}}! Aqui é da …";
const PLACEHOLDER_N = "Outra forma de dizer a mesma coisa";

const CANAIS_SO_TEXTO = {
  pode_texto: true,
  pode_template: false,
  oficial_conectado: false,
  templates: [],
};

const MODELO = {
  name: "recuperacao",
  language: "pt_BR",
  status: "APPROVED",
  category: "MARKETING",
  rejectedReason: null,
  parameterFormat: "named",
  contractHash: "hash-1",
  syncedAt: "2026-10-25T00:00:00.000Z",
  slots: [
    {
      slotKey: "1",
      key: "nome",
      expects: "text",
      onde: "corpo",
      contexto: "Nome do cliente",
    },
  ],
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

let canaisResposta: Record<string, unknown> = CANAIS_SO_TEXTO;

afterEach(cleanup);

beforeEach(() => {
  post.mockReset();
  post.mockImplementation(async (url: string) => {
    if (url === "/api/v1/prospecting/campaigns/recuperacao/preview") {
      return { data: PREVIA_INATIVOS };
    }
    return { data: { id: "campanha-inativos-1" } };
  });

  canaisResposta = CANAIS_SO_TEXTO;
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === "/api/v1/prospecting/campaigns/canais") {
      return { data: canaisResposta };
    }
    return { data: { cidades: [{ cidade: "Canoinhas", estado: "SC", total: 12 }] } };
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

/** Passo 0 da recuperação: escolhe o público, nome, dias e vê a prévia. */
async function irAteAsMensagensInativas(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: /Recuperar clientes inativos/ }));
  fireEvent.change(screen.getByLabelText("Nome da campanha"), {
    target: { value: "Recuperação — pararam de comprar" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ver clientes" }));
  await screen.findAllByText(/prontos para o disparo/i);
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

describe("assistente de campanha — clientes inativos", () => {
  it("troca cidade/categoria pelo recorte de dias sem compra", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /Recuperar clientes inativos/ }));

    expect(screen.getByLabelText("Sem comprar há pelo menos (dias)")).toBeTruthy();
    expect(screen.queryByText("De onde vem o público?")).toBeNull();
    expect(screen.queryByText("Cidades")).toBeNull();
    expect(screen.queryByText("Categorias")).toBeNull();
    // O nome continua sendo pedido: é o rótulo da campanha no controle.
    expect(screen.getByLabelText("Nome da campanha")).toBeTruthy();
  });

  it("sem ver os clientes, as mensagens não abrem", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /Recuperar clientes inativos/ }));
    fireEvent.change(screen.getByLabelText("Nome da campanha"), {
      target: { value: "Recuperação sem prévia" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.queryByText("Mensagens da campanha")).toBeNull();
    expect(screen.getByText("Clientes que vão receber")).toBeTruthy();
  });

  it("a prévia mostra só quem pode receber e conta quem ficou de fora", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /Recuperar clientes inativos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ver clientes" }));

    expect(await screen.findByText("Maria Silva")).toBeTruthy();
    expect(screen.getByText("João Souza")).toBeTruthy();
    expect(screen.queryByText("Sem WhatsApp")).toBeNull();
    expect(screen.queryByText("Em outra campanha")).toBeNull();
    expect(screen.getByText(/1 sem WhatsApp/)).toBeTruthy();
    expect(screen.getByText(/1 em outra campanha/)).toBeTruthy();
  });

  it("mudar os dias invalida a prévia: a tela não promete público velho", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /Recuperar clientes inativos/ }));
    fireEvent.change(screen.getByLabelText("Nome da campanha"), {
      target: { value: "Recuperação — 90 dias" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ver clientes" }));
    await screen.findAllByText(/prontos para o disparo/i);

    fireEvent.change(screen.getByLabelText("Sem comprar há pelo menos (dias)"), {
      target: { value: "60" },
    });
    expect(screen.getByText(/O recorte de dias mudou/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.queryByText("Mensagens da campanha")).toBeNull();
  });

  it("cria pela rota de recuperação, só com os elegíveis e com as três mensagens", async () => {
    const aoConcluir = vi.fn();
    abrir(aoConcluir);
    await irAteAsMensagensInativas();

    expect(screen.getByLabelText(/Mensagem 1/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER_1), {
      target: { value: "Sentimos sua falta, {{primeiro_nome}}!" },
    });
    const opcionais = screen.getAllByPlaceholderText(PLACEHOLDER_N);
    fireEvent.change(opcionais[0]!, { target: { value: "Temos uma condição especial." } });
    fireEvent.change(opcionais[1]!, { target: { value: "Podemos repor o que acabou." } });

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("Clientes na prévia")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Criar e agendar" }));

    await waitFor(() => expect(aoConcluir).toHaveBeenCalledWith("campanha-inativos-1"));

    const chamada = post.mock.calls.find(
      ([url]) => url === "/api/v1/prospecting/campaigns/recuperacao",
    ) as [string, Record<string, unknown>] | undefined;
    expect(chamada).toBeTruthy();
    const corpo = chamada![1];
    expect(corpo.nome).toBe("Recuperação — pararam de comprar");
    expect(corpo.contato_ids).toEqual([ELEGIVEL_1.contact_id, ELEGIVEL_2.contact_id]);
    expect(corpo.mensagem_tipo).toBe("texto");
    expect(corpo.mensagens).toEqual([
      "Sentimos sua falta, {{primeiro_nome}}!",
      "Temos uma condição especial.",
      "Podemos repor o que acabou.",
    ]);
    expect(corpo.espaco_ms).toBe(60_000);
    expect(corpo.data_inicio).toBeTruthy();
    expect(Array.isArray(corpo.janelas)).toBe(true);
    // A recuperação nunca cai na rota de garimpagem nem dispara busca.
    expect(
      post.mock.calls.some(([url]) => url === "/api/v1/prospecting/campaigns"),
    ).toBe(false);
    expect(post.mock.calls.some(([url]) => String(url).endsWith("/executar"))).toBe(false);
  });

  it("com canal oficial, escolhe UM modelo e exige os parâmetros antes de criar", async () => {
    canaisResposta = CANAIS_SO_MODELO;
    const aoConcluir = vi.fn();
    abrir(aoConcluir);
    await irAteAsMensagensInativas();

    fireEvent.change(await screen.findByLabelText("Escolher modelo oficial"), {
      target: { value: "recuperacao|pt_BR" },
    });

    // Sem o parâmetro, não avança para a revisão.
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.queryByText("Revise antes de criar")).toBeNull();

    fireEvent.change(screen.getByLabelText(/parâmetro nome/), {
      target: { value: "Maria" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar e agendar" }));

    await waitFor(() => expect(aoConcluir).toHaveBeenCalledWith("campanha-inativos-1"));
    const chamada = post.mock.calls.find(
      ([url]) => url === "/api/v1/prospecting/campaigns/recuperacao",
    ) as [string, Record<string, unknown>] | undefined;
    const corpo = chamada![1];
    expect(corpo.mensagem_tipo).toBe("template");
    expect(corpo.template_name).toBe("recuperacao");
    expect(corpo.template_language).toBe("pt_BR");
    expect(corpo.template_contract_hash).toBe("hash-1");
    expect(corpo.template_values).toEqual({ "1": "Maria" });
    expect(corpo.mensagens).toBeUndefined();
    // Não existe "modelo por categoria" quando o público é cliente.
    expect(corpo.templates_por_categoria).toBeUndefined();
  });
});
