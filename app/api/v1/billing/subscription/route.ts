/**
 * GET /api/v1/billing/subscription — assinatura SaaS do tenant.
 *
 * Status/valor/moeda/vencimento vêm do STRIPE, nunca de constante. Se o ERP
 * estiver fora, a rota NÃO diz "pago" e NÃO diz "suspenso": devolve o último
 * estado LOCAL já recebido do Stripe, marcado `fonte: local_cache`, e abre
 * `billing_verifications` para retry. Nenhuma suspensão acontece aqui.
 */
import { randomUUID } from "node:crypto";

import { ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { lerConfigStripe, stripeRequest } from "@/lib/billing/stripe";
import { registrarVerificacao, resolverVerificacao } from "@/lib/billing/verificacao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface AssinaturaStripe {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  items?: { data: Array<{ price?: { unit_amount?: number; currency?: string } }> };
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const autorizado = await requireRole("viewer", { requestId, resource: "billing_subscription" });
  if (!autorizado.ok) return autorizado.response;

  const admin = createAdminClient();
  const orgId = autorizado.org.orgId;
  const { data: cliente } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("organization_id", orgId)
    .maybeSingle();
  const { data: local } = await admin
    .from("billing_subscriptions")
    .select("stripe_subscription_id, status, stripe_price_id, current_period_end, cancel_at_period_end")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let remoto: AssinaturaStripe | null = null;
  let fonte = "local_cache";
  if (cliente?.stripe_customer_id) {
    const cfg = lerConfigStripe();
    const resposta = await stripeRequest<{ data: AssinaturaStripe[] }>(
      cfg,
      `/customers/${encodeURIComponent(cliente.stripe_customer_id)}/subscriptions?status=all&limit=1`,
    );
    if (resposta.ok) {
      remoto = resposta.data.data?.[0] ?? null;
      fonte = "stripe";
      await resolverVerificacao(admin, orgId, "subscription_consulta", remoto?.id ?? null);
    } else {
      await registrarVerificacao(admin, orgId, "subscription_consulta", local?.stripe_subscription_id ?? null, resposta.erro);
    }
  }

  const preco = remoto?.items?.data?.[0]?.price;
  return ok(
    {
      fonte,
      status: remoto?.status ?? local?.status ?? "sem_assinatura",
      valor_cents: preco?.unit_amount ?? null,
      moeda: preco?.currency?.toUpperCase() ?? null,
      vencimento: remoto?.current_period_end
        ? new Date(remoto.current_period_end * 1000).toISOString()
        : local?.current_period_end ?? null,
      cancela_no_fim: remoto?.cancel_at_period_end ?? local?.cancel_at_period_end ?? false,
      id: remoto?.id ?? local?.stripe_subscription_id ?? null,
    },
    { requestId },
  );
}
