import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import type { SupabaseClient } from "@supabase/supabase-js";

import { candidatosSemDecisao } from "./laya-decisao";

/**
 * O DEFEITO MEDIDO: `URI too long` a cada 15 min no risk-watcher.
 *
 * `candidatosSemDecisao` montava um único `in (lead_id, …)` com o acervo frio
 * inteiro. UUID tem 36 chars; a partir de algumas centenas o PostgREST monta
 * uma URL acima do limite e a chamada falha. Como a exceção derruba o tick,
 * nenhuma decisão era gravada enquanto o acervo passasse do teto — o sintoma
 * visível era "o radar parou de sugerir", não "a consulta estourou".
 *
 * O fake abaixo reproduz o limite do servidor: `.in()` com mais de 100 ids
 * lança `URI too long`, como o HTTP faria.
 */
const LIMITE_DA_URL = 100;

function adminFalso(decididos: Set<string>, erroNoLote?: string) {
  const lotes: string[][] = [];
  const client = {
    from: () => {
      let ids: string[] = [];
      const consulta = {
        select: () => consulta,
        eq: () => consulta,
        in: (_coluna: string, recebidos: string[]) => {
          if (recebidos.length > LIMITE_DA_URL) {
            throw new Error("URI too long");
          }
          ids = recebidos;
          lotes.push(recebidos);
          return consulta;
        },
        then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
          Promise.resolve(
            erroNoLote
              ? { data: null, error: { message: erroNoLote } }
              : {
                  data: ids
                    .filter((id) => decididos.has(id))
                    .map((lead_id) => ({ lead_id })),
                  error: null,
                },
          ).then(ok, falha),
      };
      return consulta;
    },
  };
  return { client: client as unknown as SupabaseClient, lotes };
}

function frios(quantidade: number) {
  return Array.from({ length: quantidade }, (_, i) => ({
    leadId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    contactId: `contato-${i}`,
    bucket: (i % 2 === 0 ? "em_risco" : "critico") as "em_risco" | "critico",
    esfriouEm: new Date("2026-11-20T00:00:00.000Z"),
  }));
}

describe("candidatosSemDecisao — consulta fatiada", () => {
  it("reproduz o defeito: todos os ids numa consulta só estoura a URL", () => {
    const { client } = adminFalso(new Set());
    const todos = frios(250).map((f) => f.leadId);

    // Era exatamente esta chamada que o código antigo fazia.
    expect(() =>
      client
        .from("crm_lead_risk_decisions")
        .select("lead_id")
        .eq("organization_id", "org-1")
        .in("lead_id", todos),
    ).toThrow(/URI too long/);
  });

  it("250 frios viram 3 lotes de até 100, e o resultado é o mesmo", async () => {
    const todos = frios(250);
    // 30 já têm decisão; 220 precisam entrar no radar.
    const decididos = new Set(todos.slice(0, 30).map((f) => f.leadId));
    const { client, lotes } = adminFalso(decididos);

    const semDecisao = await candidatosSemDecisao(client, "org-1", todos);

    expect(lotes).toHaveLength(3);
    expect(lotes.map((l) => l.length)).toEqual([100, 100, 50]);
    expect(semDecisao).toHaveLength(220);
    expect(semDecisao.some((id) => decididos.has(id))).toBe(false);
  });

  it("lead repetido não ocupa duas vagas do lote", async () => {
    const lista = frios(3);
    const comRepetido = [...lista, lista[0]!];
    const { client, lotes } = adminFalso(new Set());

    const semDecisao = await candidatosSemDecisao(client, "org-1", comRepetido);

    expect(lotes[0]).toHaveLength(3);
    expect(semDecisao).toHaveLength(4); // devolve a lista original, com a repetição
  });

  it("lista vazia não faz consulta", async () => {
    const { client, lotes } = adminFalso(new Set());
    await expect(candidatosSemDecisao(client, "org-1", [])).resolves.toEqual([]);
    expect(lotes).toHaveLength(0);
  });

  it("erro de um lote vira erro da função, não silêncio", async () => {
    const { client } = adminFalso(new Set(), "banco fora");
    await expect(candidatosSemDecisao(client, "org-1", frios(3))).rejects.toThrow(
      /leitura de decisões falhou: banco fora/,
    );
  });
});
