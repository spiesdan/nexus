import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import { googlePlacesHabilitado, resolverChaveGoogle } from "@/lib/prospeccao/chave";

vi.mock("@/lib/webhooks/secrets", () => ({
  decryptWebhookSecret: vi.fn(),
}));

/** Fake de admin: from→select→eq→maybeSingle numa corrente só. */
function adminCom(linha: unknown): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: linha }),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

const ORIGINAIS = {
  chave: process.env.GOOGLE_MAPS_API_KEY,
  enabled: process.env.GOOGLE_PLACES_ENABLED,
};

beforeEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_PLACES_ENABLED;
  vi.mocked(decryptWebhookSecret).mockReset();
});

afterEach(() => {
  if (ORIGINAIS.chave === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
  else process.env.GOOGLE_MAPS_API_KEY = ORIGINAIS.chave;
  if (ORIGINAIS.enabled === undefined) delete process.env.GOOGLE_PLACES_ENABLED;
  else process.env.GOOGLE_PLACES_ENABLED = ORIGINAIS.enabled;
});

describe("resolverChaveGoogle (resolução única, B4 da spec 19)", () => {
  it("prefere a chave cifrada do tenant", async () => {
    vi.mocked(decryptWebhookSecret).mockResolvedValue("chave-tenant");
    const admin = adminCom({ google_api_key_encrypted: "enc-xyz" });
    const r = await resolverChaveGoogle(admin, "org-1");
    expect(r).toEqual({ chave: "chave-tenant", origem: "tenant" });
    expect(decryptWebhookSecret).toHaveBeenCalledWith(admin, "enc-xyz");
  });

  it("cai para a chave da instalação quando o tenant não tem (ou o decrypt falha)", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "chave-env";
    vi.mocked(decryptWebhookSecret).mockResolvedValue(null);
    const r1 = await resolverChaveGoogle(adminCom({ google_api_key_encrypted: "enc" }), "org-1");
    expect(r1).toEqual({ chave: "chave-env", origem: "instalacao" });
    const r2 = await resolverChaveGoogle(adminCom(null), "org-1");
    expect(r2).toEqual({ chave: "chave-env", origem: "instalacao" });
  });

  it("sem nenhuma chave devolve nenhuma, nunca lança", async () => {
    const r = await resolverChaveGoogle(adminCom(null), "org-1");
    expect(r).toEqual({ chave: null, origem: "nenhuma" });
    expect(decryptWebhookSecret).not.toHaveBeenCalled();
  });
});

describe("googlePlacesHabilitado (kill-switch da instalação)", () => {
  it("default ligado; só desliga com GOOGLE_PLACES_ENABLED=false", () => {
    expect(googlePlacesHabilitado()).toBe(true);
    process.env.GOOGLE_PLACES_ENABLED = "false";
    expect(googlePlacesHabilitado()).toBe(false);
    process.env.GOOGLE_PLACES_ENABLED = "true";
    expect(googlePlacesHabilitado()).toBe(true);
  });
});
