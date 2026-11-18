/**
 * A TELA NUNCA MOSTRA "Failed to fetch".
 *
 * O erro de rede chegava cru ao estado embutido da tabela em estoque, compras e
 * recebimento: `e.message` de um `TypeError` do `fetch` é texto do navegador, em
 * inglês. E erro de API pode vir técnico. O toast já passava por
 * `showApiError`; o estado da tabela, não.
 *
 * Este teste fixa as quatro decisões: rede vira frase em português, `ApiError`
 * mantém o texto do servidor, validação do produto mantém a própria mensagem, e
 * o padrão da tela cobre o resto.
 */
import { describe, expect, it, afterEach } from "vitest";

import { ApiError } from "@/lib/api/types";
import { ehErroDeRede, mensagemDeErro, SEM_CONEXAO } from "@/lib/ui/erros";

const onLineOriginal = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");

function fingirRede(online: boolean) {
  Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => online });
}

afterEach(() => {
  if (onLineOriginal) Object.defineProperty(Navigator.prototype, "onLine", onLineOriginal);
});

describe("erro de rede vira frase de gente", () => {
  it.each([
    ["Failed to fetch", new TypeError("Failed to fetch")],
    ["Load failed (Safari)", new TypeError("Load failed")],
    ["NetworkError", new TypeError("NetworkError when attempting to fetch resource.")],
  ])("%s → aviso de conexão", (_rotulo, erro) => {
    expect(ehErroDeRede(erro)).toBe(true);
    expect(mensagemDeErro(erro, "Erro ao carregar o estoque.")).toBe(SEM_CONEXAO);
  });

  it("navegador offline converte QUALQUER erro no aviso de conexão", () => {
    fingirRede(false);
    // Mesmo um ApiError de servidor: sem rede, o problema é a rede.
    expect(mensagemDeErro(new ApiError(500, "internal_error", undefined, "req-1", "falha do servidor"), "x")).toBe(SEM_CONEXAO);
  });
});

describe("erro do produto mantém o texto do produto", () => {
  it("ApiError usa a mensagem do servidor", () => {
    fingirRede(true);
    const erro = new ApiError(
      422,
      "validation_error",
      undefined,
      undefined,
      "Quantidade inválida.",
    );
    expect(ehErroDeRede(erro)).toBe(false);
    expect(mensagemDeErro(erro, "padrão")).toBe("Quantidade inválida.");
  });

  it("validação local (throw new Error) não é reescrita", () => {
    fingirRede(true);
    expect(mensagemDeErro(new Error("Adicione ao menos um item."), "padrão")).toBe(
      "Adicione ao menos um item.",
    );
  });

  it("sem mensagem utilizável, cai no padrão da tela", () => {
    fingirRede(true);
    expect(mensagemDeErro(new Error("   "), "Erro ao carregar o estoque.")).toBe(
      "Erro ao carregar o estoque.",
    );
    expect(mensagemDeErro(undefined, "Erro ao carregar compras.")).toBe(
      "Erro ao carregar compras.",
    );
    expect(mensagemDeErro("string qualquer", "Erro ao carregar compras.")).toBe(
      "Erro ao carregar compras.",
    );
  });
});
