import { describe, expect, it, vi } from "vitest";

import { FATIA_DE_IDS, porFatias } from "./por-fatias";

/**
 * O helper que impede `in.(a,b,c…)` de estourar a URL do PostgREST.
 *
 * A regra que estes testes fixam: **lista vazia não consulta**, **lista pequena
 * continua uma consulta só** e **lista grande vira fatias de 100, na ordem**.
 * O último caso é o que faltava quando o risk-watcher passou a falhar a cada
 * 15 minutos com 414 — o código não tinha onde provar que a lista era fatiada.
 */
describe("porFatias", () => {
  it("lista vazia não chama a consulta", async () => {
    const aplicar = vi.fn();
    const r = await porFatias([], aplicar);

    expect(aplicar).not.toHaveBeenCalled();
    expect(r).toEqual({ linhas: [], falhas: 0 });
  });

  it("lista menor que 100 continua numa consulta só", async () => {
    const aplicar = vi.fn(async (fatia: string[]) => ({
      linhas: fatia.map((id) => ({ id })),
    }));

    const r = await porFatias(["a", "b", "c", "d", "e"], aplicar);

    expect(aplicar).toHaveBeenCalledTimes(1);
    expect(aplicar).toHaveBeenCalledWith(["a", "b", "c", "d", "e"]);
    expect(r.linhas.map((l) => l.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(r.falhas).toBe(0);
  });

  it("350 ids viram 4 fatias de 100 e a ordem é preservada", async () => {
    const ids = Array.from({ length: 350 }, (_, i) => `id-${i}`);
    const vistas: string[][] = [];
    const aplicar = vi.fn(async (fatia: string[]) => {
      vistas.push(fatia);
      return { linhas: fatia.map((id) => ({ id })) };
    });

    const r = await porFatias(ids, aplicar);

    expect(FATIA_DE_IDS).toBe(100);
    expect(vistas.map((f) => f.length)).toEqual([100, 100, 100, 50]);
    expect(vistas.flat()).toEqual(ids);
    expect(r.linhas.map((l) => l.id)).toEqual(ids);
    expect(r.falhas).toBe(0);
  });

  it("uma fatia que falha não apaga as outras — e é contada", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const aplicar = vi.fn(async (fatia: string[], indice: number) => {
      void indice;
      return fatia[0] === "id-100"
        ? { linhas: [], erro: { message: "URI too long" } }
        : { linhas: fatia.map((id) => ({ id })) };
    });

    const r = await porFatias(ids, aplicar);

    expect(r.falhas).toBe(1);
    expect(r.primeiroErro).toEqual({ message: "URI too long" });
    expect(r.linhas).toHaveLength(150);
    expect(r.linhas[0]).toEqual({ id: "id-0" });
    expect(r.linhas.at(-1)).toEqual({ id: "id-249" });
  });
});
