/**
 * QUEM PODE CONECTAR UM NÚMERO — a rota de onboarding do WhatsApp exigia só
 * cookie.
 *
 * ─── O DEFEITO, MEDIDO EM 17/11/2026 ──────────────────────────────────────
 *
 * `POST /api/v1/onboarding/whatsapp/session` chamava `loadAuthUser()` e nada
 * mais: **qualquer membro autenticado**, inclusive `viewer`, criava sessão e QR
 * no WAHA — recurso externo, com custo e com efeito real no número da empresa.
 *
 * O piso passou a ser `agent`, o mesmo das outras mutações de canal. Não se usa
 * `requireRole` de propósito: ele arrasta a exigência de MFA, e o onboarding
 * acontece antes dela.
 *
 * O que este teste prova: `viewer` leva **403** e a rota nem chega a olhar o
 * WAHA (o dublê devolve `null`, que responderia 503 se a ordem estivesse
 * errada).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { getWahaClient } from "@/lib/waha/client";

import { POST } from "./route";

vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: vi.fn(),
  resolveActiveOrg: vi.fn(),
}));
vi.mock("@/lib/waha/client", () => ({ getWahaClient: vi.fn() }));

const req = () => new NextRequest("http://localhost/api/v1/onboarding/whatsapp/session", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAuthUser).mockResolvedValue({ id: "u1" } as never);
});

describe("POST /api/v1/onboarding/whatsapp/session", () => {
  it("viewer NÃO conecta número (403 antes de tocar no WAHA)", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: "o1", role: "viewer" } as never);

    const resposta = await POST(req());

    expect(resposta.status).toBe(403);
    expect(await resposta.text()).toContain("não conecta número");
    expect(getWahaClient).not.toHaveBeenCalled();
  });

  it("agent passa da guarda (o dublê do WAHA devolve null → 503 de configuração)", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: "o1", role: "agent" } as never);
    vi.mocked(getWahaClient).mockReturnValue(null);

    const resposta = await POST(req());

    expect(resposta.status).toBe(503);
  });

  it("a régua é a de `agent` — manager, vendedor e ai_operator também passam", () => {
    // `owner` não existe no vocabulário: o topo é `admin` (ver lib/auth/types).
    for (const papel of ["vendedor", "ai_operator", "manager", "admin"] as const) {
      expect(ROLE_RANK[papel], papel).toBeGreaterThanOrEqual(ROLE_RANK.agent);
    }
  });
});
