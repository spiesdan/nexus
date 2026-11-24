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
import { isoDoPeriodo, periodoDaAssinatura, vencimentoEfetivo } from "@/lib/billing/periodo-assinatura";
import { planoEfetivo, type PlanoNoBanco, type PriceStripe } from "@/lib/billing/plano";
import { lerConfigStripe, stripeRequest } from "@/lib/billing/stripe";
import { ETAPAS } from "@/lib/billing/notices";
import { registrarVerificacao, resolverVerificacao } from "@/lib/billing/verificacao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface AssinaturaStripe {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number | null;
  current_period_start?: number | null;
  items?: {
    data: Array<{
      price?: { unit_amount?: number; currency?: string };
      current_period_end?: number | null;
      current_period_start?: number | null;
    }>;
  };
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

  // Plano: banco enquanto não há Price; com `stripe_price_id`, o Stripe manda.
  const { data: planoDb } = await admin.from("billing_plans")
    .select("nome, descricao, valor_cents, moeda, intervalo, stripe_price_id")
    .eq("ativo", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  let price: PriceStripe | null = null;
  if (planoDb?.stripe_price_id) {
    const cfgPlano = lerConfigStripe();
    const respostaPrice = await stripeRequest<PriceStripe>(cfgPlano, `/prices/${encodeURIComponent(planoDb.stripe_price_id)}`);
    if (respostaPrice.ok) price = respostaPrice.data;
    else await registrarVerificacao(admin, orgId, "plano_price", null, respostaPrice.erro);
  }
  const plano = planoEfetivo(planoDb as PlanoNoBanco | null, price);

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

  // Avisos D-3/D-2/D-1 já enviados (a própria linha é o in-app) e as etapas
  // que ainda vêm. Os dados vêm de `billing_notices`, nunca de constante.
  const { data: avisos } = await admin
    .from("billing_notices")
    .select("etapa, canal, enviado_em, resultado, detalhe")
    .eq("organization_id", orgId)
    .order("criado_em", { ascending: false })
    .limit(12);
  const periodo = periodoDaAssinatura(remoto);
  // O valor local já veio do Stripe em rodada anterior: se a resposta atual
  // não trouxer o campo, ele permanece — nunca vira NULL por omissão.
  const vencimentoIso = vencimentoEfetivo(isoDoPeriodo(periodo.fim), local?.current_period_end);
  const enviadas = new Set((avisos ?? []).filter((a) => a.resultado === "enviado").map((a) => a.etapa));
  const diasRestantes = vencimentoIso
    ? Math.round(
        (Date.UTC(
          new Date(vencimentoIso).getUTCFullYear(),
          new Date(vencimentoIso).getUTCMonth(),
          new Date(vencimentoIso).getUTCDate(),
        ) -
          Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())) /
          86_400_000,
      )
    : null;
  const proximos =
    diasRestantes == null
      ? []
      : ETAPAS.filter((dias) => dias >= diasRestantes && !enviadas.has(dias));

  const preco = remoto?.items?.data?.[0]?.price;
  return ok(
    {
      avisos: avisos ?? [],
      proximos,
      fonte,
      plano,
      status: remoto?.status ?? local?.status ?? "sem_assinatura",
      valor_cents: preco?.unit_amount ?? null,
      moeda: preco?.currency?.toUpperCase() ?? null,
      vencimento: vencimentoIso,
      periodo_origem: periodo.origem,
      cancela_no_fim: remoto?.cancel_at_period_end ?? local?.cancel_at_period_end ?? false,
      id: remoto?.id ?? local?.stripe_subscription_id ?? null,
    },
    { requestId },
  );
}
