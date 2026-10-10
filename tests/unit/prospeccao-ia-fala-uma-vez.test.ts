/**
 * A IA DE PROSPECÇÃO MANDA A PRIMEIRA E DEPOIS CALA.
 *
 * ─── O defeito ───────────────────────────────────────────────────────────────
 *
 * O mecanismo de calar a IA já existia inteiro: `bot_silenced_until` pausa a
 * automação, e `motor.ts` já LÊ esse campo antes de mandar follow-up. O que não
 * existia era quem escreve o campo — e a fila de venda automática só CLASSIFICAVA
 * a resposta do prospect, sem calar nada.
 *
 * ─── O lado caro, que estes testes travam ─────────────────────────────────────
 *
 * Calar a IA numa conversa que ela atendia BEM. Um "boa tarde" não é interesse; um
 * "ok" não é interesse; um "não tenho interesse" é a resposta que mais calaria a
 * IA à toa se a regra fosse "respondeu = interesse".
 */
import { describe, expect, it } from "vitest";

import {
  jaEstaCalada,
  mostraInteresse,
  novoSilencio,
  SILENCIO_APOS_INTERESSE_MS,
} from "@/lib/prospeccao/silenciar-ia";

describe("o que conta como interesse", () => {
  const SIM = [
    "quero orçamento dos reagentes por favor",
    "estou interessado no serviço de vocês",
    "gostei muito dessa solução, manda mais",
    "pode ser, me manda a proposta",
    "perfeito, fechou então",
    "aceito o que vocês falaram ontem",
    "top, quero começar essa semana",
    "excelente, me manda o contrato",
    "sim, pode marcar com o comercial",
  ];

  for (const texto of SIM) {
    it(`"${texto.slice(0, 40)}" → interesse`, () => {
      expect(mostraInteresse(texto)).toBe(true);
    });
  }
});

describe("o que NÃO é interesse — o lado caro", () => {
  const NAO = [
    ["boa tarde", "cumprimento, e o piso de tamanho já recusa"],
    ["ok", "curto demais para ser interesse"],
    ["oi", "uma letra"],
    ["", "vazio"],
    [null, "nulo"],
    [undefined, "ausente"],
    ["boa tarde, tudo bem?", "não é interesse apesar do 'boa'"],
    ["claro", "sozinho não decide"],
    ["não tenho interesse nisso aqui", "recusa explícita"],
    ["sem interesse por enquanto", "recusa explícita"],
    ["não agora", "adiamento"],
    ["deixa pra depois", "adiamento"],
  ] as const;

  for (const [texto, porque] of NAO) {
    it(`${JSON.stringify(texto)} → não  (${porque})`, () => {
      expect(mostraInteresse(texto as string | null)).toBe(false);
    });
  }

  it("uma recusa LONGA passa do piso de tamanho e ainda assim não é interesse", () => {
    // O caso que pega uma regra que só olha tamanho: tem "não" e tem mais de 12
    // caracteres.
    expect(mostraInteresse("infelizmente não tenho interesse nesse momento, obrigado")).toBe(false);
  });

  it("acento não muda a decisão", () => {
    expect(mostraInteresse("quero orçamento dos reagentes")).toBe(true);
    expect(mostraInteresse("quero o orçamento dos reagentes")).toBe(true);
    expect(mostraInteresse("não tenho interesse")).toBe(false);
  });
});

describe("o silêncio já existente", () => {
  const agora = Date.parse("2026-10-09T12:00:00Z");

  it("'infinity' é silêncio permanente", () => {
    expect(jaEstaCalada("infinity", agora)).toBe(true);
  });

  it("uma data no futuro é silêncio", () => {
    expect(jaEstaCalada("2026-10-09T13:00:00Z", agora)).toBe(true);
  });

  it("uma data no passado já passou", () => {
    expect(jaEstaCalada("2026-10-09T11:00:00Z", agora)).toBe(false);
  });

  it("nulo nunca é silêncio", () => {
    expect(jaEstaCalada(null, agora)).toBe(false);
  });
});

describe("o novo silêncio não encurta o existente", () => {
  const agora = Date.parse("2026-10-09T12:00:00Z");

  it("sem silêncio anterior, cria um a partir de agora", () => {
    const s = novoSilencio(null, agora);
    expect(Date.parse(s)).toBe(agora + SILENCIO_APOS_INTERESSE_MS);
  });

  it("silêncio mais longo é preservado", () => {
    // Se alguém com mais contexto estendeu para 3 horas, uma resposta do prospect
    // não deve ENCURTAR isso — seria calar e liberar em menos tempo do que o
    // silêncio que alguém definiu.
    const existente = "2026-10-09T15:00:00Z";
    expect(novoSilencio(existente, agora)).toBe(existente);
  });

  it("silêncio mais curto é estendido", () => {
    const existente = "2026-10-09T12:30:00Z";
    expect(Date.parse(novoSilencio(existente, agora))).toBe(agora + SILENCIO_APOS_INTERESSE_MS);
  });

  it("'infinity' continua infinito", () => {
    expect(novoSilencio("infinity", agora)).toBe("infinity");
  });
});
