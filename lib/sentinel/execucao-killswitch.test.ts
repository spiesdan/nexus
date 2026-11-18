import { describe, expect, it, vi } from "vitest";

/**
 * O kill switch de INSTALAÇÃO precisa ser provado sem banco: é a alavanca de
 * emergência, e uma execução que só descobre que está desligada depois de
 * abrir conexão não é um kill switch.
 */
vi.mock("@/lib/env", () => ({
  env: { SENTINEL_ENABLED: "false" },
}));

import { executarSentinela } from "./execucao";

describe("execução — kill switch da instalação", () => {
  it("SENTINEL_ENABLED=false devolve ignorada sem abrir rodada", async () => {
    const r = await executarSentinela({
      organizationId: "00000000-0000-4000-8000-000000000001",
      origem: "cron",
    });
    expect(r.status).toBe("ignorada");
    expect(r.motivo).toBe("desligado_no_ambiente");
    expect(r.execucaoId).toBeNull();
  });
});
