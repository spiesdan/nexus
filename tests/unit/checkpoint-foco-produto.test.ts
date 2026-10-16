/**
 * O FOCO DE PRODUTO atravessa o turno (cenário C — pergunta de continuação).
 *
 * Turno 1 fecha com foco {vassoura, vassouras}; turno 2 ("qual vocês têm?")
 * abre com o assunto injetado. Sem isso, a continuação sem termo de produto
 * rebuscava texto solto e trocava a intenção.
 */
import { describe, expect, it } from "vitest";

import {
  CHECKPOINT_INSTRUCTION,
  checkpointContentSchema,
  parseCheckpointText,
  ritualBlocks,
} from "@/lib/agent-engine/agent/inbound-turn";

describe("o schema aceita e preserva o foco", () => {
  it("⭐ foco válido passa; ausente continua válido (turno sem produto)", () => {
    const com = checkpointContentSchema.safeParse({
      commitments: [],
      objections: [],
      next_action: null,
      rolling_summary: "cliente quer vassoura",
      foco_produto: { termo: "vassoura", categoria: "vassouras" },
    });
    expect(com.success).toBe(true);

    const sem = checkpointContentSchema.safeParse({
      commitments: [],
      objections: [],
      next_action: null,
      rolling_summary: "cliente pediu humano",
    });
    expect(sem.success).toBe(true);
    expect((sem as { data: { foco_produto?: unknown } }).data.foco_produto).toBeUndefined();
  });

  it("termo gigante é recusado — campo não vira despejo de texto", () => {
    const r = checkpointContentSchema.safeParse({
      commitments: [],
      objections: [],
      next_action: null,
      rolling_summary: "",
      foco_produto: { termo: "x".repeat(121), categoria: "vassouras" },
    });
    expect(r.success).toBe(false);
  });

  it("parseCheckpointText carrega o foco do JSON do fechamento", () => {
    const c = parseCheckpointText(
      '{"commitments": [], "objections": [], "next_action": null, "rolling_summary": "r", "foco_produto": {"termo": "vassoura", "categoria": "vassouras"}}',
    );
    expect(c.foco_produto).toEqual({ termo: "vassoura", categoria: "vassouras" });
  });
});

describe("a instrução de fechamento pede o foco", () => {
  it("⭐ o formato JSON inclui foco_produto", () => {
    expect(CHECKPOINT_INSTRUCTION).toContain('"foco_produto"');
  });
});

describe("a abertura injeta o foco — e só quando há", () => {
  const base = {
    commitments: [],
    objections: [],
    next_action: null,
    rolling_summary: "cliente quer vassoura",
  } as never;
  const blocos = (foco: { termo: string; categoria: string } | undefined) =>
    ritualBlocks(
      { ...(base as Record<string, unknown>), foco_produto: foco } as never,
      null,
      { contact: { name: "Cliente", email: null } } as never,
      "sem notas",
      false,
    ).join("\n");

  it("⭐ turno 2 recebe 'vassoura/vassouras' como assunto vigente", () => {
    const t = blocos({ termo: "vassoura", categoria: "vassouras" });
    expect(t).toContain("Foco de produto");
    expect(t).toContain("vassoura");
    expect(t).toMatch(/for continuação/i);
  });

  it("sem foco, nenhum bloco novo — ausência não custa token", () => {
    const t = blocos(undefined);
    expect(t).not.toContain("Foco de produto");
  });

  it("foco vazio (termo em branco) também não injeta", () => {
    const t = blocos({ termo: "   ", categoria: "x" });
    expect(t).not.toContain("Foco de produto");
  });
});
