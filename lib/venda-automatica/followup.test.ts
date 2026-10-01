/**
 * O escalonamento de follow-up (§14, D6): 24h → FU1 → 24h → FU2 → PARA.
 *
 * O ponto destes casos é a SEMÂNTICA do relógio: `atrasoProximoFollowup` conta
 * a partir da mensagem recém-enviada, então com o padrão {24,48} o FU2 sai 24h
 * depois do FU1 (≈48h da primeira) — e depois do último marco não há marco,
 * `null`, e o worker encerra. Seguir indefinidamente é o defeito que o teto
 * existe para impedir.
 */
import { describe, expect, it } from "vitest";

import {
  TEXTOS_PADRAO_DE_FOLLOWUP,
  atrasoProximoFollowup,
  temFollowupPendente,
  textoDeFollowup,
} from "./followup";

const HORA = 3_600_000;

describe("atrasoProximoFollowup", () => {
  it("agendamento inicial (count 0) = o primeiro marco, em ms", () => {
    expect(atrasoProximoFollowup([24, 48], 0)).toBe(24 * HORA);
  });
  it("após o FU1, o próximo marco é a DIFERENÇA entre marcos consecutivos", () => {
    expect(atrasoProximoFollowup([24, 48], 1)).toBe(24 * HORA);
  });
  it("depois do último marco: null — o worker encerra, não repete", () => {
    expect(atrasoProximoFollowup([24, 48], 2)).toBeNull();
    expect(atrasoProximoFollowup([24], 1)).toBeNull();
  });
  it("sem follow-up configurado: null desde o começo", () => {
    expect(atrasoProximoFollowup([], 0)).toBeNull();
  });
  it("marcos fora de ordem não agendam atraso negativo (piso em 0)", () => {
    expect(atrasoProximoFollowup([48, 24], 1)).toBe(0);
  });
  it("sequência de três marcos: cada passo usa o delta do par anterior", () => {
    expect(atrasoProximoFollowup([24, 48, 96], 1)).toBe(24 * HORA);
    expect(atrasoProximoFollowup([24, 48, 96], 2)).toBe(48 * HORA);
    expect(atrasoProximoFollowup([24, 48, 96], 3)).toBeNull();
  });
});

describe("temFollowupPendente", () => {
  it("count < horários = há mais um a enviar", () => {
    expect(temFollowupPendente([24, 48], 0)).toBe(true);
    expect(temFollowupPendente([24, 48], 1)).toBe(true);
  });
  it("count = horários: acabou (o teto é o comprimento da lista)", () => {
    expect(temFollowupPendente([24, 48], 2)).toBe(false);
    expect(temFollowupPendente([24, 48], 3)).toBe(false);
  });
  it("lista vazia nunca pendenta", () => {
    expect(temFollowupPendente([], 0)).toBe(false);
  });
});

describe("textoDeFollowup", () => {
  it("o configurado na campanha vence o padrão", () => {
    expect(textoDeFollowup(["Oi {empresa}, tudo bem?"], 0, "Drogaria Central")).toBe(
      "Oi Drogaria Central, tudo bem?",
    );
  });
  it("sem texto no índice, o padrão da lista cobre", () => {
    const texto = textoDeFollowup([], 0, "Posto Avenida");
    expect(texto).toBe(TEXTOS_PADRAO_DE_FOLLOWUP[0]!.replace("{empresa}", "Posto Avenida"));
    expect(texto).toContain("Posto Avenida");
  });
  it("índice além dos dois padrões: string vazia (nunca undefined para o envio)", () => {
    expect(textoDeFollowup([], 5, "X")).toBe("");
  });
  it("só o marcador {empresa} é trocado — o resto do texto segue igual", () => {
    const saida = textoDeFollowup(["{empresa} | {empresa}"], 0, "Loja 10");
    expect(saida).toBe("Loja 10 | Loja 10");
  });
});
