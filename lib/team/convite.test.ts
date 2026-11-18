import { describe, expect, it } from "vitest";

import { INVITE_TTL_MS } from "@/lib/auth/invite-ttl";
import { estadoDoConvite } from "./convite";

const AGORA = Date.parse("2026-11-18T12:00:00.000Z");

describe("estado do convite", () => {
  it("aceito vence qualquer data", () => {
    expect(
      estadoDoConvite({ accepted_at: "2026-01-01T00:00:00Z", invited_at: null }, AGORA),
    ).toBe("aceito");
  });

  it("pendente dentro de 24h, expirado depois — a mesma janela do token", () => {
    const dentro = new Date(AGORA - INVITE_TTL_MS + 1).toISOString();
    const fora = new Date(AGORA - INVITE_TTL_MS - 1).toISOString();
    expect(estadoDoConvite({ accepted_at: null, invited_at: dentro }, AGORA)).toBe("pendente");
    expect(estadoDoConvite({ accepted_at: null, invited_at: fora }, AGORA)).toBe("expirado");
  });

  it("sem data ou data ilegível fica pendente, não inventa expiração", () => {
    expect(estadoDoConvite({ accepted_at: null, invited_at: null }, AGORA)).toBe("pendente");
    expect(estadoDoConvite({ accepted_at: null, invited_at: "não é data" }, AGORA)).toBe(
      "pendente",
    );
  });
});
