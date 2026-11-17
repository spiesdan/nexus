/**
 * PEDIDOS NÃO PODE FICAR MUDO FORA DA REDE — F-28.
 *
 * Medido em 17/11/2026 (`scripts/auditoria/offline-e-erro.mjs`): com o service
 * worker ativo e o navegador offline, contatos, inbox e financeiro abrem com
 * "Algo deu errado … Tentar novamente". Pedidos abria a casca e deixava a lista
 * vazia, sem alerta — indistinguível de "não há pedidos".
 *
 * Este teste trava as duas metades do conserto:
 *
 *  1. offline: `role="alert"` com "Sem conexão" e ação de tentar de novo;
 *  2. volta da rede: o alerta some e a lista é revalidada (`router.refresh`);
 *  3. falha de consulta no servidor: a tela diz que não carregou, em vez de
 *     mostrar a lista vazia como se o dado não existisse.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/components/nexus-ui/forms/ConfirmacaoProvider", () => ({
  useConfirmar: () => vi.fn(),
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn() },
}));

import { PedidosClient } from "@/app/app/pedidos/_client";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
});

type Textos = ComponentProps<typeof PedidosClient>["textos"];

/** O componente lê muitos rótulos; para este teste o valor não importa. */
const TEXTOS = new Proxy({}, { get: (_alvo, prop) => String(prop) }) as Textos;

function renderizar(props: Partial<ComponentProps<typeof PedidosClient>> = {}) {
  return render(
    <PedidosClient
      inicial={[]}
      iniciais={{ status: "", origem: "", vendedor: "", de: "", ate: "" }}
      podeCriar
      podeExcluir
      meuId="usuario-1"
      textos={TEXTOS}
      {...props}
    />,
  );
}

describe("Pedidos — offline e falha de carga (F-28)", () => {
  it("offline mostra alerta e some quando a rede volta, revalidando a lista", () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderizar();

    expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão");

    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("falha da consulta do servidor não vira lista vazia muda", () => {
    renderizar({ erroInicial: true });

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os pedidos.");
  });
});
