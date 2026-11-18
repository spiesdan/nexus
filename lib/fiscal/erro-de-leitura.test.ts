/**
 * ERRO DE LEITURA DA LISTA FISCAL NÃO VIRA LISTA VAZIA.
 *
 * As cinco listas ignoravam o `error` do PostgREST e mostravam "Nenhum…" — o
 * operador concluía que não havia dado, não que o dado não pôde ser lido. O
 * helper lança para a error boundary da rota (que tem retry) e registra a
 * organização e a mensagem no log.
 */
import { describe, expect, it, vi } from "vitest";

const loggerError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({ logger: { error: loggerError } }));

import { exigirLeituraDeLista } from "@/lib/fiscal/erro-de-leitura";

describe("exigirLeituraDeLista", () => {
  it("sem erro não faz nada", () => {
    expect(() => exigirLeituraDeLista(null, "eventos", "org-1")).not.toThrow();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it("com erro registra e lança, em vez de devolver lista vazia", () => {
    expect(() =>
      exigirLeituraDeLista({ message: "permission denied" }, "fornecedores", "org-1"),
    ).toThrow("fiscal_fornecedores_indisponivel");
    expect(loggerError).toHaveBeenCalledWith(
      "fiscal: falha ao ler fornecedores",
      expect.objectContaining({ organization_id: "org-1" }),
    );
  });
});
