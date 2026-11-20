import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  env: { INTERNAL_CRON_SECRET: "cron-secret", INTERNAL_SECRET: null },
}));
vi.mock("@/lib/observabilidade/rotas", () => ({ registrarSonda: vi.fn() }));

import { registrarSonda } from "@/lib/observabilidade/rotas";

import { POST } from "./route";

function req(body?: unknown, secret = "cron-secret") {
  return new NextRequest("http://localhost/api/internal/observabilidade/sonda", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(registrarSonda).mockResolvedValue({
    id: "probe-1",
    created_at: "2026-11-20T00:00:00.000Z",
    duracao_ms: 12.3,
    origem: "manual",
    ok: true,
  });
});

describe("POST /api/internal/observabilidade/sonda", () => {
  it("sem secret é 403 e não grava", async () => {
    const res = await POST(req(undefined, "errado"));
    expect(res.status).toBe(403);
    expect(registrarSonda).not.toHaveBeenCalled();
  });

  it("grava a sonda e devolve id, instante e duração", async () => {
    const res = await POST(req({ origem: "cron" }));
    expect(res.status).toBe(200);
    expect(registrarSonda).toHaveBeenCalledWith("cron");
    const corpo = (await res.json()) as { data: { id: string; created_at: string; duracao_ms: number } };
    expect(corpo.data).toMatchObject({
      id: "probe-1",
      created_at: "2026-11-20T00:00:00.000Z",
      duracao_ms: 12.3,
    });
  });

  it("falha de escrita vira 500, não sucesso vazio", async () => {
    vi.mocked(registrarSonda).mockRejectedValue(new Error("db"));
    const res = await POST(req({}));
    expect(res.status).toBe(500);
  });
});
