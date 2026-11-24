/**
 * POST /api/v1/billing/portal — portal de gestão da assinatura no Stripe.
 * O `customer` é resolvido pelo organization_id da sessão, nunca do corpo.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { lerConfigStripe, stripeRequest } from "@/lib/billing/stripe";
import { registrarVerificacao } from "@/lib/billing/verificacao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const requestId = randomUUID();
  const autorizado = await requireRole("admin", { requestId, resource: "billing_portal" });
  if (!autorizado.ok) return autorizado.response;

  const admin = createAdminClient();
  const orgId = autorizado.org.orgId;
  const { data: cliente } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!cliente?.stripe_customer_id) {
    return fail("not_found", "Cliente Stripe não vinculado a esta organização.", 404, { requestId });
  }

  const cfg = lerConfigStripe();
  const resposta = await stripeRequest<{ url: string }>(cfg, "/billing_portal/sessions", {
    method: "POST",
    corpo: {
      customer: cliente.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/app/billing`,
    },
  });
  if (!resposta.ok) {
    await registrarVerificacao(admin, orgId, "portal_criacao", null, resposta.erro);
    return fail("internal_error", "Não foi possível abrir o portal.", 503, { requestId });
  }
  return ok({ url: resposta.data.url }, { requestId });
}
