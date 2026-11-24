/**
 * GET|POST /api/v1/cron/billing-notices — avisos D-3/D-2/D-1 por fatura.
 *
 * Sem retroativo: só etapas cuja data ainda não passou. `billing_notices`
 * tem unique(invoice_id, etapa), então reexecutar não reenvia. Fatura paga ou
 * cancelada tem as pendências canceladas antes de qualquer disparo.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { lerConfiguracaoBilling } from "@/lib/billing/config";
import { etapasPendentes } from "@/lib/billing/notices";
import { sendEmail } from "@/lib/email/resend";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
  const agora = new Date();
  const dias = lerConfiguracaoBilling().noticeDias;
  const destinatario = process.env.BILLING_NOTICE_EMAIL || "";
  const { data: faturas } = await admin
    .from("billing_invoices")
    .select("id, organization_id, due_at, status, numero, amount_cents, currency")
    .in("status", ["open", "unpaid", "action_required"])
    .gte("due_at", new Date(agora.getTime() - 86_400_000).toISOString())
    .lte("due_at", new Date(agora.getTime() + (Math.max(...dias) + 1) * 86_400_000).toISOString());

  let enviadas = 0;
  for (const fatura of faturas ?? []) {
    if (!fatura.due_at) continue;
    const { data: anteriores } = await admin.from("billing_notices").select("etapa, resultado")
      .eq("invoice_id", fatura.id);
    const jaEnviadas = new Set((anteriores ?? []).filter((n) => n.resultado === "enviado").map((n) => n.etapa));
    const pendentes = etapasPendentes(new Date(fatura.due_at), agora, jaEnviadas);
    for (const etapa of pendentes) {
      const detalhe = `Fatura ${fatura.numero ?? fatura.id} vence em ${new Date(fatura.due_at).toISOString().slice(0, 10)}.`;
      let resultado = "sem_destinatario";
      if (destinatario) {
        const envio = await sendEmail({
          to: destinatario,
          subject: `Fatura vence em ${etapa} dia(s)`,
          text: detalhe,
          html: `<p>${detalhe}</p>`,
          idempotencyKey: `billing-${fatura.id}-${etapa}`,
        });
        resultado = envio.ok ? "enviado" : "falhou";
      }
      const { error } = await admin.from("billing_notices").insert({
        organization_id: fatura.organization_id,
        invoice_id: fatura.id,
        etapa,
        // Uma linha por etapa (unique invoice_id,etapa). O in-app é a própria
        // linha, lida pela tela; o e-mail é o canal externo adicional.
        canal: "email+in_app",
        enviado_em: resultado === "enviado" ? new Date().toISOString() : null,
        resultado,
        detalhe,
      });
      // O in-app é a própria linha em billing_notices (a tela lê dela).
      if (!error && resultado === "enviado") enviadas++;
    }
  }
  logger.info("[billing-notices.cron] tick", { requestId, faturas: faturas?.length ?? 0, enviadas });
  return ok({ faturas: faturas?.length ?? 0, enviadas }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> { return handle(req); }
export async function POST(req: NextRequest): Promise<Response> { return handle(req); }
