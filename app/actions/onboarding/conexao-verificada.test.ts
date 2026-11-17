/**
 * O WIZARD NÃO PODE DECLARAR CONEXÃO QUE NÃO EXISTE.
 *
 * Dois botões do onboarding gravavam o passo como cumprido sem perguntar a
 * ninguém:
 *
 *  - Nuvemshop "Já conectei" → `connected_at` carimbado direto. A loja seguia
 *    desconectada, e o catálogo/pedidos simplesmente não vinham.
 *  - WhatsApp "Conectei em outro lugar" → `status: "configured"` sem o transporte
 *    confirmar sessão nenhuma. O agente começaria a atender num número que
 *    nunca foi pareado.
 *
 * A regra agora é: o SERVIDOR pergunta ao transporte e à linha escrita
 * pelo callback do OAuth (`tenant_integrations`). O clique é intenção, não
 * prova. Estes testes cobrem os dois desfechos de cada porta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { markNuvemshopConfigured, markWhatsappConfigured } from "./skipWhatsapp";

const patchOnboardingState = vi.fn(async () => undefined);
const redirecionar = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
const lerSessaoDoCanal = vi.fn();
const integracao = vi.fn();

vi.mock("next/navigation", () => ({ redirect: () => redirecionar() }));
vi.mock("./_shared", () => ({
  requireOnboardingCtx: async () => ({
    userId: "u-1",
    orgId: "org-1",
    orgName: "Org",
    role: "admin",
    fullName: null,
    email: "a@b.c",
  }),
  patchOnboardingState: (...args: unknown[]) => patchOnboardingState(...(args as [])),
  OnboardingError: class extends Error {},
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => integracao(),
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/channels/sessao-do-canal", () => ({
  lerSessaoDoCanal: (...args: unknown[]) => lerSessaoDoCanal(...(args as [])),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("markWhatsappConfigured", () => {
  it("sessão que não está WORKING NÃO conclui o passo", async () => {
    lerSessaoDoCanal.mockResolvedValue({ sessao: { id: "s1", status: "SCAN_QR_CODE" }, schemaOutdated: false });

    const r = await markWhatsappConfigured("org_123", "configured");

    expect(r).toMatchObject({ ok: false });
    expect(patchOnboardingState).not.toHaveBeenCalled();
    expect(redirecionar).not.toHaveBeenCalled();
  });

  it("sessão WORKING grava o status REAL vindo do transporte", async () => {
    lerSessaoDoCanal.mockResolvedValue({ sessao: { id: "s1", status: "WORKING" }, schemaOutdated: false });

    await expect(markWhatsappConfigured("org_123", "configured")).rejects.toThrow("NEXT_REDIRECT");

    expect(patchOnboardingState).toHaveBeenCalledWith("org-1", {
      whatsapp: { session_name: "org_123", status: "WORKING" },
    });
  });

  it("falha ao ler o estado da sessão não conecta por otimismo", async () => {
    lerSessaoDoCanal.mockRejectedValue(new Error("timeout"));

    const r = await markWhatsappConfigured("org_123", "configured");
    expect(r).toMatchObject({ ok: false });
    expect(patchOnboardingState).not.toHaveBeenCalled();
  });
});

describe("markNuvemshopConfigured", () => {
  it("sem linha em tenant_integrations NÃO conclui o passo", async () => {
    integracao.mockReturnValue({ data: null, error: null });

    const r = await markNuvemshopConfigured();

    expect(r).toMatchObject({ ok: false });
    expect(patchOnboardingState).not.toHaveBeenCalled();
  });

  it("integração que não está healthy não conta como conectada", async () => {
    integracao.mockReturnValue({ data: { status: "token_expired", store_metadata: {} }, error: null });

    const r = await markNuvemshopConfigured();
    expect(r).toMatchObject({ ok: false });
    expect(patchOnboardingState).not.toHaveBeenCalled();
  });

  it("integração healthy conclui o passo com o store_id do callback", async () => {
    integracao.mockReturnValue({
      data: { status: "healthy", store_metadata: { store_id: 998877 } },
      error: null,
    });

    await expect(markNuvemshopConfigured()).rejects.toThrow("NEXT_REDIRECT");

    expect(patchOnboardingState).toHaveBeenCalledWith("org-1", {
      nuvemshop: expect.objectContaining({ store_id: "998877" }),
    });
  });
});
