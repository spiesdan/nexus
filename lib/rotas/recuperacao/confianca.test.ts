import { describe, expect, it } from "vitest";

import {
  avaliarConfianca,
  limiares,
  type ContextoConfianca,
} from "./confianca";

/**
 * SISTEMA DE CONFIANÇA — testes puros, sem rede.
 *
 * Os vetos duros (UF/CEP/município divergente) vencem qualquer score alto:
 * é preferível pedir confirmação humana do que enviar para o endereço errado.
 */

describe("avaliarConfianca", () => {
  const baseCtx: ContextoConfianca = {
    score: 0.95,
    componentes: { rua: 1, municipio: 1, uf: 1, cep: 1, bairro: 1, numero: 1 },
    cepInformado: "89460-000",
    cepCandidato: "89460-000",
    ufInformada: "SC",
    ufCandidata: "SC",
    municipioInformado: "Canoinhas",
    municipioCandidato: "Canoinhas",
    distanciaEntreProvedoresM: null,
    jaRecuperado: false,
  };

  it("tudo consistente e score alto → alta confiança, permite automático", () => {
    const r = avaliarConfianca(baseCtx);
    expect(r.nivel).toBe("alta");
    expect(r.permiteCorrecaoAutomatica).toBe(true);
    expect(r.vetos).toEqual([]);
  });

  it("veto de UF divergente → intermediária, nunca automático", () => {
    const r = avaliarConfianca({ ...baseCtx, ufCandidata: "PR", score: 0.99 });
    expect(r.nivel).toBe("intermediaria");
    expect(r.permiteCorrecaoAutomatica).toBe(false);
    expect(r.vetos).toContain("uf_divergente");
  });

  it("veto de CEP divergente → intermediária, nunca automático", () => {
    const r = avaliarConfianca({ ...baseCtx, cepCandidato: "89010-000", score: 0.99 });
    expect(r.permiteCorrecaoAutomatica).toBe(false);
    expect(r.vetos).toContain("cep_divergente");
  });

  it("veto de município divergente sem CEP → intermediária", () => {
    const r = avaliarConfianca({
      ...baseCtx,
      municipioCandidato: "Joinville",
      cepInformado: null,
      cepCandidato: null,
      score: 0.99,
    });
    expect(r.permiteCorrecaoAutomatica).toBe(false);
    expect(r.vetos).toContain("municipio_divergente_sem_cep");
  });

  it("município divergente MAS CEP igual → não veta (CEP confirma)", () => {
    const r = avaliarConfianca({
      ...baseCtx,
      municipioCandidato: "Outra Cidade",
      cepInformado: "89460-000",
      cepCandidato: "89460-000",
    });
    expect(r.permiteCorrecaoAutomatica).toBe(true);
  });

  it("veto de provedores divergentes (distância > 5km) → intermediária", () => {
    const r = avaliarConfianca({ ...baseCtx, distanciaEntreProvedoresM: 10_000 });
    expect(r.permiteCorrecaoAutomatica).toBe(false);
    expect(r.vetos).toContain("provedores_divergentes");
  });

  it("destino já recuperado → intermediária, não substitui silenciosamente", () => {
    const r = avaliarConfianca({ ...baseCtx, jaRecuperado: true });
    expect(r.permiteCorrecaoAutomatica).toBe(false);
    expect(r.vetos).toContain("ja_recuperado");
  });

  it("score intermediário → intermediária, exige confirmação", () => {
    const r = avaliarConfianca({ ...baseCtx, score: 0.7 });
    expect(r.nivel).toBe("intermediaria");
    expect(r.permiteCorrecaoAutomatica).toBe(false);
  });

  it("score baixo → baixa, não altera nada", () => {
    const r = avaliarConfianca({ ...baseCtx, score: 0.3 });
    expect(r.nivel).toBe("baixa");
    expect(r.permiteCorrecaoAutomatica).toBe(false);
  });
});

describe("limiares", () => {
  it("padrões esperados", () => {
    const l = limiares();
    expect(l.alta).toBe(0.85);
    expect(l.intermediaria).toBe(0.60);
  });
});
