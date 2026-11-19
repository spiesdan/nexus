/**
 * O MESMO ERRO NÃO SE ANUNCIA DUAS VEZES.
 *
 * Medido em 19/11/2026, na ficha da carga: a leitura falhou e a tela mostrou
 * o `NexusErrorState` — "Não foi possível carregar esta carga." + "Tentar
 * novamente" — **e** o `showApiError` disparou "Erro inesperado. Tente
 * novamente." no canto. Duas frases para o mesmo fato, e a de cima cobrindo o
 * conteúdo enquanto some sozinha em 4 s.
 *
 * A regra que este teste prende: **um erro se anuncia uma vez**. Com lugar na
 * tela (estado de erro, faixa `role="alert"`), é a tela que fala; o toast fica
 * para erro de AÇÃO, onde o clique falha e a tela continua igual.
 *
 * O teste tem duas metades, de propósito:
 *
 *  1. **comportamento** — `showApiError` toca o toast, `showApiErrorSemToast`
 *     não toca nada (o valor dele é o silêncio);
 *  2. **ligação** — o caminho de leitura da ficha da carga usa o silencioso.
 *     Sem essa metade, a regra existiria e ninguém a usaria, que é como o
 *     defeito nasceu.
 */
import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const { erro, aviso, info } = vi.hoisted(() => ({
  erro: vi.fn(),
  aviso: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { error: erro, warning: aviso, info },
}));

vi.mock("@/lib/i18n/IdiomaProvider", () => ({ idiomaAtual: () => "pt-BR" }));
vi.mock("@/lib/i18n/dicionario", () => ({ traduzir: (texto: string) => texto }));

import { showApiError, showApiErrorSemToast } from "@/components/feedback/ApiErrorToast";
import { ApiError } from "@/lib/api/types";
import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = process.cwd();

afterEach(() => {
  erro.mockClear();
  aviso.mockClear();
  info.mockClear();
});

describe("um erro, um anúncio", () => {
  it("showApiError anuncia (o caso de erro de AÇÃO)", () => {
    showApiError(new ApiError(500, "internal_error", undefined, "req-1", "Falhou"));
    expect(erro).toHaveBeenCalledTimes(1);
  });

  it("showApiErrorSemToast não anuncia nada (a tela já anuncia)", () => {
    showApiErrorSemToast(new ApiError(500, "internal_error", undefined, "req-1", "Falhou"));
    expect(erro).not.toHaveBeenCalled();
    expect(aviso).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it("silenciar não depende do tipo de erro (não vira 'vaza técnico')", () => {
    showApiErrorSemToast(new Error("Failed to fetch"));
    showApiErrorSemToast("qualquer coisa");
    expect(erro).not.toHaveBeenCalled();
  });
});

describe("a ficha da carga usa o silencioso no caminho de leitura", () => {
  const fonte = semComentarios(
    fs.readFileSync(path.join(RAIZ, "app", "app", "expedicao", "[id]", "_client.tsx"), "utf8"),
  );

  it("não chama o toast na mesma função que marca `setFalhou(true)`", () => {
    // Recorta cada bloco que marca a falha da leitura e exige que ele NÃO
    // chame o anunciante barulhento. `showApiError(` com parêntese: o
    // `showApiErrorSemToast(` não casa com este padrão.
    const marcas = fonte.split("setFalhou(true)").slice(1);
    expect(marcas.length).toBeGreaterThan(0);
    for (const trecho of marcas) {
      const seguinte = trecho.slice(0, 220);
      expect(seguinte).not.toMatch(/\bshowApiError\(/);
    }
  });

  it("importa o silencioso de verdade (não é só um nome no comentário)", () => {
    expect(fonte).toMatch(/showApiErrorSemToast/);
    expect(fonte).toMatch(/showApiErrorSemToast\(e\)/);
  });
});
