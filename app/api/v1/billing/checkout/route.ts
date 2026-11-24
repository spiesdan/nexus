/**
 * POST /api/v1/billing/checkout — abre sessão de checkout no Stripe.
 * O tenant NUNCA vem do corpo: vem de `requireRole`. Nada é marcado como pago
 * antes do webhook confirmar no servidor.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { decidirCheckout } from "@/lib/billing/checkout-logica";
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
  if (!cfg.secretKey) {
    return fail("internal_error", "Billing sem STRIPE_SECRET_KEY.", 503, { requestId });
  }
  const admin = createAdminClient();
  // A fonte do Price é o PLANO no banco. STRIPE_PRICE_ID do .env é legado,
  // usado apenas se o plano ainda não tem a referência casada.
  const { data: plano } = await admin.from("billing_plans")
    .select("stripe_price_id").eq("ativo", true).limit(1).maybeSingle();
  const priceId = plano?.stripe_price_id || cfg.priceId;
  if (!priceId) {
    return fail("not_found", "Plano sem Price do Stripe — configures billing_plans.stripe_price_id.", 404, { requestId });
  }
  const orgId = autorizado.org.orgId;

  // ANTES de criar qualquer sessão: olhar o que já existe. Stripe cria duas
  // assinaturas para o mesmo cliente sem avisar — o cliente descobre no extrato.
  const [{ data: cliente }, { data: assinaturas }] = await Promise.all([
    admin.from("billing_customers").select("stripe_customer_id")
      .eq("organization_id", orgId).maybeSingle(),
    admin.from("billing_subscriptions").select("status")
      .eq("organization_id", orgId).in("status", ["active", "trialing", "past_due"]),
  ]);
  const decisao = decidirCheckout({
    assinaturas: assinaturas ?? [],
    customerId: cliente?.stripe_customer_id,
    organizationId: orgId,
    priceId,
  });
  if (!decisao.pode) {
    return fail("invalid_request", decisao.motivo, 409, {
      requestId,
      details: { portal_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/app/billing` },
    });
  }

  const resposta = await stripeRequest<SessaoStripe>(cfg, "/checkout/sessions", {
    method: "POST",
    idempotencyKey: decisao.idempotencyKey,
    corpo: {
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": 1,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/app/billing?sucesso=1`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/app/billing?cancelado=1`,
      client_reference_id: orgId,
      "metadata[organization_id]": orgId,
      // Reusa o cadastro existente: sem isto cada checkout cria um cus_ novo.
      ...(decisao.customerId ? { customer: decisao.customerId } : {}),
      "customer_update[address]": "auto",
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
