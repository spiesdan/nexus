import { describe, expect, it, vi } from "vitest";

import { marcarDegradada } from "./motor";

/**
 * O motor marca a busca como degradada quando o Maps não foi o executor.
 * O que este teste prende: o UPDATE leva `degradada`, `degradacao_motivo`
 * legível, status paused e o mesmo texto em `ultimo_erro`. Sem isso a rota
 * devolve o boolean sem a tela saber por quê.
 */
function adminFalso() {
  const updates: unknown[] = [];
  const admin = {
    from: () => ({
      update: (v: unknown) => {
        updates.push(v);
        return { eq: async () => ({ error: null }) };
      },
    }),
  };
  return { admin, updates };
}

describe("marcarDegradada", () => {
  it("grava motivo, paused e ultimo_erro no mesmo update", async () => {
    const { admin, updates } = adminFalso();
    await marcarDegradada(
      admin as never,
      { id: "s1" },
      "sidecar_em_modo_navegador: o job não confirmou fast_mode=true",
    );

    expect(updates[0]).toEqual({
      degradada: true,
      degradacao_motivo: "sidecar_em_modo_navegador: o job não confirmou fast_mode=true",
      status: "paused",
      ultimo_erro: "sidecar_em_modo_navegador: o job não confirmou fast_mode=true",
    });
    expect((updates[0] as { degradacao_motivo: string }).degradacao_motivo).not.toBe("");
  });

  it("não grava motivo vazio", async () => {
    const { admin, updates } = adminFalso();
    await marcarDegradada(admin as never, { id: "s1" }, "sidecar_indisponivel");
    expect((updates[0] as { degradacao_motivo: string }).degradacao_motivo).toContain(
      "sidecar",
    );
  });
});
