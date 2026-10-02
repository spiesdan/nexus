/**
 * Meu Dia (§21) — a refatoração que transformou "três listas iguais" na
 * linha do tempo prometida pelo spec. O que estes casos vigiam:
 *
 *  1. a tela agrupa de VERDADE (Atrasado → Hoje) e a saudação vem do
 *     relógio de quem olha — o "Bom dia" fixo de 21h era o defeito;
 *  2. as duas ações do dia batem nas rotas certas: Concluir (status) e
 *     Amanhã (agendada_para em YYYY-MM-DD);
 *  3. "Dia limpo" só quando TUDO está vazio — antes ele aparecia junto das
 *     listas, como rodapé;
 *  4. erro num bloco não derruba a tela (falha isolada) e a frase de erro
 *     não é a "Erro ao carregar…" que a auditoria (§100) trata como quebra;
 *  5. Mensagens lista só as NÃO LIDAS dirigidas a mim.
 *
 * `useT` é a identidade, então o texto afirmado aqui é o que o usuário lê.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api/client";
import { chaveDeAmanha, chaveDeData, dataPorExtenso, saudacaoDoDia } from "@/lib/meu-dia/dia";
import { MeuDiaClient } from "@/app/app/meu-dia/_components/MeuDiaClient";

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), patch: vi.fn() },
}));
vi.mock("@/hooks/i18n/useT", () => ({
  useT: () => (chave: string) => chave,
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({
  showApiError: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

const AGORA = new Date();
const ONTEM = chaveDeData(new Date(AGORA.getFullYear(), AGORA.getMonth(), AGORA.getDate() - 1));
const HOJE = chaveDeData(AGORA);

interface Dados {
  tarefas: unknown[];
  agenda: unknown[];
  conversas: unknown[];
  followups: unknown[];
  brain: unknown[];
  pedidos: unknown[];
}

let dados: Dados;

function respostas(): void {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url.startsWith("/api/v1/tarefas")) return Promise.resolve({ data: dados.tarefas });
    if (url.startsWith("/api/v1/agenda/agendamentos")) return Promise.resolve({ data: dados.agenda });
    if (url.startsWith("/api/v1/conversations")) return Promise.resolve({ data: dados.conversas });
    if (url.startsWith("/api/v1/ai/followups/queue")) return Promise.resolve({ data: dados.followups });
    if (url.startsWith("/api/v1/sales-brain")) return Promise.resolve({ data: dados.brain });
    if (url.startsWith("/api/v1/commercial-orders")) return Promise.resolve({ data: dados.pedidos });
    return Promise.resolve({ data: [] });
  });
}

function pintar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <MeuDiaClient nome="Ana" userId="11111111-1111-4111-8111-111111111111" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dados = {
    tarefas: [],
    agenda: [],
    conversas: [],
    followups: [],
    brain: [],
    pedidos: [],
  };
  vi.mocked(apiClient.patch).mockResolvedValue({} as never);
  respostas();
});

afterEach(cleanup);

describe("MeuDiaClient — a linha do tempo do dia", () => {
  it("agrupa Atrasado → Hoje e a saudação vem do relógio de quem olha", async () => {
    dados.tarefas = [
      {
        id: "t1",
        titulo: "Ligar para o cliente velho",
        tipo: "follow",
        status: "pendente",
        contato_nome: "João",
        agendada_para: ONTEM,
      },
      {
        id: "t2",
        titulo: "Enviar a proposta",
        tipo: "follow",
        status: "pendente",
        contato_nome: "Maria",
        agendada_para: HOJE,
      },
    ];
    dados.agenda = [
      {
        id: "a1",
        titulo: "Reunião comercial",
        iniciaEm: new Date(AGORA.getFullYear(), AGORA.getMonth(), AGORA.getDate(), 10, 0).toISOString(),
        situacao: "confirmed",
        contatoNome: "Pedro",
      },
    ];
    pintar();

    await screen.findByText("Ligar para o cliente velho");
    expect(screen.getByRole("heading", { name: /Atrasado/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Hoje/ })).toBeInTheDocument();
    // Compromisso com hora: aparece com a HORA LOCAL na seção Hoje.
    expect(screen.getByText("Reunião comercial")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();

    // Saudação = relógio AGORA + nome (o "Bom dia" fixo era o defeito).
    expect(
      screen.getByRole("heading", { level: 1, name: `${saudacaoDoDia(new Date())}, Ana` }),
    ).toBeInTheDocument();
    // Subtítulo = data por extenso + o resumo de contagens da própria tela.
    expect(
      screen.getByText(`${dataPorExtenso(new Date())} · 1 atrasada · 2 hoje`),
    ).toBeInTheDocument();
  });

  it("Concluir bate PATCH /tarefas/{id} com status concluida", async () => {
    const user = userEvent.setup();
    dados.tarefas = [
      {
        id: "t2",
        titulo: "Enviar a proposta",
        tipo: "follow",
        status: "pendente",
        contato_nome: "Maria",
        agendada_para: HOJE,
      },
    ];
    pintar();
    await screen.findByText("Enviar a proposta");

    await user.click(screen.getByRole("button", { name: "Concluir" }));
    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith("/api/v1/tarefas/t2", {
        status: "concluida",
      }),
    );
  });

  it("Amanhã empurra agendada_para para a data local seguinte (YYYY-MM-DD)", async () => {
    const user = userEvent.setup();
    dados.tarefas = [
      {
        id: "t2",
        titulo: "Enviar a proposta",
        tipo: "follow",
        status: "pendente",
        contato_nome: "Maria",
        agendada_para: HOJE,
      },
    ];
    pintar();
    await screen.findByText("Enviar a proposta");

    await user.click(screen.getByRole("button", { name: "Amanhã" }));
    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith("/api/v1/tarefas/t2", {
        agendada_para: chaveDeAmanha(),
      }),
    );
  });

  it("Dia limpo aparece SÓ com tudo vazio (sem timeline nem blocos embaixo)", async () => {
    dados.pedidos = [{ id: "p1" }];
    pintar();

    expect(await screen.findByText("Dia limpo")).toBeInTheDocument();
    expect(screen.queryByText("Sem tarefas nem compromissos marcados.")).toBeNull();
    expect(screen.queryByRole("heading", { name: /Hoje/ })).toBeNull();
  });

  it("erro na tarefa não derruba a tela: alerta + retry na timeline, blocos seguem vivos", async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/tarefas")) return Promise.reject(new Error("boom"));
      if (url.startsWith("/api/v1/ai/followups/queue")) {
        return Promise.resolve({
          data: [
            {
              id: "f1",
              source: "flow",
              flow_name: "Recuperação de carrinho",
              contact: { name: "Ana" },
              node_or_reason: "aguardando 24h",
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });
    pintar();

    const alerta = await screen.findByRole("alert");
    // A frase é a da tela, não a "Erro ao carregar…" da auditoria §100.
    expect(alerta).toHaveTextContent("Não consegui ler a agenda e as tarefas do dia.");
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
    // Falha isolada: o bloco de follow-ups carregou do mesmo jeito.
    expect(await screen.findByText("Recuperação de carrinho")).toBeInTheDocument();
    expect(screen.queryByText(/Erro ao (carregar|listar)/)).toBeNull();
  });

  it("Mensagens lista só as não-lidas, com preview e porta para o inbox", async () => {
    dados.conversas = [
      {
        id: "c1",
        unread_count_for_assignee: 2,
        last_message_preview: "Oi, tudo bem?",
        contacts: { display_name: "Carlos", name: null },
      },
      {
        id: "c2",
        unread_count_for_assignee: 0,
        last_message_preview: "já respondido",
        contacts: { display_name: "Beatriz", name: null },
      },
    ];
    pintar();

    expect(await screen.findByText("Carlos")).toBeInTheDocument();
    expect(screen.getByText("Oi, tudo bem?")).toBeInTheDocument();
    const responder = screen.getByRole("link", { name: "Responder" });
    expect(responder).toHaveAttribute("href", "/app/inbox?id=c1");
    // A conversa já lida não disputa o topo da coluna.
    expect(screen.queryByText("Beatriz")).toBeNull();
  });
});
