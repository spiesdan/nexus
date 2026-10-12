/**
 * O PASSE DE IA EM TESTE — sem rede, sem chave, sem custo.
 *
 * O que se trava: a TRAVA (código fora da lista é descartado), o parse
 * tolerante, a concordância que libera o auto-apply, e cada modo de falha
 * virando null (nunca "aplica qualquer coisa").
 */
import { describe, expect, it } from "vitest";

import {
  concordam,
  CONFIANCA_IA_AUTO,
  promptDoNcm,
  sugerirNcmPorIa,
} from "@/lib/catalogo/sugerir-ncm-ia";

const CANDIDATOS = [
  { ncm: "28289011", descricao: "Águas sanitárias" },
  { ncm: "22071010", descricao: "Álcool etílico" },
];

function respostaGemini(conteudo: unknown) {
  return {
    status: 200,
    corpo: async () =>
      JSON.stringify({ candidates: [{ content: { parts: [{ text: conteudo }] } }] }),
  };
}

const CONFIG = { chave: "k", modelo: "gemini-2.0-flash" };

describe("a trava", () => {
  it("código fora da lista é descartado — invenção não entra", async () => {
    // O caso que justifica o arquivo inteiro: o modelo responde um NCM
    // válido e bonito que NÃO estava entre os candidatos. Aplicar seria
    // autuação com data marcada.
    const r = await sugerirNcmPorIa("AGUA SANITARIA", CANDIDATOS, CONFIG, {
      buscar: async () =>
        respostaGemini(
          JSON.stringify({ ncm: "99999999", confianca: 0.99, motivo: "parece certo" }),
        ),
    });
    expect(r).toBeNull();
  });

  it("ncm null passa — 'nenhum serve' é resposta legítima", async () => {
    const r = await sugerirNcmPorIa("COISA ESTRANHA", CANDIDATOS, CONFIG, {
      buscar: async () =>
        respostaGemini(JSON.stringify({ ncm: null, confianca: 1, motivo: "nenhum descreve" })),
    });
    expect(r?.ncm).toBeNull();
  });

  it("sem candidatos, nem chama", async () => {
    let chamou = false;
    const r = await sugerirNcmPorIa("X", [], CONFIG, {
      buscar: async () => {
        chamou = true;
        return respostaGemini("{}");
      },
    });
    expect(r).toBeNull();
    expect(chamou).toBe(false);
  });

  it("confiança é presa em 0-1", async () => {
    const r = await sugerirNcmPorIa("AGUA", CANDIDATOS, CONFIG, {
      buscar: async () =>
        respostaGemini(JSON.stringify({ ncm: "28289011", confianca: 5, motivo: "x" })),
    });
    expect(r?.confianca).toBe(1);
  });
});

describe("os modos de falha viram null", () => {
  it("HTTP do Gemini", async () => {
    const r = await sugerirNcmPorIa("AGUA", CANDIDATOS, CONFIG, {
      buscar: async () => ({ status: 429, corpo: async () => "limite" }),
    });
    expect(r).toBeNull();
  });

  it("timeout/rede", async () => {
    const r = await sugerirNcmPorIa(
      "AGUA",
      CANDIDATOS,
      CONFIG,
      {
        buscar: async () => {
          throw new Error("fetch failed");
        },
      },
      10,
    );
    expect(r).toBeNull();
  });

  it("resposta fora do formato", async () => {
    const r = await sugerirNcmPorIa("AGUA", CANDIDATOS, CONFIG, {
      buscar: async () => respostaGemini("não é json nem aqui {"),
    });
    expect(r).toBeNull();
  });
});

describe("concordam", () => {
  it("mesmo código + piso = auto-apply", () => {
    expect(
      concordam("28289011", { ncm: "28289011", confianca: CONFIANCA_IA_AUTO, motivo: "x" }),
    ).toBe(true);
  });

  it("código diferente não aplica, mesmo confiante", async () => {
    // A IA confiante E discordando é o caso mais informativo da revisão:
    // vale olhar, não vale aplicar.
    const r = await sugerirNcmPorIa("ALCOOL", CANDIDATOS, CONFIG, {
      buscar: async () =>
        respostaGemini(JSON.stringify({ ncm: "28289011", confianca: 0.95, motivo: "hmm" })),
    });
    expect(concordam("22071010", r)).toBe(false);
    expect(r?.ncm).toBe("28289011");
  });

  it("abaixo do piso não aplica", () => {
    expect(concordam("28289011", { ncm: "28289011", confianca: 0.5, motivo: "x" })).toBe(false);
  });

  it("nulo não aplica", () => {
    expect(concordam("28289011", null)).toBe(false);
  });
});

describe("o prompt", () => {
  it("lista os candidatos e proíbe inventar", () => {
    const p = promptDoNcm("AGUA SANITARIA", CANDIDATOS);
    expect(p).toContain("28289011");
    expect(p).toContain("AGUA SANITARIA");
    expect(p).toMatch(/nunca invente/i);
  });
});
