/**
 * GET|POST /api/v1/cron/billing-reconcile — compara assinaturas locais × Stripe.
 *
 * Stripe fora ≠ pago e ≠ suspenso: cada divergência/falha vira
 * `billing_verifications` com retry. Nenhuma suspensão é decidida aqui.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { isoDoPeriodo, periodoDaAssinatura, vencimentoEfetivo } from "@/lib/billing/periodo-assinatura";
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
  current_period_end?: number | null;
  current_period_start?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null; current_period_start?: number | null }> } | null;
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
  const impedimentos: string[] = [];

  for (const local of locais ?? []) {
    const remota = await stripeRequest<AssinaturaStripe>(cfg, `/subscriptions/${encodeURIComponent(local.stripe_subscription_id)}`);
    if (!remota.ok) {
      indisponiveis++;
      await registrarVerificacao(admin, local.organization_id, "subscription_reconcile", local.id, remota.erro);
      continue;
    }
    const periodo = periodoDaAssinatura(remota.data);
    const fimRemoto = isoDoPeriodo(periodo.fim);
    // NUNCA apagar data boa por ausência no payload: se o Stripe não trouxe
    // o período (topo nem item), o valor local permanece.
    const fimEfetivo = vencimentoEfetivo(fimRemoto, local.current_period_end);
    const divergiu =
      remota.data.status !== local.status ||
      (fimRemoto != null &&
        (!local.current_period_end ||
          new Date(fimRemoto).getTime() !== new Date(local.current_period_end).getTime()));
    if (divergiu) {
      divergentes++;
      const { error: erroAtualizacao } = await admin.from("billing_subscriptions").update({
        status: remota.data.status,
        ...(fimEfetivo !== null ? { current_period_end: fimEfetivo } : {}),
        cancel_at_period_end: remota.data.cancel_at_period_end ?? false,
        updated_at: new Date().toISOString(),
      }).eq("id", local.id);
      if (erroAtualizacao) impedimentos.push(erroAtualizacao.message);
    }
    await resolverVerificacao(admin, local.organization_id, "subscription_reconcile", local.id);
    conferidas++;
    if (periodo.origem === "ausente" && !local.current_period_end) {
      impedimentos.push("Stripe não devolveu current_period_end e não há valor local — verifique o Price no dashboard.");
    }
  }

  logger.info("[billing-reconcile.cron] tick", { requestId, conferidas, divergentes, indisponiveis, impedimentos });
  return ok({ conferidas, divergentes, indisponiveis, impedimentos }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> { return handle(req); }
export async function POST(req: NextRequest): Promise<Response> { return handle(req); }
