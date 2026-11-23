/**
 * A FILA DE ORÇAMENTOS PARADOS NUNCA PODE SER LISTA MORTA.
 *
 * Três volumes medidos (0, 1 e 200) e a régua lida de settings. O que se trava
 * aqui: idade em dias corridos, próximo passo por linha (invariante 4) e
 * ordenação pelo mais parado primeiro — a tela do D consome exatamente isto.
 */
import { describe, expect, it } from "vitest";

import {
  DIAS_PADRAO,
  diasDaRégua,
  idadeEmDias,
  montarFila,
  proximoPasso,
  type OrcadorParado,
} from "./orcamentos-parados";

const AGORA = new Date("2026-11-20T12:00:00.000Z");

function linha(i: number, dias: number, humano = false): OrcadorParado {
  return {
    id: `pedido-${i}`,
    numero: 19000 + i,
    cliente: `Cliente ${i}`,
    valor_cents: 1000 * (i + 1),
    criado_em: new Date(AGORA.getTime() - dias * 86_400_000).toISOString(),
    criado_por_humano: humano,
  };
}

describe("régua configurável", () => {
  it("padrão é 60 dias e settings inválido não inventa número", () => {
    expect(DIAS_PADRAO).toBe(60);
    expect(diasDaRégua(null)).toBe(60);
    expect(diasDaRégua({ orcamentos_parados: { dias_limite: "abc" } })).toBe(60);
  });

  it("a org pode trocar e o valor é limitado a 1..365", () => {
    expect(diasDaRégua({ orcamentos_parados: { dias_limite: 90 } })).toBe(90);
    expect(diasDaRégua({ orcamentos_parados: { dias_limite: 0 } })).toBe(1);
    expect(diasDaRégua({ orcamentos_parados: { dias_limite: 9999 } })).toBe(365);
  });
});

describe("próximo passo", () => {
  it("rascunho do ERP nunca aberto pede conversão, não cobrança", () => {
    const passo = proximoPasso({ idadeDias: 45, diasLimite: 60, criadoPorHumano: false });
    expect(passo.acao).toBe("converter");
    expect(passo.texto).toContain("Mercos");
  });

  it("rascunho humano na metade do prazo pede contato", () => {
    expect(proximoPasso({ idadeDias: 35, diasLimite: 60, criadoPorHumano: true }).acao).toBe(
      "cobrar",
    );
  });

  it("passado o limite, encerrar/converter — não insistir", () => {
    expect(proximoPasso({ idadeDias: 60, diasLimite: 60, criadoPorHumano: false }).acao).toBe(
      "expirar",
    );
  });
});

describe("volumes da fila", () => {
  it("0 registros: fila vazia, sem erro", () => {
    expect(montarFila([], AGORA, 60)).toEqual([]);
  });

  it("1 registro: número, cliente, valor, idade e passo", () => {
    const [unico] = montarFila([linha(1, 12)], AGORA, 60);
    expect(unico).toMatchObject({
      numero: 19001,
      cliente: "Cliente 1",
      valor_cents: 2000,
      idade_dias: 12,
      dias_limite: 60,
    });
    expect(unico?.proximo_passo.texto).toContain("12 dias");
    expect(idadeEmDias("data-invalida", AGORA)).toBe(0);
  });

  it("200 registros: todos com passo e ordenados do mais parado para o recente", () => {
    const fila = montarFila(
      Array.from({ length: 200 }, (_, i) => linha(i, i * 3, i % 2 === 0)),
      AGORA,
      60,
    );
    expect(fila).toHaveLength(200);
    expect(fila.every((x) => x.proximo_passo.texto.length > 0)).toBe(true);
    for (let i = 1; i < fila.length; i += 1) {
      expect(fila[i - 1]!.idade_dias).toBeGreaterThanOrEqual(fila[i]!.idade_dias);
    }
  });
});
