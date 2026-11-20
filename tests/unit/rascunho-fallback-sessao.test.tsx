/**
 * DECISÃO 5 (20/11/2026) — FALLBACK DE RASCUNHO: `sessionStorage` ANTES DO AVISO.
 *
 * `localStorage` recusa em modo privado, com cota cheia e por política. Antes,
 * a única resposta era avisar "não foi possível salvar" e a venda ficava só em
 * memória — perdida no primeiro reload. A decisão: tentar `sessionStorage`
 * como segunda chance, **antes** de avisar.
 *
 * O que precisa ser verdade, e é o que este arquivo mede:
 *  1. disco recusa → sessão grava → **sem** aviso de falha;
 *  2. o rascunho da sessão é RESTAURADO;
 *  3. disco e sessão recusam → aí sim o aviso aparece;
 *  4. `limpar` apaga dos dois (senão o rascunho "limpo" volta no reload);
 *  5. entre um rascunho velho no disco e um novo na sessão, vence o **mais
 *     novo** — estar no armazenamento "preferido" não pode ganhar de estar
 *     desatualizado.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutosaveDraft } from "@/app/app/pedidos/novo/_autosave";

const CHAVE = "pedido-rascunho:org-teste:user-teste";

/**
 * Faz `setItem` de UM armazenamento lançar, como cota cheia/modo privado.
 *
 * O mock vai no `Storage.prototype` e decide pelo `this`: o jsdom não deixa
 * interceptar `window.localStorage.setItem` no objeto (a função vem do
 * protótipo e `vi.spyOn` no objeto não pega o caminho usado pelo código).
 * É o mesmo mecanismo do teste B.15 de "rascunho não salvo".
 */
const originalSetItem = Storage.prototype.setItem;
function bloquear(armazenamento: Storage): void {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    chave: string,
    valor: string,
  ) {
    if (this === armazenamento) throw new DOMException("QuotaExceededError");
    return originalSetItem.call(this, chave, valor);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Roda o debounce de 2 s do autosave. */
async function passarDoDebounce() {
  // Tempo real: o debounce do hook é de 2 s e roda dentro de um efeito do
  // React — com timers falsos o agendamento do próprio React compete com o
  // avanço e o callback não corre. Dois segundos por teste é barato e mede o
  // que a tela faz.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 2200));
  });
}

describe("fallback de rascunho: sessionStorage como segunda chance", () => {
  it("disco recusa, sessão grava: salva e NÃO avisa falha", async () => {
    bloquear(window.localStorage);

    const { result } = renderHook(() =>
      useAutosaveDraft(CHAVE, { clienteNome: "Bill Higiene", linhas: [] }, true),
    );
    await passarDoDebounce();

    expect(result.current.falhaAoSalvar).toBe(false);
    expect(window.sessionStorage.getItem(CHAVE)).not.toBeNull();
  });

  it("o rascunho gravado na sessão é restaurado", async () => {
    // Estado de uma visita anterior: só a sessão tem o rascunho.
    window.sessionStorage.setItem(
      CHAVE,
      JSON.stringify({ salvoEm: Date.now(), dados: { clienteNome: "Sessão", linhas: [] } }),
    );

    const { result } = renderHook(() => useAutosaveDraft(CHAVE, {}, false));
    let dados: Record<string, unknown> | null = null;
    await act(async () => {
      dados = result.current.carregar();
    });

    expect(dados).toMatchObject({ clienteNome: "Sessão" });
    expect(result.current.restaurou).toBe(true);
  });

  it("disco E sessão recusam: aí sim o aviso aparece", async () => {
    // Um mock só: um segundo `spyOn` no mesmo protótipo substituiria o
    // primeiro, e o disco voltaria a gravar.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    const { result } = renderHook(() =>
      useAutosaveDraft(CHAVE, { clienteNome: "Ninguém", linhas: [] }, true),
    );
    await passarDoDebounce();

    expect(result.current.falhaAoSalvar).toBe(true);
  });

  it("limpar apaga dos dois armazenamentos", async () => {
    window.localStorage.setItem(CHAVE, JSON.stringify({ salvoEm: 1, dados: {} }));
    window.sessionStorage.setItem(CHAVE, JSON.stringify({ salvoEm: 2, dados: {} }));

    const { result } = renderHook(() => useAutosaveDraft(CHAVE, {}, false));
    await act(async () => {
      result.current.limpar();
    });

    expect(window.localStorage.getItem(CHAVE)).toBeNull();
    expect(window.sessionStorage.getItem(CHAVE)).toBeNull();
  });

  it("entre disco velho e sessão nova, restaura o MAIS NOVO", async () => {
    window.localStorage.setItem(
      CHAVE,
      JSON.stringify({ salvoEm: 1_000, dados: { clienteNome: "Velho", linhas: [] } }),
    );
    window.sessionStorage.setItem(
      CHAVE,
      JSON.stringify({ salvoEm: 2_000, dados: { clienteNome: "Novo", linhas: [] } }),
    );

    const { result } = renderHook(() => useAutosaveDraft(CHAVE, {}, false));
    let dados: Record<string, unknown> | null = null;
    await act(async () => {
      dados = result.current.carregar();
    });

    expect(dados).toMatchObject({ clienteNome: "Novo" });
  });
});
