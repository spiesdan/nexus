/**
 * O TTL DO CLAIM FISCAL (0318).
 *
 * O claim dura só a transmissão. Se o processo morrer no meio, ninguém libera
 * a coluna — por isso o UPDATE de retomada aceita claim mais velho que o teto.
 * O teste fixa o teto e o formato do limite; o comportamento atômico do UPDATE
 * é provado em Postgres (`tests/invariants/...`).
 */
import { describe, expect, it } from "vitest";

import { CLAIM_TTL_MIN, limiteDoClaim } from "@/lib/fiscal/claims";

const AGORA = new Date("2026-11-18T12:00:00.000Z");

describe("limiteDoClaim", () => {
  it("5 minutos antes de agora por padrão", () => {
    expect(CLAIM_TTL_MIN).toBe(5);
    expect(limiteDoClaim(AGORA)).toBe("2026-11-18T11:55:00.000Z");
  });

  it("aceita teto explícito (teste/ajuste operacional)", () => {
    expect(limiteDoClaim(AGORA, 15)).toBe("2026-11-18T11:45:00.000Z");
    expect(limiteDoClaim(AGORA, 0)).toBe("2026-11-18T12:00:00.000Z");
  });

  it("claim mais novo que o limite NÃO é retomável", () => {
    const claim = new Date("2026-11-18T11:57:00.000Z").toISOString();
    expect(claim > limiteDoClaim(AGORA)).toBe(true);
  });
});
