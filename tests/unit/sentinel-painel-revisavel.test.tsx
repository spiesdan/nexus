/**
 * O PAINEL DO SENTINEL v1.1 — o plano revisável e os papéis, na tela.
 *
 * ─── O que este arquivo prova, e por que não é E2E ─────────────────────────
 *
 * O E2E `tests/e2e/sentinel-painel.spec.ts` continua sendo a prova de jornada
 * (login real, banco real, kill switch persistido). Nesta máquina ele NÃO era
 * executável: o daemon do Docker está desligado e o worktree novo não tem
 * `.env.e2e` — sem Supabase local não há login nem seed. A doutrina de QA
 * visual permite a prova de componente quando o E2E é inviável; o motivo está
 * declarado aqui e no doc da frente.
 *
 * O que só a tela pode quebrar, e este teste pega:
 *
 *  1. a lista abre e o filtro padrão esconde as fechadas;
 *  2. a busca recorta a lista de verdade;
 *  3. o detalhe mostra o plano (passos, risco, reversibilidade, pendências,
 *     limitação) e o histórico — não um JSON cru;
 *  4. ocorrência antiga (`recomendacao = {}`) NÃO inventa plano;
 *  5. kill switch desligado desabilita a varredura e explica o motivo;
 *  6. viewer não configura nem age; agent age mas não configura; gestor
 *     configura. A porta é a mesma que a rota valida.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));

const refreshMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { SentinelClient } from "@/app/app/sentinel/_client";
import type {
  ConfiguracaoSentinelCliente,
  DetalheSentinel,
  EventoSentinel,
  ExecucaoSentinel,
  OcorrenciaSentinel,
} from "@/app/app/sentinel/_tipos";
import { apiClient } from "@/lib/api/client";
import type { Recomendacao } from "@/lib/sentinel/tipos";

const AGORA = "2026-11-18T12:00:00.000Z";

function plano(over: Partial<Recomendacao> = {}): Recomendacao {
  return {
    resumo: "Contar fisicamente e corrigir com movimento, nunca com UPDATE direto.",
    passos: ["Confira o saldo físico do produto.", "Lance o ajuste com motivo e responsável."],
    campos_pendentes: ["contagem física", "motivo do ajuste"],
    risco: "alto",
    reversibilidade: "reversivel",
    exige_aprovacao: true,
    fonte: ["catalog_products", "inventory_movements"],
    limitacao: "Alterar o cache sem movimento apaga a trilha do razão.",
    confianca: "alta",
    ...over,
  };
}

function ocorrencia(over: Partial<OcorrenciaSentinel> = {}): OcorrenciaSentinel {
  return {
    id: "oc-1",
    regra: "operacao.estoque_negativo",
    categoria: "operacao",
    entidade_tipo: "catalog_products",
    entidade_id: "produto-1",
    titulo: "SKU-1 com estoque negativo",
    resumo: "O saldo ficou abaixo de zero.",
    causa_provavel: "Saída sem entrada correspondente.",
    severidade: "critica",
    estado: "nova",
    evidencia: { quantidade: -2, codigo: "SKU-1" },
    recomendacao: plano(),
    href: "/app/estoque",
    primeira_vista_em: AGORA,
    ultima_vista_em: AGORA,
    vezes_vista: 2,
    recorrencias: 0,
    responsavel_user_id: null,
    ignorada_motivo: null,
    motivo_encerramento: null,
    encerrada_em: null,
    created_at: AGORA,
    updated_at: AGORA,
    ...over,
  };
}

function evento(over: Partial<EventoSentinel> = {}): EventoSentinel {
  return {
    id: "ev-1",
    tipo: "detectada",
    estado_anterior: null,
    estado_novo: "nova",
    origem: "sentinel",
    ator_user_id: null,
    detalhe: { regra: "operacao.estoque_negativo" },
    created_at: AGORA,
    ...over,
  };
}

const ABERTA = ocorrencia();
const CAMPANHA = ocorrencia({
  id: "oc-2",
  regra: "campanha.cidade_repetida",
  categoria: "campanha",
  entidade_tipo: "prospecting_campaigns",
  entidade_id: "campanha-1",
  titulo: "Campanha repete cidade no recorte",
  severidade: "baixa",
  estado: "investigando",
  href: "/app/campanhas",
  recomendacao: plano({
    resumo: "Deduplicar o recorte antes de gastar cota.",
    passos: ["Remova a cidade repetida da campanha."],
    campos_pendentes: ["cidade a remover"],
    risco: "baixo",
    reversibilidade: "irreversivel",
    exige_aprovacao: false,
    fonte: ["prospecting_campaigns"],
    limitacao: null,
    confianca: "media",
  }),
});
// Anterior à v1.1: a coluna nasceu com `{}` — a tela não pode fingir um plano.
const ANTIGA = ocorrencia({
  id: "oc-3",
  regra: "fiscal.nota_pendente_antiga",
  categoria: "fiscal",
  titulo: "Nota antiga ainda pendente",
  severidade: "media",
  estado: "encerrada",
  recomendacao: {},
});

const CONFIG: ConfiguracaoSentinelCliente = {
  ativo: true,
  intervaloMinutos: 360,
  retencaoDias: 180,
  limiteOcorrencias: 500,
  detectoresDesativados: [],
  ultimaExecucaoEm: AGORA,
};

const EXECUCOES: ExecucaoSentinel[] = [
  {
    id: "run-1",
    origem: "manual",
    status: "sucesso",
    iniciado_em: AGORA,
    finalizado_em: AGORA,
    duracao_ms: 1_800,
    achados: 2,
    criadas: 2,
    reafirmadas: 0,
    encerradas: 0,
    erros: 0,
    truncado: false,
    erro: null,
  },
];

function detalheDe(o: OcorrenciaSentinel): DetalheSentinel {
  return { ocorrencia: o, eventos: [evento()], regra_descricao: "Descrição da regra." };
}

function renderizar({
  ocorrencias = [ABERTA, CAMPANHA, ANTIGA],
  configuracao = CONFIG,
  ambienteLigado = true,
  podeAgir = true,
  podeGerir = true,
}: {
  ocorrencias?: OcorrenciaSentinel[];
  configuracao?: ConfiguracaoSentinelCliente;
  ambienteLigado?: boolean;
  podeAgir?: boolean;
  podeGerir?: boolean;
} = {}) {
  return render(
    <SentinelClient
      ocorrencias={ocorrencias}
      execucoes={EXECUCOES}
      configuracao={configuracao}
      linhaDeConfiguracaoExiste={true}
      ambienteLigado={ambienteLigado}
      podeAgir={podeAgir}
      podeGerir={podeGerir}
    />,
  );
}

async function abrirDetalheDe(ocorrencia: OcorrenciaSentinel): Promise<HTMLElement> {
  vi.mocked(apiClient.get).mockResolvedValue({ data: detalheDe(ocorrencia) });
  fireEvent.click(screen.getByRole("button", { name: new RegExp(ocorrencia.titulo) }));
  await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  const dialogo = screen.getByRole("dialog");
  await waitFor(() => expect(within(dialogo).getByText(ocorrencia.titulo)).toBeInTheDocument());
  return dialogo;
}

beforeEach(() => {
  // Radix Select/Dialog usam APIs que o jsdom não implementa.
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Sentinel — painel revisável", () => {
  it("abre a lista, esconde fechadas por padrão e a busca recorta", () => {
    renderizar();

    expect(screen.getByRole("heading", { name: "Sentinel", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(ABERTA.titulo)).toBeInTheDocument();
    expect(screen.getByText(CAMPANHA.titulo)).toBeInTheDocument();
    // Encerrada: o filtro padrão "Abertas" a esconde.
    expect(screen.queryByText(ANTIGA.titulo)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Buscar ocorrência" }), {
      target: { value: "campanha" },
    });
    expect(screen.getByText(CAMPANHA.titulo)).toBeInTheDocument();
    expect(screen.queryByText(ABERTA.titulo)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Buscar ocorrência" }), {
      target: { value: "nada-com-isso" },
    });
    expect(screen.getByText("Nada com esse filtro")).toBeInTheDocument();
  });

  it("detalhe mostra plano revisável, limitação, fontes e histórico", async () => {
    renderizar();
    const dialogo = await abrirDetalheDe(ABERTA);

    expect(within(dialogo).getByText("Plano de correção (revisável)")).toBeInTheDocument();
    expect(within(dialogo).getByText("Risco alto")).toBeInTheDocument();
    expect(within(dialogo).getByText("Reversível")).toBeInTheDocument();
    expect(within(dialogo).getByText("Exige aprovação")).toBeInTheDocument();
    expect(within(dialogo).getByText("Confira o saldo físico do produto.")).toBeInTheDocument();
    expect(within(dialogo).getByText("contagem física")).toBeInTheDocument();
    expect(within(dialogo).getByText(/Alterar o cache sem movimento/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/Nada é executado automaticamente/)).toBeInTheDocument();
    expect(within(dialogo).getByText("Histórico")).toBeInTheDocument();
    expect(within(dialogo).getByText("detectada")).toBeInTheDocument();
  });

  it("ocorrência anterior à v1.1 não inventa plano", async () => {
    renderizar({ ocorrencias: [{ ...ANTIGA, estado: "nova" }] });
    const dialogo = await abrirDetalheDe({ ...ANTIGA, estado: "nova" });

    expect(within(dialogo).getByText("Sem plano registrado", { exact: false })).toBeInTheDocument();
    expect(within(dialogo).queryByText("Plano de correção (revisável)")).not.toBeInTheDocument();
  });

  it("plano incompleto no banco não branqueia o detalhe", async () => {
    const quebrado = ocorrencia({
      id: "oc-4",
      titulo: "Ocorrência com plano truncado",
      // Sem `fonte`/`reversibilidade`: o motor não gravaria, mas a tela lê o banco.
      recomendacao: {
        resumo: "Plano que veio truncado do banco.",
        passos: ["Um passo qualquer"],
        risco: "alto",
      } as unknown as Recomendacao,
    });
    renderizar({ ocorrencias: [quebrado] });
    const dialogo = await abrirDetalheDe(quebrado);

    expect(within(dialogo).getByText("Sem plano registrado", { exact: false })).toBeInTheDocument();
    expect(within(dialogo).getByText("O que foi encontrado")).toBeInTheDocument();
  });

  it("kill switch desligado explica e desabilita a varredura", () => {
    renderizar({ configuracao: { ...CONFIG, ativo: false } });

    expect(
      screen.getByText("O Sentinel está desligado para esta organização."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Executar agora/ })).toBeDisabled();
    // O gestor ainda precisa entrar para religar.
    expect(screen.getByRole("button", { name: "Configurações" })).toBeEnabled();
  });

  it("ambiente desligado tem mensagem própria", () => {
    renderizar({ ambienteLigado: false });
    expect(screen.getByText("O Sentinel está desligado nesta instalação.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Executar agora/ })).toBeDisabled();
  });

  it("viewer enxerga o plano, mas não configura nem age", async () => {
    renderizar({ podeAgir: false, podeGerir: false });

    expect(screen.queryByRole("button", { name: "Configurações" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Executar agora/ })).not.toBeInTheDocument();

    const dialogo = await abrirDetalheDe(ABERTA);
    expect(within(dialogo).getByText("Plano de correção (revisável)")).toBeInTheDocument();
    expect(within(dialogo).queryByRole("button", { name: "Assumir" })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole("button", { name: "Pedir ação" })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole("button", { name: "Ignorar" })).not.toBeInTheDocument();
  });

  it("gestor configura a varredura e decide o que o agent não pode", async () => {
    renderizar({ podeAgir: true, podeGerir: true });

    expect(screen.getByRole("button", { name: "Configurações" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Executar agora/ })).toBeInTheDocument();

    const dialogo = await abrirDetalheDe(ABERTA);
    expect(within(dialogo).getByRole("button", { name: "Ignorar" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Encerrar" })).toBeInTheDocument();
  });

  it("o switch de kill switch salva ativo:false", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { configuracao: { ...CONFIG, ativo: false } },
    } as never);
    renderizar();

    fireEvent.click(screen.getByRole("button", { name: "Configurações" }));
    const config = screen.getByRole("dialog");
    expect(within(config).getByText("Configurações do Sentinel")).toBeInTheDocument();

    fireEvent.click(within(config).getByRole("switch"));
    fireEvent.click(within(config).getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith(
        "/api/v1/sentinel/settings",
        expect.objectContaining({ ativo: false }),
      ),
    );
  });

  it("agent age no detalhe, mas não configura a varredura", async () => {
    renderizar({ podeAgir: true, podeGerir: false });

    expect(screen.queryByRole("button", { name: "Configurações" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Executar agora/ })).not.toBeInTheDocument();

    const dialogo = await abrirDetalheDe(ABERTA);
    expect(within(dialogo).getByRole("button", { name: "Assumir" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Pedir ação" })).toBeInTheDocument();
    // Ignorar/encerrar são decisão de gestor: a tela não oferece.
    expect(within(dialogo).queryByRole("button", { name: "Ignorar" })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole("button", { name: "Encerrar" })).not.toBeInTheDocument();
  });
});
