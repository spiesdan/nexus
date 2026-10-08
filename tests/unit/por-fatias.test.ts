/**
 * NUNCA 500 POR URL GRANDE.
 *
 * O defeito apareceu duas vezes em rotas que ninguém ligou uma à outra, sempre
 * com a mesma assinatura: uma lista de ids ido direto para `.in(...)`, que o
 * PostgREST joga na query string.
 *
 * Medido na VPS: 500 UUIDs = 18.499 bytes, e a resposta é `414 URI too long`.
 * As duas rotas transformavam isso em **500 na tela**, com o banco sãozinho —
 * a aba Radar mostrava "Failed to load resource: 500" sem nenhuma pista.
 *
 * Este teste trava a REGRA, não a rota: se amanhã alguém escrever `.in()` com
 * 500 ids direto, a fatia some daqui e com ela a garantia.
 */
import { describe, expect, it, vi } from "vitest";

import { FATIA_DE_IDS, porFatias } from "@/lib/db/por-fatias";

describe("porFatias", () => {
  const ids = (n: number) =>
    Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

  it("500 ids saem em fatias de 100 — nenhuma consulta estoura o PostgREST", async () => {
    const tamanhos: number[] = [];
    const { linhas, falhas } = await porFatias(ids(500), async (fatia) => {
      tamanhos.push(fatia.length);
      return { linhas: fatia.map((id) => ({ id })) };
    });

    expect(linhas).toHaveLength(500);
    expect(falhas).toBe(0);
    expect(tamanhos).toEqual([100, 100, 100, 100, 100]);
    for (const t of tamanhos) {
      expect(t).toBeLessThanOrEqual(FATIA_DE_IDS);
      // ~3,8 KB é o pior caso de uma fatia; o PostgREST recusou com 19 KB.
      expect(t * 37).toBeLessThan(4000);
    }
  });

  it("nenhum id some nem duplica entre as fatias", async () => {
    const { linhas } = await porFatias(ids(6131), async (fatia) => ({ linhas: fatia }));
    expect(linhas).toHaveLength(6131);
    expect(new Set(linhas).size).toBe(6131);
  });

  it("uma fatia que falha não derruba as outras", async () => {
    const { linhas, falhas } = await porFatias(ids(500), async (fatia) => {
      // A 3ª fatia é a que "falha".
      if (fatia[0]!.endsWith("000000000000")) return { linhas: [], erro: new Error("414") };
      return { linhas: fatia };
    });

    expect(linhas).toHaveLength(400);
    expect(falhas).toBe(1);
  });

  it("lote pequeno não vira rajada: uma consulta só", async () => {
    const chamadas = vi.fn(async (fatia: string[]) => ({ linhas: fatia }));
    await porFatias(ids(9), chamadas);
    expect(chamadas).toHaveBeenCalledTimes(1);
  });

  it("lote vazio não chama nada", async () => {
    const chamadas = vi.fn(async (fatia: string[]) => ({ linhas: fatia }));
    const { linhas, falhas } = await porFatias([], chamadas);
    expect(chamadas).not.toHaveBeenCalled();
    expect(linhas).toEqual([]);
    expect(falhas).toBe(0);
  });
});
