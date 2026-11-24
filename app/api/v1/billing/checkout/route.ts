/**
 * POST /api/v1/billing/checkout — abre sessão de checkout no Stripe.
 * O tenant NUNCA vem do corpo: vem de `requireRole`. Nada é marcado como pago
 * antes do webhook confirmar no servidor.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { lerConfigStripe, stripeRequest } from "@/lib/billing/stripe";
import { registrarVerificacao } from "@/lib/billing/verificacao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface SessaoStripe {
  id: string;
  url: string;
  expires_at: number | null;
}

export async function POST(): Promise<Response> {
  const requestId = randomUUID();
  const autorizado = await requireRole("admin", { requestId, resource: "billing_checkout" });
  if (!autorizado.ok) return autorizado.response;

  const cfg = lerConfigStripe();
  if (!cfg.secretKey || !cfg.priceId) {
    return fail("internal_error", "Billing sem STRIPE_SECRET_KEY ou STRIPE_PRICE_ID.", 503, { requestId });
  }
  const admin = createAdminClient();
  const orgId = autorizado.org.orgId;
  const idempotencyKey = randomUUID();
  const resposta = await stripeRequest<SessaoStripe>(cfg, "/checkout/sessions", {
    method: "POST",
    idempotencyKey,
    corpo: {
      mode: "subscription",
      "line_items[0][price]": cfg.priceId,
      "line_items[0][quantity]": 1,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/app/billing?sucesso=1`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/app/billing?cancelado=1`,
      client_reference_id: orgId,
      "metadata[organization_id]": orgId,
    },
  });

  if (!resposta.ok) {
    await registrarVerificacao(admin, orgId, "checkout_criacao", null, resposta.erro);
    return fail("internal_error", "Não foi possível abrir o checkout.", 503, { requestId });
  }

  const sessao = resposta.data;
  const { error } = await admin.from("billing_checkout_sessions").insert({
    organization_id: orgId,
    stripe_session_id: sessao.id,
    status: "open",
    expires_at: sessao.expires_at ? new Date(sessao.expires_at * 1000).toISOString() : null,
  });
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok({ url: sessao.url, session_id: sessao.id }, { requestId });
}
