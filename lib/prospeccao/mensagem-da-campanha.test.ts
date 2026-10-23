import { describe, expect, it } from "vitest";

import { interpolarValoresDoTemplate } from "./mensagem-da-campanha";

describe("interpolarValoresDoTemplate", () => {
  it("troca os quatro tokens do prospect, inclusive com espaços dentro das chaves", () => {
    const valores = {
      "1": "Oi {{ nome }}, você é de {{cidade}}?",
      "2": "Falamos com {{primeiro_nome}} sobre {{categoria}}.",
    };

    expect(
      interpolarValoresDoTemplate(valores, {
        nome: "Maria Silva",
        cidade: "Belo Horizonte",
        categoria: "Auto repair shop",
      }),
    ).toEqual({
      "1": "Oi Maria Silva, você é de Belo Horizonte?",
      "2": "Falamos com Maria sobre Auto repair shop.",
    });
  });

  it("preserva a CHAVE composta do slot — header e corpo podem ter o mesmo `1`", () => {
    const valores = { "1": "corpo {{nome}}", "header:1": "cabeçalho {{nome}}" };

    expect(
      interpolarValoresDoTemplate(valores, { nome: "Ana", cidade: null, categoria: null }),
    ).toEqual({ "1": "corpo Ana", "header:1": "cabeçalho Ana" });
  });

  it("token conhecido SEM dado vira vazio — o envio recusa antes de a Meta cobrar", () => {
    // Fallback inventado ("sua região") seria promessa que ninguém escreveu.
    // Vazio é o sinal honesto: `missingSlots` barra o POST.
    expect(
      interpolarValoresDoTemplate(
        { "1": "Olá {{nome}} de {{cidade}}" },
        { nome: null, cidade: "  " },
      ),
    ).toEqual({ "1": "Olá  de " });
  });

  it("token DESCONHECIDO fica literal — não é desta camada inventar semântica", () => {
    expect(
      interpolarValoresDoTemplate(
        { "1": "{{nome}} / {{telefone}} / {{Nome}}" },
        { nome: "Bia" },
      ),
    ).toEqual({ "1": "Bia / {{telefone}} / Bia" });
  });

  it("não muta o mapa original e aceita valor nulo sem estourar", () => {
    const original: Record<string, string> = { "1": "{{nome}}" };
    interpolarValoresDoTemplate(original, { nome: "Lia" });
    expect(original).toEqual({ "1": "{{nome}}" });

    expect(
      interpolarValoresDoTemplate(
        { "1": null as unknown as string },
        { nome: "Lia" },
      ),
    ).toEqual({ "1": "" });
  });
});
