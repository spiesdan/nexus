/**
 * J13 — o BOTÃO de sincronizar: o que o operador vê quando a SEFAZ não deixa.
 *
 * A metade de servidor está em `j13-fiscal-falha-de-sincronizacao.test.ts`.
 * Aqui se mede a outra metade, e ela tem uma regra de produto explícita no
 * componente: quando a SEFAZ manda esperar (656), o botão diz a HORA da próxima
 * tentativa em vez de deixar o operador clicando até tomar bloqueio.
 *
 * Também se prova o caminho de erro: falha vira `showApiError`, não um toast
 * verde de "0 nova(s), 0 atualizada(s)" — que seria a mentira mais cara desta
 * tela, porque parece sincronização bem-sucedida sem nada ter vindo.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BotaoSincronizar } from "@/app/app/fiscal/_components/BotaoSincronizar";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/api/client", () => ({ apiClient: { post: vi.fn() } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function resposta(extra: Record<string, unknown> = {}) {
  return {
    data: {
      novas: 0,
      atualizadas: 0,
      erros: 0,
      aviso: null,
      cstat: null,
      proximaTentativa: null,
      ...extra,
    },
  };
}

beforeEach(() => {
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(nexusToast.success).mockClear();
  vi.mocked(nexusToast.warning).mockClear();
  vi.mocked(showApiError).mockClear();
  mocks.refresh.mockClear();
});

describe("BotaoSincronizar", () => {
  it("sucesso diz o que veio e recarrega a tela", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(resposta({ novas: 4, atualizadas: 2 }));
    render(<BotaoSincronizar />);

    fireEvent.click(screen.getByRole("button", { name: "Sincronizar agora" }));

    await waitFor(
      () => expect(nexusToast.success).toHaveBeenCalledWith("4 nova(s), 2 atualizada(s), 0 erro(s)."),
      { timeout: 5_000 },
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(showApiError).not.toHaveBeenCalled();
  });

  it("656 avisa a próxima tentativa em vez de deixar clicar até bloquear", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(
      resposta({
        aviso: "AGUARDAR_1H",
        cstat: "656",
        proximaTentativa: "2026-11-18T18:30:00.000Z",
      }),
    );
    render(<BotaoSincronizar />);

    fireEvent.click(screen.getByRole("button", { name: "Sincronizar agora" }));

    await waitFor(() => expect(nexusToast.warning).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    const mensagem = vi.mocked(nexusToast.warning).mock.calls[0]![0];
    expect(mensagem).toContain("A SEFAZ pediu para aguardar");
    expect(mensagem).toContain("Próxima tentativa a partir de");
    // A tela também recarrega: o log da tentativa bloqueada já existe no banco.
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("falha da chamada mostra o erro e NÃO finge sincronização vazia", async () => {
    const erro = new Error("502: SEFAZ inalcançável");
    vi.mocked(apiClient.post).mockRejectedValueOnce(erro);
    render(<BotaoSincronizar />);

    fireEvent.click(screen.getByRole("button", { name: "Sincronizar agora" }));

    await waitFor(() => expect(showApiError).toHaveBeenCalledWith(erro), { timeout: 5_000 });
    expect(nexusToast.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("o botão não aceita duplo clique enquanto a chamada está em curso", async () => {
    let resolver: ((v: unknown) => void) | undefined;
    vi.mocked(apiClient.post).mockReturnValueOnce(
      new Promise((resolve) => {
        resolver = resolve;
      }) as never,
    );
    render(<BotaoSincronizar />);

    const botao = screen.getByRole("button", { name: "Sincronizar agora" });
    fireEvent.click(botao);

    await waitFor(
      () =>
        expect(screen.getByRole("button", { name: "Buscando na SEFAZ…" })).toHaveProperty(
          "disabled",
          true,
        ),
      { timeout: 5_000 },
    );

    resolver?.(resposta());
    await waitFor(() => expect(nexusToast.success).toHaveBeenCalled(), { timeout: 5_000 });
  });
});
