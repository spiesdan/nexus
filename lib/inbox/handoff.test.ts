import { describe, expect, it } from "vitest";

import { painelDeHandoff } from "./handoff";

describe("painel de handoff do inbox", () => {
  it("conversa sem handoff não tem painel", () => {
    expect(painelDeHandoff({ last_handoff_at: null, last_handoff_reason: null })).toBeNull();
  });

  it("mostra quando, motivo e resumo da mesma função do motor", () => {
    const p = painelDeHandoff({
      last_handoff_at: "2026-11-23T10:00:00Z",
      last_handoff_reason: "force_human",
    });
    expect(p?.quando).toBe("2026-11-23T10:00:00Z");
    expect(p?.motivo).toBe("force_human");
    expect(p?.resumo.length).toBeGreaterThan(10);
  });

  it("motivo em branco não vira rótulo vazio", () => {
    expect(
      painelDeHandoff({ last_handoff_at: "2026-11-23T10:00:00Z", last_handoff_reason: "   " })
        ?.motivo,
    ).toBeNull();
  });
});
