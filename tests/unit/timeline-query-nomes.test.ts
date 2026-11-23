import { describe, expect, it, vi } from "vitest";

import { comNomeDoAtor } from "@/lib/leads/timeline-query";

const LOTES: string[][] = [];

function supabaseFake() {
  return {
    from(tabela: string) {
      if (tabela !== "ai_agents") throw new Error(`tabela inesperada: ${tabela}`);
      let ids: string[] = [];
      const q = {
        select: () => q,
        in: (_col: string, valores: string[]) => {
          ids = valores;
          LOTES.push(valores);
          return q;
        },
        then: (resolve: (v: unknown) => void) =>
          Promise.resolve(
            resolve({ data: ids.map((id) => ({ id, name: `Agente ${id}` })), error: null }),
          ),
      };
      return q;
    },
  };
}

describe("timeline — nomes dos atores", () => {
  it("350 agentes viram 4 consultas de 100 e todos os nomes chegam", async () => {
    LOTES.length = 0;
    const rows = Array.from({ length: 350 }, (_, i) => ({
      id: `linha-${i}`,
      actor_agent_id: `agente-${i}`,
      performed_by_user_id: null,
    }));
    const resultado = await comNomeDoAtor(supabaseFake() as never, rows as never);

    expect(LOTES.map((l) => l.length)).toEqual([100, 100, 100, 50]);
    expect(LOTES.flat()).toEqual(rows.map((r) => r.actor_agent_id));
    expect(resultado).toHaveLength(350);
    expect(resultado[0]!.actor_agent_name).toBe("Agente agente-0");
    expect(resultado[349]!.actor_agent_name).toBe("Agente agente-349");
  });

  it("lista curta continua numa consulta só", async () => {
    LOTES.length = 0;
    const rows = [{ id: "l1", actor_agent_id: "a1", performed_by_user_id: null }];
    await comNomeDoAtor(supabaseFake() as never, rows as never);
    expect(LOTES).toEqual([["a1"]]);
  });
});
