/**
 * POST /api/v1/webhooks/stripe — evento do ERP de cobrança.
 *
 * Assinatura sobre o CORPO BRUTO (antes de qualquer JSON.parse),
 * `stripe_event_id` único como idempotência, `evento_criado_em` para recusar
 * evento fora de ordem e `organization_id` resolvido por `billing_customers`
 * (ou pelo client_reference_id do checkout) — nunca por query string.
 */
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { lerConfigStripe, assinaturaValida } from "@/lib/billing/stripe";
import { deveSuspender, eventoEstaAtrasado, statusDaFatura } from "@/lib/billing/webhook-logica";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface EventoStripe {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor ? valor : null;
}

export async function POST(req: NextRequest): Promise<Response> {
  const corpo = await req.text();
  const cfg = lerConfigStripe();
  const assinatura = req.headers.get("stripe-signature") ?? "";
  if (!assinaturaValida({ corpo, assinatura, segredo: cfg.webhookSecret })) {
    return fail("unauthorized", "Assinatura Stripe inválida.", 401);
  }

  let evento: EventoStripe;
  try {
    evento = JSON.parse(corpo) as EventoStripe;
  } catch {
    return fail("invalid_json", "Corpo do evento inválido.", 400);
  }
  if (!evento?.id || !evento?.type) return fail("invalid_request", "Evento sem id/tipo.", 400);

  const admin = createAdminClient();
  const hash = createHash("sha256").update(corpo).digest("hex");
  const criadoEm = new Date(evento.created * 1000);
  const objeto = evento.data?.object ?? {};

  // Idempotência: insert com unique em stripe_event_id. Duplicata é SUCESSO
  // (o Stripe reenvia), não erro e não reaplicação.
  const { data: gravado, error: erroEvento } = await admin
    .from("billing_events")
    .insert({
      stripe_event_id: evento.id,
      tipo: evento.type,
      payload_hash: hash,
      organization_id: null,
      evento_criado_em: Number.isFinite(criadoEm.getTime()) ? criadoEm.toISOString() : null,
    })
    .select("id")
    .maybeSingle();
  if (erroEvento?.code === "23505") return ok({ duplicado: true });
  if (erroEvento || !gravado) return fail("internal_error", erroEvento?.message ?? "falha ao gravar evento", 500);

  // Ordem: tipo já aplicado mais novo que este ⇒ marca e NÃO reaplica.
  const { data: anterior } = await admin
    .from("billing_events")
    .select("evento_criado_em")
    .eq("tipo", evento.type)
    .eq("fora_de_ordem", false)
    .neq("id", gravado.id)
    .order("evento_criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eventoEstaAtrasado(criadoEm, anterior?.evento_criado_em ? new Date(anterior.evento_criado_em) : null)) {
    await admin.from("billing_events").update({ fora_de_ordem: true }).eq("id", gravado.id);
    return ok({ fora_de_ordem: true });
  }

  const customerId = texto(objeto.customer);
  const metadata = (objeto.metadata ?? {}) as Record<string, unknown>;
  const orgId =
    texto(metadata.organization_id) ??
    texto(objeto.client_reference_id) ??
    (customerId ? (await admin.from("billing_customers").select("organization_id").eq("stripe_customer_id", customerId).maybeSingle()).data?.organization_id ?? null : null);
  if (!orgId) return ok({ sem_organizacao: true });
  await admin.from("billing_events").update({ organization_id: orgId }).eq("id", gravado.id);

  switch (evento.type) {
    case "checkout.session.completed": {
      const sessaoId = texto(objeto.id);
      if (sessaoId) {
        await admin.from("billing_checkout_sessions").update({ used_at: new Date().toISOString(), status: "completed" })
          .eq("stripe_session_id", sessaoId).eq("organization_id", orgId);
      }
      if (customerId) {
        await admin.from("billing_customers").upsert({
          organization_id: orgId, stripe_customer_id: customerId, status: "ativo", updated_at: new Date().toISOString(),
        }, { onConflict: "stripe_customer_id" });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const id = texto(objeto.id);
      if (id) {
        await admin.from("billing_subscriptions").update({
          status: evento.type === "customer.subscription.deleted" ? "canceled" : (texto(objeto.status) ?? "incomplete"),
          cancel_at_period_end: objeto.cancel_at_period_end === true,
          current_period_end: typeof objeto.current_period_end === "number"
            ? new Date(objeto.current_period_end * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        }).eq("stripe_subscription_id", id).eq("organization_id", orgId);
      }
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.payment_action_required": {
      const invoiceId = texto(objeto.id);
      const status = statusDaFatura(evento.type);
      if (invoiceId && status) {
        const { data: fatura } = await admin.from("billing_invoices").select("id, due_at")
          .eq("stripe_invoice_id", invoiceId).eq("organization_id", orgId).maybeSingle();
        if (fatura) {
          await admin.from("billing_invoices").update({
            status,
            paid_at: status === "paid" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          }).eq("id", fatura.id);
          if (status === "paid") {
            await admin.from("billing_notices").update({ resultado: "cancelado" })
              .eq("invoice_id", fatura.id).is("enviado_em", null);
          }
          if (deveSuspender(status, fatura.due_at ? new Date(fatura.due_at) : null, new Date())) {
            await admin.from("billing_suspensions").insert({
              organization_id: orgId, invoice_id: fatura.id, estado: "suspensa",
              motivo: "fatura_vencida_sem_pagamento", autor: "webhook_stripe", evento_id: gravado.id,
            });
          }
        }
      }
      break;
    }
    default:
      break;
  }

  await admin.from("billing_events").update({ processado_em: new Date().toISOString() }).eq("id", gravado.id);
  return ok({ processado: true, tipo: evento.type });
}
