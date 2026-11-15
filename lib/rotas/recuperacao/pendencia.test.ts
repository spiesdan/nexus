import { describe, expect, it } from "vitest";

import { bloqueiaOtimizacao } from "./pendencia";

/**
 * A régua que o servidor aplica e a tela mostra tem de ser a MESMA.
 *
 * Medido em 15/11/2026: com a memória de entrada do endereço (0311), a carga
 * nasce com pino `ok`/`entrada` e `recuperacao_status = 'nao_tentada'`. O
 * servidor otimizava normalmente; o painel de recuperação dizia "a otimização
 * fica bloqueada". Aviso falso é pior que aviso ausente: ensina a ignorar o
 * próximo, que pode ser verdadeiro.
 */

const semPino = {
  recuperacao_status: "nao_tentada",
  latitude: null,
  longitude: null,
  geo_status: "pendente",
};

describe("bloqueiaOtimizacao", () => {
  it("bloqueia endereço nunca resolvido e sem pino", () => {
    expect(bloqueiaOtimizacao(semPino)).toBe(true);
    expect(bloqueiaOtimizacao({ ...semPino, recuperacao_status: "ambiguo" })).toBe(true);
    expect(bloqueiaOtimizacao({ ...semPino, recuperacao_status: null })).toBe(true);
  });

  it("NÃO bloqueia quando já existe pino válido — inclusive o da entrada marcada", () => {
    expect(
      bloqueiaOtimizacao({
        recuperacao_status: "nao_tentada",
        latitude: -26.1112,
        longitude: -49.8053,
        geo_status: "ok",
      }),
    ).toBe(false);
    expect(
      bloqueiaOtimizacao({
        recuperacao_status: "ambiguo",
        latitude: -26.1112,
        longitude: -49.8053,
        geo_status: "ok",
      }),
    ).toBe(false);
  });

  it("NÃO bloqueia endereço que o motor de recuperação já resolveu", () => {
    for (const status of ["encontrado", "recuperado", "nao_encontrado", "erro"]) {
      expect(bloqueiaOtimizacao({ ...semPino, recuperacao_status: status })).toBe(false);
    }
  });

  it("coordenada com status diferente de 'ok' não é pino utilizável", () => {
    expect(
      bloqueiaOtimizacao({
        recuperacao_status: "nao_tentada",
        latitude: -26.1112,
        longitude: -49.8053,
        geo_status: "erro",
      }),
    ).toBe(true);
  });
});
