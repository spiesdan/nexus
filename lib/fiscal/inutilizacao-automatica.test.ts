import { describe, expect, it } from "vitest";

import {
  agruparEmFaixas,
  anoDaNumeracao,
  lacunasDaNumeracao,
  MOTIVO_MAX,
  MOTIVO_MIN,
  motivoDoNumeroQueimado,
  podeInutilizar,
} from "./inutilizacao-automatica";

/**
 * O NÚMERO QUEIMADO VIRA INUTILIZAÇÃO.
 *
 * Medido nesta instalação em 05/11/2026: as notas 4580, 4581, 4583 e 4587 foram
 * rejeitadas pela SEFAZ e reemitidas com numeração nova. Os quatro números
 * ficaram como buraco na série 1 — sem nota e sem inutilização, que é obrigação
 * acessória. Estes testes travam a REGRA de quando inutilizar (e, mais
 * importante, quando NÃO inutilizar).
 */

describe("podeInutilizar", () => {
  it("recusa rejeições que significam número já usado no fisco", () => {
    // 204 = duplicidade de NF-e; 539 = duplicidade com chave. Inutilizar um
    // número que existe é declarar morto documento vivo.
    for (const cstat of ["100", "150", "204", "539"]) {
      expect(podeInutilizar({ status: "erro", sefaz_cstat: cstat })).toBe(false);
    }
  });

  it("recusa resposta ambígua — a SEFAZ pode ter recebido a nota", () => {
    for (const cstat of ["103", "104", "105", "108", "109"]) {
      expect(podeInutilizar({ status: "erro", sefaz_cstat: cstat })).toBe(false);
    }
    // Timeout não tem cStat nenhum.
    expect(podeInutilizar({ status: "erro", sefaz_cstat: null })).toBe(false);
  });

  it("recusa falha local — o número foi devolvido ao contador", () => {
    expect(podeInutilizar({ status: "erro", sefaz_cstat: "VALIDACAO" })).toBe(false);
    expect(podeInutilizar({ status: "erro", sefaz_cstat: "XML_INVALIDO" })).toBe(false);
    expect(podeInutilizar({ status: "erro", sefaz_cstat: "CERT_NAO_LIDO" })).toBe(false);
  });

  it("aceita as rejeições reais que queimaram números aqui", () => {
    // 905 (grupo Fatura), 232 (IE do destinatário), 696 (não contribuinte),
    // 778 (NCM) — todas são recusa definitiva da SEFAZ, sem nota criada.
    for (const cstat of ["905", "232", "696", "778"]) {
      expect(podeInutilizar({ status: "erro", sefaz_cstat: cstat })).toBe(true);
    }
  });

  it("autorizada e denegada nunca são inutilizadas", () => {
    expect(podeInutilizar({ status: "autorizada", sefaz_cstat: "100" })).toBe(false);
    // Denegada tem protocolo: o número foi usado.
    expect(podeInutilizar({ status: "denegada", sefaz_cstat: "204" })).toBe(false);
    expect(podeInutilizar(null)).toBe(false);
  });
});

describe("motivoDoNumeroQueimado", () => {
  it("cabe no limite da SEFAZ e conta a história inteira", () => {
    const motivo = motivoDoNumeroQueimado({
      numero: 4587,
      serie: "1",
      cstat: "905",
      notaNumero: 4587,
    });
    expect(motivo.length).toBeGreaterThanOrEqual(MOTIVO_MIN);
    expect(motivo.length).toBeLessThanOrEqual(MOTIVO_MAX);
    expect(motivo).toContain("4587");
    expect(motivo).toContain("905");
    expect(motivo).toContain("série 1");
  });

  it("nota sem número (rejeição antes da reserva) não inventa rastro", () => {
    const motivo = motivoDoNumeroQueimado({
      numero: 10,
      serie: "2",
      cstat: "232",
      notaNumero: null,
    });
    expect(motivo).toContain("série 2");
    expect(motivo).not.toContain("nota null");
  });

  it("trunca em 255 sem sair do mínimo", () => {
    const motivo = motivoDoNumeroQueimado({
      numero: 1,
      serie: "1".repeat(120),
      cstat: "905",
      notaNumero: 999999999,
    });
    expect(motivo.length).toBeLessThanOrEqual(MOTIVO_MAX);
    expect(motivo.length).toBeGreaterThanOrEqual(MOTIVO_MIN);
  });
});

describe("agruparEmFaixas", () => {
  it("junta vizinhos numa faixa só e ordena", () => {
    expect(agruparEmFaixas([4583, 4580, 4581])).toEqual([
      { inicial: 4580, final: 4581 },
      { inicial: 4583, final: 4583 },
    ]);
  });

  it("não repete número e aceita lista vazia", () => {
    expect(agruparEmFaixas([7, 7, 7])).toEqual([{ inicial: 7, final: 7 }]);
    expect(agruparEmFaixas([])).toEqual([]);
  });
});

describe("lacunasDaNumeracao", () => {
  const notas = [
    { serie: "1", numero: 4579 },
    { serie: "1", numero: 4582 },
    { serie: "1", numero: 4584 },
    { serie: "1", numero: 4588 },
    { serie: "2", numero: 1 },
    { serie: "2", numero: 2 },
  ];

  it("devolve só o que não tem nota — inclusive as canceladas, que usaram o número", () => {
    const lacunas = lacunasDaNumeracao(notas, []);
    expect(lacunas).toEqual([{ serie: "1", numeros: [4580, 4581, 4583, 4585, 4586, 4587] }]);
  });

  it("não devolve o que já está coberto por inutilização", () => {
    const lacunas = lacunasDaNumeracao(notas, [
      { serie: "1", inicial: 4580, final: 4581 },
      { serie: "1", inicial: 4587, final: 4587 },
    ]);
    expect(lacunas).toEqual([{ serie: "1", numeros: [4583, 4585, 4586] }]);
  });

  it("série sem buraco e base vazia não produzem lacuna", () => {
    expect(lacunasDaNumeracao([{ serie: "9", numero: 1 }, { serie: "9", numero: 2 }], [])).toEqual([]);
    expect(lacunasDaNumeracao([], [])).toEqual([]);
  });
});

describe("anoDaNumeracao", () => {
  it("usa o fuso do Brasil — 31/12 às 22h ainda é o ano velho", () => {
    // 2027-01-01T01:00Z = 31/12/2026 22:00 em São Paulo.
    expect(anoDaNumeracao("2027-01-01T01:00:00Z")).toBe("26");
    expect(anoDaNumeracao("2026-11-05T14:00:00Z")).toBe("26");
  });

  it("data ausente ou inválida devolve null (o sidecar completa com o ano dele)", () => {
    expect(anoDaNumeracao(null)).toBeNull();
    expect(anoDaNumeracao("")).toBeNull();
    expect(anoDaNumeracao("não é data")).toBeNull();
  });
});
