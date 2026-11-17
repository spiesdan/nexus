import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TokenCounter } from "@/lib/ui/TokenCounter";

/**
 * `gpt-tokenizer` mede ~1 MB gzip e estava no bundle inicial de toda tela com
 * o editor de agente. O contador é acessório: o pacote passa a ser importado
 * sob demanda, 200 ms depois da última tecla.
 *
 * O que se prova aqui:
 *   1. o módulo NÃO importa o tokenizador estaticamente (senão volta ao bundle);
 *   2. a tela abre com o placeholder, sem bloquear no pacote;
 *   3. depois do debounce, o número aparece.
 */
describe("TokenCounter — tokenizador sob demanda", () => {
  it("não há import estático de gpt-tokenizer no componente", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fonte = fs.readFileSync(
      path.resolve(__dirname, "../../lib/ui/TokenCounter.tsx"),
      "utf8",
    );
    expect(fonte).not.toMatch(/^import .*gpt-tokenizer/m);
    expect(fonte).toContain('import("gpt-tokenizer")');
  });

  it("abre com placeholder e só conta depois do debounce", async () => {
    render(<TokenCounter text="olá mundo" />);
    expect(screen.getByText(/— tokens/)).toBeTruthy();

    // Timers REAIS: o debounce é de 200 ms e o import dinâmico precisa resolver.
    await waitFor(() => expect(screen.getByText(/~\d+ tokens/)).toBeTruthy(), {
      timeout: 5_000,
    });
  });
});
