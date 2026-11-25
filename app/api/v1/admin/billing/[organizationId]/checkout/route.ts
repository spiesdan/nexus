/**
 * POST /api/v1/admin/billing/[organizationId]/checkout
 *
 * Cria a assinatura de uma organização que ainda não tem uma. É a única
 * chamada ao Stripe na tela — e ela acontece no CLIQUE, nunca na leitura da
 * lista: 50 organizações com uma chamada por linha seriam 50 requisições
 * síncronas para desenhar uma tabela.
 *
 * O status só vira "pago" pelo webhook; esta rota registra a sessão aberta e
 * devolve a URL. Escopo `full`, `audit()` e `organization_id` do path.
 */

import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { escopoPermiteEscrita, requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { decidirCheckout } from "@/lib/billing/checkout-logica";
import { estadoStripe } from "@/lib/billing/stripe-estado";
import { lerConfigStripe, stripeRequest } from "@/lib/billing/stripe";
import { registrarVerificacao } from "@/lib/billing/verificacao";
import { clienteStripeDaOrg } from "@/lib/billing/visao-plataforma-servidor";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ organizationId: z.string().uuid() });

interface SessaoStripe {
  id: string;
  url: string;
  expires_at: number | null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  let adminCtx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }
  if (!escopoPermiteEscrita(adminCtx.platformAdmin.scope)) {
    return fail(
      "forbidden_scope",
      "Seu acesso de plataforma é somente leitura. Peça a um administrador com escopo full.",
      403,
      { requestId },
    );
  }

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return fail("validation_error", "organizationId inválido", 400, { requestId });
  const organizationId = parsed.data.organizationId;

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, display_name, slug")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return fail("not_found", "Organização não encontrada", 404, { requestId });

  const stripe = estadoStripe();
  if (!stripe.configurado) {
    return fail("stripe_nao_configurado", stripe.detalhe ?? "Stripe não configurado nesta instalação.", 503, {
      requestId,
    });
  }
  const cfg = lerConfigStripe();

  const { data: plano } = await admin
    .from("billing_plans")
    .select("stripe_price_id")
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const priceId = (plano as { stripe_price_id?: string } | null)?.stripe_price_id || cfg.priceId;
  if (!priceId) {
    return fail(
      "plano_sem_price",
      "O plano no banco não tem Price do Stripe — preencha billing_plans.stripe_price_id.",
      409,
      { requestId },
    );
  }

  const [customer, { data: assinaturas }] = await Promise.all([
    clienteStripeDaOrg(admin, organizationId),
    admin
      .from("billing_subscriptions")
      .select("status")
      .eq("organization_id", organizationId)
      .in("status", ["active", "trialing", "past_due"]),
  ]);
  const decisao = decidirCheckout({
    assinaturas: (assinaturas ?? []) as Array<{ status: string }>,
    customerId: customer,
    organizationId,
    priceId,
  });
  if (!decisao.pode) {
    return fail("invalid_request", decisao.motivo, 409, { requestId });
  }

  const resposta = await stripeRequest<SessaoStripe>(cfg, "/checkout/sessions", {
    method: "POST",
    idempotencyKey: decisao.idempotencyKey,
    corpo: {
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": 1,
      success_url: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/admin/billing?assinatura=criada`,
      cancel_url: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/admin/billing?assinatura=cancelada`,
      client_reference_id: organizationId,
      "metadata[organization_id]": organizationId,
      ...(decisao.customerId ? { customer: decisao.customerId } : {}),
      "customer_update[address]": "auto",
    },
  });
  if (!resposta.ok) {
    await registrarVerificacao(admin, organizationId, "checkout_criacao", null, resposta.erro);
    return fail("internal_error", "Não foi possível abrir o checkout do Stripe.", 503, { requestId });
  }

  const sessao = resposta.data;
  const { error } = await admin.from("billing_checkout_sessions").insert({
    organization_id: organizationId,
    stripe_session_id: sessao.id,
    status: "open",
    expires_at: sessao.expires_at ? new Date(sessao.expires_at * 1000).toISOString() : null,
  });
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    action: "platform_admin.billing_checkout_created",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    organizationId,
    resourceType: "billing_checkout_session",
    resourceId: sessao.id,
    requestId,
    metadata: {
      organization_name: (org as { display_name?: string }).display_name ?? null,
      price_id: priceId,
    },
  });

  return ok({ url: sessao.url, session_id: sessao.id }, { requestId });
}
