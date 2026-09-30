import { beforeEach, describe, expect, it } from "vitest";

import { atualizarQueryDaUrl } from "./shallow";

/**
 * O helper é o caminho de todo clique de aba que a auditoria de performance
 * (2026-09-30) tirou do `router.replace`: a prova aqui é que a URL muda como
 * muda-aria antes, e que o estado do router no histórico NÃO é zerado.
 */
describe("atualizarQueryDaUrl", () => {
  beforeEach(() => {
    window.history.replaceState({ __NA: ["__DEFAULT__"] }, "", "/app/estoque?aba=saldos&x=1");
  });

  it("seta o parâmetro sem perder os outros nem o caminho", () => {
    atualizarQueryDaUrl((q) => q.set("aba", "movimentos"));
    expect(window.location.pathname).toBe("/app/estoque");
    expect(window.location.search).toBe("?aba=movimentos&x=1");
  });

  it("apaga o parâmetro (o default da aba não fica na URL)", () => {
    atualizarQueryDaUrl((q) => q.delete("aba"));
    expect(window.location.search).toBe("?x=1");
  });

  it("preserva window.history.state — é o estado do router do Next", () => {
    const estadoAntes = window.history.state;
    atualizarQueryDaUrl((q) => q.set("aba", "sugestoes"));
    expect(window.history.state).toEqual(estadoAntes);
    expect(window.history.state).toHaveProperty("__NA");
  });

  it("quando sobra query vazia, a URL vira só o caminho", () => {
    window.history.replaceState(window.history.state, "", "/app/connections");
    atualizarQueryDaUrl((q) => q.delete("nada"));
    expect(window.location.pathname).toBe("/app/connections");
    expect(window.location.search).toBe("");
    expect(window.location.href.endsWith("/app/connections")).toBe(true);
  });
});
