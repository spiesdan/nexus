import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { assinarOrcamento, verificarOrcamento, VALIDADE_DO_LINK_DIAS } from "./orcamento-link";

const PEDIDO = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const AGORA = Date.UTC(2026, 9, 19, 12, 0, 0);

describe("link público do orçamento", () => {
  it("assina e verifica: o pedido e a organização saem da CARGA, não do path", () => {
    const token = assinarOrcamento({ orderId: PEDIDO, orgId: ORG, agoraMs: AGORA });
    const carga = verificarOrcamento(token, AGORA);
    expect(carga).toEqual({
      orderId: PEDIDO,
      orgId: ORG,
      expiraEm: Math.floor(AGORA / 1000) + VALIDADE_DO_LINK_DIAS * 86_400,
    });
  });

  it("o token é um segmento de URL só (nada de barra ou + que quebre o path)", () => {
    for (let i = 0; i < 20; i++) {
      const token = assinarOrcamento({ orderId: `pedido-${i}`, orgId: ORG, agoraMs: AGORA });
      expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    }
  });

  it("payload adulterado não passa", () => {
    const token = assinarOrcamento({ orderId: PEDIDO, orgId: ORG, agoraMs: AGORA });
    const [, payload, assinatura] = token.split(".") as [string, string, string];
    const outro = Buffer.from(
      JSON.stringify({ o: "outro-pedido", g: ORG, e: Math.floor(AGORA / 1000) + 86_400 }),
      "utf8",
    ).toString("base64url");
    expect(verificarOrcamento(`v1.${outro}.${assinatura}`, AGORA)).toBeNull();
    // Assinatura trocada pelo payload válido de outro token.
    const outroToken = assinarOrcamento({ orderId: "x", orgId: ORG, agoraMs: AGORA });
    const outraAssinatura = outroToken.split(".")[2] as string;
    expect(verificarOrcamento(`v1.${payload}.${outraAssinatura}`, AGORA)).toBeNull();
  });

  it("link vencido não passa", () => {
    const token = assinarOrcamento({ orderId: PEDIDO, orgId: ORG, agoraMs: AGORA, validadeDias: 1 });
    expect(verificarOrcamento(token, AGORA + 86_400 * 1000 - 1)).not.toBeNull();
    expect(verificarOrcamento(token, AGORA + 86_400 * 1000)).toBeNull();
  });

  it("versão desconhecida, lixo e vazio devolvem null (nunca lançam)", () => {
    const token = assinarOrcamento({ orderId: PEDIDO, orgId: ORG, agoraMs: AGORA });
    const payload = token.split(".")[1] as string;
    const assinatura = token.split(".")[2] as string;
    expect(verificarOrcamento(`v2.${payload}.${assinatura}`, AGORA)).toBeNull();
    expect(verificarOrcamento("", AGORA)).toBeNull();
    expect(verificarOrcamento("v1.apenas.isso.aqui", AGORA)).toBeNull();
    expect(verificarOrcamento("v1.@@@.###", AGORA)).toBeNull();
    expect(verificarOrcamento(token, AGORA)).not.toBeNull();
  });

  it("a derivação é própria do orçamento: token sem o prefixo não vale", () => {
    // Mesmo segredo, sem o `orcamento:` na derivação — é o que um token de
    // convite de equipe (ou qualquer outro HMAC do INTERNAL_SECRET) seria.
    const payload = Buffer.from(
      JSON.stringify({ o: PEDIDO, g: ORG, e: Math.floor(AGORA / 1000) + 86_400 }),
      "utf8",
    ).toString("base64url");
    const assinaturaAlheia = createHmac("sha256", process.env.INTERNAL_SECRET ?? "dev-fallback")
      .update(payload)
      .digest("base64url");
    expect(verificarOrcamento(`v1.${payload}.${assinaturaAlheia}`, AGORA)).toBeNull();
  });
});
