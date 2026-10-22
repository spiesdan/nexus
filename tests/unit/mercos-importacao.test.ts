import { describe, expect, it, vi } from "vitest";

import { enfileirarImportacaoMercos } from "@/lib/mercos/importacao";

/**
 * A trava de concorrência do botão do Mercos.
 *
 * O que importa não é o INSERT: é o caminho 23505. Duas abas (ou o cron das
 * 17h e um clique) não podem abrir dois scrapes da mesma organização — o
 * segundo tem que receber a execução que já está em curso, e a tela continua
 * acompanhando ela. Se este teste sumir, o índice parcial no banco continua
 * existindo, mas a rota passa a devolver 500 em vez do id.
 */

function adminDe(overrides: {
  insert?: () => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  select?: () => Promise<{ data: unknown; error: { message: string } | null }>;
}) {
  const select = overrides.select ?? (async () => ({ data: null, error: null }));
  const insert = overrides.insert ?? (async () => ({ data: null, error: null }));
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.single = vi.fn(insert);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(select);
  return { from: vi.fn(() => chain) } as never;
}

const execucao = {
  id: "run-1",
  organization_id: "org-1",
  status: "queued",
  origem: "manual",
  requested_by: "user-1",
  started_at: null,
  finished_at: null,
  orders_new: 0,
  orders_skipped: 0,
  items_new: 0,
  customers_new: 0,
  errors: [],
  summary: {},
  created_at: "2026-10-21T00:00:00.000Z",
  updated_at: "2026-10-21T00:00:00.000Z",
};

describe("enfileirarImportacaoMercos", () => {
  it("abre uma execução nova quando não há outra ativa", async () => {
    const admin = adminDe({ insert: async () => ({ data: execucao, error: null }) });
    const r = await enfileirarImportacaoMercos(admin, {
      organizationId: "org-1",
      requestedBy: "user-1",
      origem: "manual",
    });
    expect(r.jaEstavaRodando).toBe(false);
    expect(r.execucao.id).toBe("run-1");
  });

  it("no conflito 23505 devolve a execução ativa em vez de estourar", async () => {
    const ativa = { ...execucao, status: "running" };
    const admin = adminDe({
      insert: async () => ({ data: null, error: { code: "23505", message: "duplicate" } }),
      select: async () => ({ data: ativa, error: null }),
    });
    const r = await enfileirarImportacaoMercos(admin, {
      organizationId: "org-1",
      requestedBy: "user-1",
      origem: "manual",
    });
    expect(r.jaEstavaRodando).toBe(true);
    expect(r.execucao.status).toBe("running");
  });

  it("propaga erro que não é conflito de unicidade", async () => {
    const admin = adminDe({
      insert: async () => ({ data: null, error: { code: "XX000", message: "banco fora" } }),
    });
    await expect(
      enfileirarImportacaoMercos(admin, {
        organizationId: "org-1",
        requestedBy: null,
        origem: "cron",
      }),
    ).rejects.toThrow("banco fora");
  });
});
