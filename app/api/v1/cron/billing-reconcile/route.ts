/**
 * GET|POST /api/v1/cron/billing-reconcile — compara assinaturas locais × Stripe.
 *
 * Stripe fora ≠ pago e ≠ suspenso: cada divergência/falha vira
 * `billing_verifications` com retry. Nenhuma suspensão é decidida aqui.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { lerConfigStripe, stripeRequest } from "@/lib/billing/stripe";
import { registrarVerificacao, resolverVerificacao } from "@/lib/billing/verificacao";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface AssinaturaStripe {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const provided = bearer || req.headers.get("x-cron-secret")?.trim() || "";
  const aceitos = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean) as string[];
  if (aceitos.length === 0 || !provided || !aceitos.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const admin = createAdminClient();
  const cfg = lerConfigStripe();
  const { data: locais } = await admin.from("billing_subscriptions")
    .select("id, organization_id, stripe_subscription_id, status, current_period_end, cancel_at_period_end");
  let conferidas = 0;
  let divergentes = 0;
  let indisponiveis = 0;

  for (const local of locais ?? []) {
    const remota = await stripeRequest<AssinaturaStripe>(cfg, `/subscriptions/${encodeURIComponent(local.stripe_subscription_id)}`);
    if (!remota.ok) {
      indisponiveis++;
      await registrarVerificacao(admin, local.organization_id, "subscription_reconcile", local.id, remota.erro);
      continue;
    }
    const fimRemoto = remota.data.current_period_end ? new Date(remota.data.current_period_end * 1000).toISOString() : null;
    const divergiu =
      remota.data.status !== local.status ||
      (fimRemoto && local.current_period_end && new Date(fimRemoto).getTime() !== new Date(local.current_period_end).getTime());
    if (divergiu) {
      divergentes++;
      await admin.from("billing_subscriptions").update({
        status: remota.data.status,
        current_period_end: fimRemoto,
        cancel_at_period_end: remota.data.cancel_at_period_end ?? false,
        updated_at: new Date().toISOString(),
      }).eq("id", local.id);
    }
    await resolverVerificacao(admin, local.organization_id, "subscription_reconcile", local.id);
    conferidas++;
  }

  logger.info("[billing-reconcile.cron] tick", { requestId, conferidas, divergentes, indisponiveis });
  return ok({ conferidas, divergentes, indisponiveis }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> { return handle(req); }
export async function POST(req: NextRequest): Promise<Response> { return handle(req); }
