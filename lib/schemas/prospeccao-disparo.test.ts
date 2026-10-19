/**
 * O CONTRATO do disparo — o que a rota aceita e, principalmente, o que ela
 * NÃO aceita sem pedir.
 *
 * ═══ MUTAÇÃO PROVADA ═════════════════════════════════════════════════════
 *
 * `dry_run: z.boolean().default(true)` — trocar `true` por `false` reprova
 * `dry_run e true quando o chamador nao diz nada`. Sem esse teste, alguém
 * "simplifica" o schema para `.optional()` num dia de correria, toda chamada
 * passa a enviar de verdade, e nada quebra.
 */
import { describe, expect, it } from "vitest";

import { MENSAGENS_POR_DISPARO_MAX } from "@/lib/prospeccao/disparo";
import { disparoSchema } from "@/lib/schemas/prospeccao";

const BASE = {
  prospect_ids: ["11111111-1111-4111-8111-111111111111"],
  mensagem: "Ola! Somos do escritorio X.",
};

describe("disparoSchema", () => {
  it("dry_run e true quando o chamador nao diz nada", () => {
    const r = disparoSchema.parse(BASE);
    expect(r.dry_run).toBe(true);
  });

  it("so envia quando o chamador pede explicitamente", () => {
    expect(disparoSchema.parse({ ...BASE, dry_run: false }).dry_run).toBe(false);
    expect(disparoSchema.parse({ ...BASE, dry_run: true }).dry_run).toBe(true);
  });

  it("recusa mensagem vazia ou so com espaco", () => {
    // A lista de recusas do plano é sobre PESSOAS; uma mensagem em branco é um
    // erro de formulário e tem de ser 400 antes de qualquer consulta.
    expect(disparoSchema.safeParse({ ...BASE, mensagem: "" }).success).toBe(false);
    expect(disparoSchema.safeParse({ ...BASE, mensagem: "   \n " }).success).toBe(false);
  });

  it("exige pelo menos um prospect e recusa lista vazia", () => {
    expect(disparoSchema.safeParse({ ...BASE, prospect_ids: [] }).success).toBe(false);
  });

  it("recusa prospect_id que nao e uuid", () => {
    expect(disparoSchema.safeParse({ ...BASE, prospect_ids: ["abc"] }).success).toBe(false);
  });

  it("limita a lista a 2000 — acima disso e um pedido de outra coisa", () => {
    const muitos = Array.from({ length: 2001 }, (_, i) =>
      // uuid no formato, varying so o ultimo bloco
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    expect(disparoSchema.safeParse({ ...BASE, prospect_ids: muitos }).success).toBe(false);
    expect(
      disparoSchema.safeParse({ ...BASE, prospect_ids: muitos.slice(0, 2000) }).success,
    ).toBe(true);
  });

  it("limita a cota do dia a 500 pelo schema, nao so no planejador", () => {
    expect(disparoSchema.safeParse({ ...BASE, limite: 501 }).success).toBe(false);
    expect(disparoSchema.safeParse({ ...BASE, limite: 500 }).success).toBe(true);
  });

  it("limita o intervalo entre envios a 60s", () => {
    expect(disparoSchema.safeParse({ ...BASE, espaco_ms: 60001 }).success).toBe(false);
    expect(disparoSchema.safeParse({ ...BASE, espaco_ms: 0 }).success).toBe(true);
  });

  it("o limite e o espaco sao opcionais — a rota usa os padroes", () => {
    const r = disparoSchema.parse(BASE);
    expect(r.limite).toBeUndefined();
    expect(r.espaco_ms).toBeUndefined();
  });
});

/**
 * As VARIAÇÕES de texto (anti-ban) — o que a rota aceita a mais desde que
 * passou a alternar 1→2→3→1.
 */
describe("disparoSchema — as variacoes de mensagem", () => {
  const tres = ["Ola! Tudo bem?", "Oi! Podemos ajudar?", "Bom dia! Falamos com o responsavel?"];

  it("aceita variacoes sem a mensagem unica", () => {
    const r = disparoSchema.parse({ prospect_ids: BASE.prospect_ids, mensagens: tres });
    expect(r.mensagens).toEqual(tres);
  });

  it("aceita a mensagem unica de sempre — quem ja chamava a API nao muda nada", () => {
    expect(disparoSchema.parse(BASE).mensagem).toBe(BASE.mensagem);
  });

  it("sem texto nenhum e erro de formulario, nao um plano de 500 recusas", () => {
    expect(disparoSchema.safeParse({ prospect_ids: BASE.prospect_ids }).success).toBe(false);
  });

  it("lista de variacoes vazia tambem e ausencia de texto", () => {
    expect(
      disparoSchema.safeParse({ prospect_ids: BASE.prospect_ids, mensagens: [] }).success,
    ).toBe(false);
  });

  it("uma variacao em branco no meio reprova — sairia como bolha vazia no WhatsApp", () => {
    expect(
      disparoSchema.safeParse({ prospect_ids: BASE.prospect_ids, mensagens: [tres[0], "   "] }).success,
    ).toBe(false);
  });

  it("o teto de variacoes e o mesmo do planejador", () => {
    const muitas = Array.from({ length: MENSAGENS_POR_DISPARO_MAX + 1 }, (_, i) => `texto ${i}`);
    expect(
      disparoSchema.safeParse({ prospect_ids: BASE.prospect_ids, mensagens: muitas }).success,
    ).toBe(false);
    expect(
      disparoSchema.safeParse({
        prospect_ids: BASE.prospect_ids,
        mensagens: muitas.slice(0, MENSAGENS_POR_DISPARO_MAX),
      }).success,
    ).toBe(true);
  });
});
