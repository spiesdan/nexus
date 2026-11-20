import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { after } from "next/server";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import { __resetFalhaDaMetrica, comMetricas } from "./rotas";

const insert = vi.fn();

function req() {
  return { cookies: { get: () => undefined } } as never;
}

const ok = () => new Response("{}", { status: 200, headers: { "x-request-id": "req-1" } });

beforeEach(() => {
  vi.clearAllMocks();
  __resetFalhaDaMetrica();
  insert.mockResolvedValue({ error: null });
  vi.mocked(createAdminClient).mockReturnValue({
    from: () => ({ insert }),
  } as never);
});

describe("comMetricas — três caminhos de escrita", () => {
  it("after ok: persiste no callback e não loga erro", async () => {
    vi.mocked(after).mockImplementation((cb) => {
      if (typeof cb === "function") void cb();
    });

    await comMetricas("/api/v1/contacts", async () => ok())(req());

    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ route: "/api/v1/contacts", status: 200 }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("after lança: fallback persiste direto", async () => {
    vi.mocked(after).mockImplementation(() => {
      throw new Error("after fora do request scope");
    });

    await comMetricas("/api/v1/contacts", async () => ok())(req());

    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("after lança e insert falha: UMA linha de erro", async () => {
    vi.mocked(after).mockImplementation(() => {
      throw new Error("after fora do request scope");
    });
    insert.mockResolvedValue({ error: { message: "db recusou" } });

    await comMetricas("/api/v1/contacts", async () => ok())(req());

    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        "observabilidade.metrica_falhou",
        expect.objectContaining({ rota: "/api/v1/contacts", definitivo: true }),
      ),
    );
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("duas falhas seguidas logam UMA vez (a trava só reabre no sucesso)", async () => {
    vi.mocked(after).mockImplementation(() => {
      throw new Error("after fora do request scope");
    });
    insert.mockResolvedValue({ error: { message: "db recusou" } });

    const executar = comMetricas("/api/v1/contacts", async () => ok());
    await executar(req());
    await executar(req());

    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1));
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
