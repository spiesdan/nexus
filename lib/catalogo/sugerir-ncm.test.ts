/**
 * A SUGESTÃO DE NCM NÃO INVENTA CÓDIGO — ela escolhe entre o que a tabela
 * IBPT da org tem, e só sugere quando o casamento é forte o bastante.
 *
 * Três frases ficam cercadas aqui, cada uma por um defeito que ela evita:
 *
 *  1. **Número de modelo não filtra.** "Fone Bluetooth 5.3" tem de achar a
 *     posição dos fones: a busca do catálogo usaria "5.3" como identidade e
 *     mataria o candidato (nenhuma descrição de NCM traz "5.3"). Inverter a
 *     régua é a diferença entre sugerir e nunca sugerir nada.
 *  2. **Nome sem palavra não sugere.** "9V" sozinho, com a régua invertida,
 *     casaria com qualquer descrição que contenha "9" — falso positivo
 *     gravado no campo que vira NF-e.
 *  3. **Só passa acima do piso**, e o empate prefere o NCM sem exceção TIPI.
 */
import { describe, expect, it } from "vitest";

import { candidatosDeNcm, CONFIANCA_MINIMA, termosParaFiltrar, type LinhaIbptCandidata } from "./sugerir-ncm";

const LINHAS: LinhaIbptCandidata[] = [
  { codigo: "85183000", ex: "", descricao: "Fones de ouvido, com ou sem microfone" },
  { codigo: "85171300", ex: "", descricao: "Aparelhos telefônicos celulares" },
  { codigo: "94013100", ex: "", descricao: "Cadeiras de escritório" },
  { codigo: "94013900", ex: "50", descricao: "Cadeiras de escritório" },
  { codigo: "63079090", ex: "", descricao: "Outros artigos de vestuário confeccionados" },
  { codigo: "85061000", ex: "", descricao: null },
];

describe("candidatosDeNcm", () => {
  it("sugere a posição cuja descrição casa com o nome", () => {
    const r = candidatosDeNcm(LINHAS, "Fone de ouvido");
    expect(r[0]?.ncm).toBe("85183000");
    expect(r[0]?.confianca).toBeGreaterThanOrEqual(CONFIANCA_MINIMA);
  });

  it("número de modelo não mata o candidato (regra invertida do catálogo)", () => {
    const r = candidatosDeNcm(LINHAS, "Fone de ouvido Bluetooth 5.3");
    expect(r[0]?.ncm).toBe("85183000");
  });

  it("nome sem nenhuma palavra volta vazio — número sozinho é falso positivo", () => {
    expect(candidatosDeNcm(LINHAS, "9V")).toEqual([]);
    expect(candidatosDeNcm(LINHAS, "500ml 220")).toEqual([]);
  });

  it("fora do piso, não vira sugestão", () => {
    expect(candidatosDeNcm(LINHAS, "Mesa de jantar")).toEqual([]);
  });

  it("empate prefere o NCM sem exceção TIPI, e cada NCM aparece uma vez", () => {
    const r = candidatosDeNcm(LINHAS, "Cadeira de escritório", 5);
    expect(r.map((c) => c.ncm)).toEqual(["94013100", "94013900"]);
    expect(r[0]?.ex).toBe("");
  });

  it("linha sem descrição não é candidato", () => {
    expect(candidatosDeNcm(LINHAS, "Pilha alcalina").map((c) => c.ncm)).not.toContain("85061000");
  });

  it("respeita o limite pedindo mais do que há", () => {
    expect(candidatosDeNcm(LINHAS, "Cadeira de escritório", 1)).toHaveLength(1);
  });
});

describe("termosParaFiltrar", () => {
  it("leva as palavras mais longas primeiro e deixa números de fora", () => {
    expect(termosParaFiltrar("Fone de ouvido Bluetooth 5.3")).toEqual(["bluetooth", "ouvido", "fone"]);
  });

  it("teto de termos, para o ILIKE do PostgREST não virar uma árvore", () => {
    expect(termosParaFiltrar("a b c d e f g", 3)).toHaveLength(3);
  });
});
