import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sentry/cliente", () => ({
  iniciarSentryCliente: vi.fn(),
  capturarErroPendente: vi.fn(),
}));

import { iniciarSentryCliente, capturarErroPendente } from "@/lib/sentry/cliente";

import { SentryLazy } from "./SentryLazy";
import { desinstalarCapturaPendente, filaDeErros, instalarCapturaPendente } from "@/lib/sentry/fila";

beforeEach(() => {
  vi.clearAllMocks();
  desinstalarCapturaPendente();
  filaDeErros.length = 0;
});

afterEach(() => {
  cleanup();
  desinstalarCapturaPendente();
});

describe("SentryLazy — SDK fora do first load", () => {
  it("inicializa no efeito e entrega a fila capturada antes do chunk chegar", async () => {
    instalarCapturaPendente();
    const antes = new ErrorEvent("error", {
      error: new Error("antes do sdk"),
      cancelable: true,
    });
    antes.preventDefault();
    window.dispatchEvent(antes);
    const rejeicao = new Event("unhandledrejection") as Event & { reason: unknown };
    rejeicao.reason = new Error("promessa antes do sdk");
    window.dispatchEvent(rejeicao);
    expect(filaDeErros).toHaveLength(2);

    render(<SentryLazy />);

    await waitFor(() => expect(iniciarSentryCliente).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(capturarErroPendente).toHaveBeenCalledTimes(2));
    expect(capturarErroPendente).toHaveBeenNthCalledWith(1, expect.any(Error));
    expect(filaDeErros).toHaveLength(0);

    // Depois do init, `desinstalarCapturaPendente` removeu os listeners; não
    // disparamos outro `ErrorEvent` aqui porque o jsdom o trata como exceção
    // global do teste, não como evento de janela.
  });

  it("sem chunk, não quebra e limpa a fila", async () => {
    const modulo = await import("@/lib/sentry/cliente");
    vi.mocked(modulo.iniciarSentryCliente).mockImplementation(() => {
      throw new Error("chunk indisponível");
    });
    filaDeErros.push(new Error("x"));

    render(<SentryLazy />);

    await waitFor(() => expect(filaDeErros).toHaveLength(0));
  });
});
