/**
 * GET /api/v1/financeiro/fluxo — fluxo de caixa projetado (§51).
 *
 * `?dias=60`: a vencer por dia (recebíveis com saldo via
 * `financial_payments` − pagáveis em aberto) + estoque vencido.
 * Leitura pura via RLS de sessão, `organization_id` explícito.
 * Pagável parcial usa o valor cheio (sem baixa parcial rastreada —
 * fase futura, documentado na rota de pagáveis).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { montarFluxo, type TituloAberto } from "@/lib/finance/fluxo";

export const dynamic = "force-dynamic";

const TETO = 5000;

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "financial_receivables" });
  if (!authz.ok) return authz.response;

  const diasParam = Number(req.nextUrl.searchParams.get("dias") ?? "60");
  const dias = Number.isFinite(diasParam) ? Math.min(180, Math.max(1, Math.trunc(diasParam))) : 60;

  const supabase = await createClient();
  const orgId = authz.org.orgId;

  const { data: recs, error: erroRecs } = await supabase
    .from("financial_receivables")
    .select("id, valor_original_cents, vencimento, status")
    .eq("organization_id", orgId)
    .in("status", ["aberto", "parcial"])
    .order("vencimento", { ascending: true })
    .limit(TETO);
  if (erroRecs) return fail("internal_error", "Erro ao ler os recebíveis.", 500, { requestId });
  const recebiveis = (recs ?? []) as { id: string; valor_original_cents: number; vencimento: string; status: string }[];

  // Saldo dos parciais via pagamentos (molde da rota de recebíveis).
  const idsParciais = recebiveis.filter((r) => r.status === "parcial").map((r) => r.id);
  const pagosPorRecebivel = new Map<string, number>();
  for (let i = 0; i < idsParciais.length; i += 100) {
    const lote = idsParciais.slice(i, i + 100);
    if (lote.length === 0) continue;
    const { data: pags, error } = await supabase
      .from("financial_payments")
      .select("receivable_id, valor_cents")
      .eq("organization_id", orgId)
      .in("receivable_id", lote)
      .limit(TETO);
    if (error) return fail("internal_error", "Erro ao ler os pagamentos.", 500, { requestId });
    for (const p of (pags ?? []) as { receivable_id: string; valor_cents: number }[]) {
      pagosPorRecebivel.set(p.receivable_id, (pagosPorRecebivel.get(p.receivable_id) ?? 0) + p.valor_cents);
    }
  }
  const receber: TituloAberto[] = recebiveis.map((r) => ({
    vencimento: r.vencimento,
    saldo_cents: Math.max(0, r.valor_original_cents - (pagosPorRecebivel.get(r.id) ?? 0)),
  }));

  const { data: pags, error: erroPags } = await supabase
    .from("financial_pagaveis")
    .select("valor_original_cents, vencimento, status")
    .eq("organization_id", orgId)
    .in("status", ["aberto", "parcial"])
    .order("vencimento", { ascending: true })
    .limit(TETO);
  if (erroPags) return fail("internal_error", "Erro ao ler os pagáveis.", 500, { requestId });
  const pagar: TituloAberto[] = ((pags ?? []) as { valor_original_cents: number; vencimento: string }[]).map((p) => ({
    vencimento: p.vencimento,
    saldo_cents: p.valor_original_cents,
  }));

  const hoje = new Date().toISOString().slice(0, 10);
  return ok(
    { ...montarFluxo({ hoje, dias, receber, pagar }), amostra_parcial: recebiveis.length >= TETO || (pags ?? []).length >= TETO },
    { requestId },
  );
}
