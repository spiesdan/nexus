/**
 * O SINCRONIZADOR FALA — e não só quando dá certo.
 *
 * `SincronizadorOffline` ficou dois meses importado e nunca renderizado
 * (`aaff0b51`). O teste que impede o retorno do defeito é de wiring
 * (`layout-componentes-montados.test.ts`); este mede o COMPORTAMENTO do que
 * está montado: a faixa persistente, o motivo da recusa e o botão que
 * dispara o dreno de novo.
 *
 * ─── O que os dublês são e o que eles não são ───────────────────────────────
 *
 * A fila real é SQLite; o dreno real é `fetch`. Aqui os dois são dublês — mas a
 * unidade sob teste é a máquina de estados da faixa (quando aparece, o que
 * diz, o que o clique faz), e ela não sabe a diferença. As transições da fila e
 * do dreno têm teste próprio em `offline-outbox-sync.test.ts`.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dublês = vi.hoisted(() => ({
  drenarFila: vi.fn(),
  contarAbertos: vi.fn(),
  filaAberta: vi.fn(),
  reabrirRejeitado: vi.fn(),
  sincronizarCatalogo: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { info: dublês.toast, success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/offline/db", () => ({ banco: async () => ({}) }));
vi.mock("@/lib/offline/rede", () => ({ temSinal: async () => true }));
vi.mock("@/lib/offline/catalogo", () => ({
  sincronizarCatalogo: dublês.sincronizarCatalogo,
}));
vi.mock("@/lib/offline/sync", () => ({ drenarFila: dublês.drenarFila }));
vi.mock("@/lib/offline/outbox", () => ({
  contarAbertos: dublês.contarAbertos,
  filaAberta: dublês.filaAberta,
  reabrirRejeitado: dublês.reabrirRejeitado,
}));

import { SincronizadorOffline } from "@/app/app/_components/SincronizadorOffline";

function linha(over: Record<string, unknown> = {}) {
  return {
    uuid: "11111111-1111-4111-8111-111111111111",
    numero_provisorio: "OFF-0001",
    payload: {},
    status: "pendente",
    tentativas: 0,
    ultimo_erro: null,
    criado_em: "2026-11-18T12:00:00.000Z",
    enviado_em: null,
    reservado_em: null,
    pedido_id: null,
    pedido_numero: null,
    ...over,
  };
}

function drenoVazio(over: Partial<Record<string, unknown>> = {}) {
  return { itens: [], aceitos: 0, rejeitados: 0, adiados: 0, retomados: 0, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  // O componente só age no nativo. O dublê é o mínimo que ele consulta.
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
  };
  dublês.contarAbertos.mockResolvedValue({ pendentes: 0, rejeitados: 0 });
  dublês.filaAberta.mockResolvedValue([]);
  dublês.drenarFila.mockResolvedValue(drenoVazio());
  dublês.sincronizarCatalogo.mockResolvedValue(undefined);
  dublês.reabrirRejeitado.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

describe("SincronizadorOffline", () => {
  it("não mostra faixa quando não há nada na fila", async () => {
    const { container } = render(<SincronizadorOffline />);
    await waitFor(() => expect(dublês.drenarFila).toHaveBeenCalledTimes(1));
    expect(container.firstChild).toBeNull();
  });

  it("mostra contagem e motivo quando o servidor recusa", async () => {
    dublês.drenarFila.mockResolvedValue(
      drenoVazio({
        rejeitados: 1,
        itens: [
          {
            uuid: "11111111-1111-4111-8111-111111111111",
            numero_provisorio: "OFF-0001",
            resultado: "rejeitado",
            motivo: "Cliente acima do limite de crédito.",
          },
        ],
      }),
    );
    dublês.contarAbertos.mockResolvedValue({ pendentes: 0, rejeitados: 1 });
    dublês.filaAberta.mockResolvedValue([
      linha({ status: "rejeitado", ultimo_erro: "Cliente acima do limite de crédito." }),
    ]);

    render(<SincronizadorOffline />);

    const faixa = await screen.findByRole("status");
    expect(faixa).toHaveTextContent("1");
    expect(faixa).toHaveTextContent("recusado");
    expect(faixa).toHaveTextContent("Cliente acima do limite de crédito.");
    // O toast também avisa, mas ele some em segundos — a faixa é o que fica.
    expect(dublês.toast).toHaveBeenCalled();
  });

  it("'Enviar agora' dispara o dreno de novo", async () => {
    dublês.contarAbertos.mockResolvedValue({ pendentes: 1, rejeitados: 0 });
    dublês.filaAberta.mockResolvedValue([linha()]);

    render(<SincronizadorOffline />);
    await screen.findByRole("status");
    await waitFor(() => expect(dublês.drenarFila).toHaveBeenCalledTimes(1));

    screen.getByRole("button", { name: "Enviar agora" }).click();
    await waitFor(() => expect(dublês.drenarFila).toHaveBeenCalledTimes(2));
  });

  it("'Tentar de novo' reabre o recusado antes de drenar", async () => {
    dublês.contarAbertos.mockResolvedValue({ pendentes: 0, rejeitados: 1 });
    dublês.filaAberta.mockResolvedValue([
      linha({ status: "rejeitado", ultimo_erro: "Crédito excedido." }),
    ]);

    render(<SincronizadorOffline />);
    await screen.findByRole("status");

    screen.getByRole("button", { name: "Tentar de novo" }).click();
    await waitFor(() =>
      expect(dublês.reabrirRejeitado).toHaveBeenCalledWith(
        expect.anything(),
        "11111111-1111-4111-8111-111111111111",
      ),
    );
  });

  it("no navegador não abre banco nem renderiza nenhuma faixa", async () => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    const { container } = render(<SincronizadorOffline />);
    await new Promise((r) => setTimeout(r, 10));
    expect(container.firstChild).toBeNull();
    expect(dublês.drenarFila).not.toHaveBeenCalled();
  });
});
