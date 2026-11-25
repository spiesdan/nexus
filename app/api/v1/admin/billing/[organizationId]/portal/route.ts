/**
 * POST /api/v1/admin/billing/[organizationId]/portal
 *
 * Abre o portal do Stripe para OUTRA organização. A rota do tenant
 * (`/api/v1/billing/portal`) resolve a org pela sessão e exige ser admin dela;
 * o dono da instalação não é membro de todo tenant, então a plataforma precisa
 * deste caminho próprio.
 *
 * Mutação: exige escopo `full` (support_readonly lê, não escreve), grava
 * `audit()` e NUNCA aceita `organization_id` do corpo — ele vem do path,
 * validado como UUID e conferido contra `organizations`.
 */

import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { escopoPermiteEscrita, requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { estadoStripe } from "@/lib/billing/stripe-estado";
import { lerConfigStripe, stripeRequest } from "@/lib/billing/stripe";
import { registrarVerificacao } from "@/lib/billing/verificacao";
import { clienteStripeDaOrg } from "@/lib/billing/visao-plataforma-servidor";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ organizationId: z.string().uuid() });

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
    .select("id, display_name")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return fail("not_found", "Organização não encontrada", 404, { requestId });

  const customer = await clienteStripeDaOrg(admin, organizationId);
  if (!customer) {
    return fail(
      "sem_cliente_stripe",
      "Esta organização ainda não tem cliente no Stripe — use “Criar assinatura”.",
      409,
      { requestId },
    );
  }

  const stripe = estadoStripe();
  if (!stripe.configurado) {
    return fail("stripe_nao_configurado", stripe.detalhe ?? "Stripe não configurado nesta instalação.", 503, {
      requestId,
    });
  }

  const cfg = lerConfigStripe();
  const resposta = await stripeRequest<{ url: string }>(cfg, "/billing_portal/sessions", {
    method: "POST",
    corpo: {
      customer,
      return_url: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/admin/billing`,
    },
  });
  if (!resposta.ok) {
    await registrarVerificacao(admin, organizationId, "portal_criacao", null, resposta.erro);
    return fail("internal_error", "Não foi possível abrir o portal do Stripe.", 503, { requestId });
  }

  void audit({
    action: "platform_admin.billing_portal_opened",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    organizationId,
    resourceType: "billing_customer",
    // `api_audit_log.resource_id` é uuid; o id do Stripe (`cus_...`) não é.
    // O identificador natural vai no metadata, onde é lido sem quebrar o INSERT.
    resourceId: null,
    requestId,
    metadata: {
      organization_name: (org as { display_name?: string }).display_name ?? null,
      stripe_customer_id: customer,
    },
  });

  return ok({ url: resposta.data.url }, { requestId });
}
