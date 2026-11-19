import { afterEach, describe, expect, it, vi } from "vitest";

import { fail } from "./wrappers";

/**
 * 5xx devolvido por `fail()` não é exceção: sem o log estruturado ele não
 * aparece no Sentry (`onRequestError`) nem em contagem nenhuma. O doc 42 usa
 * esta linha como fonte do SLI de disponibilidade.
 */
describe("fail() — 5xx é observável", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("500 grava uma linha api.5xx com code/status/requestId e sem a mensagem", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = fail("internal_error", "Não foi possível abrir a lista.", 500, {
      requestId: "req-1",
    });

    expect(res.status).toBe(500);
    expect(erro).toHaveBeenCalledTimes(1);
    const linha = JSON.parse(String(erro.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(linha).toMatchObject({
      level: "error",
      msg: "api.5xx",
      code: "internal_error",
      status: 500,
      requestId: "req-1",
    });
    // A mensagem é escrita pela rota e pode conter contexto de negócio; o log
    // operacional não precisa dela para contar 5xx.
    expect(JSON.stringify(linha)).not.toContain("Não foi possível abrir a lista.");
  });

  it("4xx não vira api.5xx", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = fail("validation_error", "Campo inválido.", 422);
    expect(res.status).toBe(422);
    expect(erro).not.toHaveBeenCalled();
  });
});
