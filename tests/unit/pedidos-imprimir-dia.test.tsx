/**
 * "IMPRIMIR O DIA" — todos os pedidos de hoje, num clique, ao lado do
 * "Imprimir pedidos".
 *
 * O botão vizinho imprime o que a lista mostra (seleção ou os 50 primeiros
 * do filtro). Este zera o filtro para o dia e busca os ids direto na API —
 * porque a lista na tela pode estar paginada ou filtrada, e o "todos do dia"
 * não pode depender do que por acaso está visível.
 *
 * O que se mede aqui:
 * 1. O GET leva `de`+`ate` de hoje — sem eles, imprimiria a lista inteira
 *    sem filtro de data (a mutação que importa).
 * 2. Dia vazio avisa e NÃO navega — navegar com `ids=` vazio abriria a tela
 *    de impressão vazia, que parece bug.
 * 3. Acima de 50, trunca pelo `idsDoLote` e avisa — nunca em silêncio.
 */
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PedidoComercial } from "@/lib/schemas/pedidos";
import { hojeEmChave } from "@/app/app/pedidos/_periodo";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/components/nexus-ui/forms/ConfirmacaoProvider", () => ({ useConfirmar: () => vi.fn() }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const pushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { PedidosClient } from "@/app/app/pedidos/_client";
import { apiClient } from "@/lib/api/client";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type Textos = ComponentProps<typeof PedidosClient>["textos"];

const TEXTOS: Textos = {
  titulo: "Pedidos",
  subtitulo: "Os pedidos da loja.",
  vazio: "Nenhum pedido ainda",
  vazioDica: "Crie o primeiro pedido no botão acima.",
  novo: "Novo pedido",
  relatorios: "Relatórios",
  todosStatus: "Todos os status",
  todasOrigens: "Todas as origens",
  verPdf: "Ver",
  baixarPdf: "Baixar",
  buscar: "Buscar",
  condicao: "Pagamento",
  valorMin: "Valor mín (R$)",
  valorMax: "Valor máx (R$)",
  meus: "Só meus pedidos",
  salvarFiltro: "Salvar filtro",
  nomeFiltro: "Nome do filtro…",
  statusLabel: "Status",
  avancados: "Filtros avançados",
  limpar: "Limpar filtros",
  salvos: "Filtros salvos",
  excluir: "Excluir",
  tabela: "Tabela",
  quadro: "Quadro",
  cartoes: "Cartões",
  selecionarTodos: "Selecionar todos",
  avancarSelecionados: "Avançar",
  aprovarSelecionados: "Aprovar",
  cancelarSelecionados: "Cancelar",
  excluirSelecionados: "Excluir",
  exportar: "Exportar CSV",
  imprimirSelecionados: "Imprimir",
  duplicar: "Duplicar",
  historico: "Histórico",
  avancar: "Avançar",
  cancelar: "Cancelar",
  verDetalhe: "Detalhe",
};

/** UUIDs válidos e distintos: `idsDoLote` só aceita o formato canônico. */
function uuid(n: number): string {
  return `11111111-1111-4111-8111-1111111111${String(n).padStart(2, "0")}`;
}

function montar() {
  return render(
    <PedidosClient
      inicial={[]}
      iniciais={{ status: "", origem: "", vendedor: "", de: "", ate: "" }}
      podeCriar
      podeExcluir
      meuId="33333333-3333-3333-3333-333333333333"
      textos={TEXTOS}
    />,
  );
}

function clicarImprimirODia() {
  const botao = screen.getByRole("button", { name: /Imprimir o dia|Buscando o dia/ });
  fireEvent.click(botao);
}

describe("Imprimir o dia", () => {
  it("busca só o dia de hoje e navega com os ids", async () => {
    const ids = [uuid(1), uuid(2), uuid(3)];
    // Resposta padrão para TODAS as chamadas: o clique também reseta o
    // filtro da tela (`mudar`), e esse reset busca de novo. O que importa é
    // que a PRIMEIRA chamada — a do botão — leva o dia.
    vi.mocked(apiClient.get).mockResolvedValue({ data: ids.map((id) => ({ id })) });
    montar();
    clicarImprimirODia();

    const hoje = hojeEmChave();
    await waitFor(() => expect(pushMock).toHaveBeenCalledOnce());
    const primeira = String(vi.mocked(apiClient.get).mock.calls[0]?.[0] ?? "");
    expect(primeira).toContain(`de=${hoje}`);
    expect(primeira).toContain(`ate=${hoje}`);

    const destino = String(pushMock.mock.calls[0]?.[0] ?? "");
    expect(destino.startsWith("/app/pedidos/imprimir?ids=")).toBe(true);
    for (const id of ids) expect(destino).toContain(id);
  });

  it("MUTAÇÃO: sem de/ate, imprimiria a lista inteira sem filtro de data", async () => {
    // Se a chamada saísse sem os dois parâmetros, o "dia" viraria "tudo" —
    // e ninguém perceberia, porque o PDF sairia normalmente, só que gigante.
    vi.mocked(apiClient.get).mockResolvedValue({ data: [{ id: uuid(1) }] });
    montar();
    clicarImprimirODia();

    await waitFor(() => expect(pushMock).toHaveBeenCalledOnce());
    const primeira = String(vi.mocked(apiClient.get).mock.calls[0]?.[0] ?? "");
    expect(primeira).toMatch(/[?&]de=\d{4}-\d{2}-\d{2}/);
    expect(primeira).toMatch(/[?&]ate=\d{4}-\d{2}-\d{2}/);
  });

  it("dia vazio avisa e não navega", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    montar();
    clicarImprimirODia();

    await waitFor(() => expect(vi.mocked(toast.info)).toHaveBeenCalledOnce());
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("acima de 50 trunca pelo lote e avisa — nunca em silêncio", async () => {
    const ids = Array.from({ length: 55 }, (_, i) => ({ id: uuid(i) }));
    vi.mocked(apiClient.get).mockResolvedValue({ data: ids });
    montar();
    clicarImprimirODia();

    await waitFor(() => expect(pushMock).toHaveBeenCalledOnce());
    const destino = String(pushMock.mock.calls[0]?.[0] ?? "");
    const levados = (destino.split("ids=")[1] ?? "").split(",").filter(Boolean);
    expect(levados).toHaveLength(50);
    expect(vi.mocked(toast.warning)).toHaveBeenCalledOnce();
  });

  it("erro da API não navega", async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("rede"));
    montar();
    clicarImprimirODia();

    await waitFor(() => expect(pushMock).not.toHaveBeenCalled());
  });
});
