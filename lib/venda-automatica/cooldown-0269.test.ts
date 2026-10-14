/**
 * 0269 — MENSAGEM FIXA, LISTA FECHADA E COOLDOWN.
 *
 * ═══ O QUE CADA BLOCO TRAVA ═══════════════════════════════════════════════
 *
 * - `segundosDesdeUltimoEnvio`: o relógio do cooldown. NULL nunca bloqueia
 *   (a primeira mensagem sai no primeiro tick); inválido também não — um
 *   carimbo corrompido pararia a campanha para sempre, e "parar para sempre"
 *   é o pior modo de falhar num loop que ninguém olha.
 * - schema: as fronteiras que o banco também tem (CHECK 10..3600). Duas
 *   trincheiras para a mesma regra, e o teste garante que elas concordam.
 */
import { describe, expect, it } from "vitest";

import { campanhaVaCreateSchema } from "./schemas";
import { segundosDesdeUltimoEnvio } from "./motor";

function base(sobre: Record<string, unknown> = {}) {
  return {
    nome: "Radar Videira",
    cidade: "Videira",
    limite_diario: 30,
    janela_inicio: "09:00",
    janela_fim: "17:30",
    ...sobre,
  };
}

describe("segundosDesdeUltimoEnvio", () => {
  it("nunca enviou (NULL) = infinito — a primeira sai sem esperar", () => {
    expect(segundosDesdeUltimoEnvio(null, Date.parse("2026-10-14T12:00:00Z"))).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("carimbo corrompido = infinito — não para a campanha para sempre", () => {
    // Um `ultimo_envio_at` inválido com `NaN` faria `NaN < cooldown` dar
    // false... ou travar, dependendo de onde a comparação mora. Aqui o
    // inválido vira infinito e a fila anda — com o carimbo corrigido no
    // próximo envio.
    expect(segundosDesdeUltimoEnvio("não-é-data", Date.now())).toBe(Number.POSITIVE_INFINITY);
  });

  it("30 segundos atrás = 30 (menor que o cooldown de 60)", () => {
    const agora = Date.parse("2026-10-14T12:01:00Z");
    expect(segundosDesdeUltimoEnvio("2026-10-14T12:00:30Z", agora)).toBe(30);
  });

  it("2 minutos atrás = 120 (maior que o cooldown de 60)", () => {
    const agora = Date.parse("2026-10-14T12:02:00Z");
    expect(segundosDesdeUltimoEnvio("2026-10-14T12:00:00Z", agora)).toBe(120);
  });

  it("MUTAÇÃO: relógio travado em zero liberaria tudo de uma vez", () => {
    // Se a função devolvesse sempre 0, o gate `0 < cooldown` seria sempre
    // verdade e NADA sairia — ou, se o gate fosse invertido, tudo sairia em
    // rajada. O teste que importa é o de cima (30s → 30); este trava o zero.
    expect(segundosDesdeUltimoEnvio("2026-10-14T12:00:30Z", Date.parse("2026-10-14T12:01:00Z"))).not.toBe(
      0,
    );
  });

  it("carimbo no futuro = 0, nunca negativo", () => {
    // Relógio torto (ou update com `now()` de outro fuso) não pode virar
    // "faltam -40 segundos" e confundir o gate.
    const agora = Date.parse("2026-10-14T12:00:00Z");
    expect(segundosDesdeUltimoEnvio("2026-10-14T12:05:00Z", agora)).toBe(0);
  });
});

describe("campanhaVaCreateSchema — 0269", () => {
  it("padrões: cooldown 60, sem mensagem, sem lista", () => {
    const r = campanhaVaCreateSchema.safeParse(base());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cooldown_segundos).toBe(60);
      expect(r.data.mensagem_padrao).toBeNull();
      expect(r.data.prospect_ids).toEqual([]);
    }
  });

  it("mensagem de 1000 passa, de 1001 não", () => {
    expect(campanhaVaCreateSchema.safeParse(base({ mensagem_padrao: "x".repeat(1000) })).success).toBe(
      true,
    );
    expect(campanhaVaCreateSchema.safeParse(base({ mensagem_padrao: "x".repeat(1001) })).success).toBe(
      false,
    );
  });

  it("mensagem vazia é recusada — vazio não é 'sem mensagem', é erro de digitação", () => {
    // `""` com `.default(null)` NÃO vira null no zod: default só vale para
    // `undefined`. String vazia passa pelo trim e cai no min(1). É o
    // comportamento certo — e este teste é o que impede alguém de "consertar"
    // achando que é bug.
    expect(campanhaVaCreateSchema.safeParse(base({ mensagem_padrao: "" })).success).toBe(false);
    expect(campanhaVaCreateSchema.safeParse(base({ mensagem_padrao: "   " })).success).toBe(false);
  });

  it("cooldown: 10 e 3600 passam, 9 e 3601 não", () => {
    expect(campanhaVaCreateSchema.safeParse(base({ cooldown_segundos: 10 })).success).toBe(true);
    expect(campanhaVaCreateSchema.safeParse(base({ cooldown_segundos: 3600 })).success).toBe(true);
    expect(campanhaVaCreateSchema.safeParse(base({ cooldown_segundos: 9 })).success).toBe(false);
    expect(campanhaVaCreateSchema.safeParse(base({ cooldown_segundos: 3601 })).success).toBe(false);
  });

  it("MUTAÇÃO: piso 1 em vez de 10 liberaria rajada de 1s", () => {
    // Abaixo de 10 segundos não é cooldown, é rajada com outro nome — e
    // rajada contra o canal é ban. O CHECK do banco diz o mesmo; este teste
    // diz na primeira trincheira.
    expect(campanhaVaCreateSchema.safeParse(base({ cooldown_segundos: 1 })).success).toBe(false);
  });

  it("prospect_ids: uuid passa, lixo não, 501 não", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(campanhaVaCreateSchema.safeParse(base({ prospect_ids: [id] })).success).toBe(true);
    expect(campanhaVaCreateSchema.safeParse(base({ prospect_ids: ["nao-uuid"] })).success).toBe(
      false,
    );
    expect(
      campanhaVaCreateSchema.safeParse(base({ prospect_ids: Array(501).fill(id) })).success,
    ).toBe(false);
  });
});
