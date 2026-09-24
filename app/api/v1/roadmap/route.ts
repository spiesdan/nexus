/**
 * GET /api/v1/roadmap — Sales Roadmap anual (§55).
 *
 * `?ano=2026`: 12 meses com realizado (pedidos reais), meta da loja
 * (`commercial_goals`) e projeção do mês em andamento (método declarado).
 * Leitura pura via RLS de sessão, `organization_id` explícito.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { contaComoVenda } from "@/lib/comercial/dashboard";
import { montarRoadmap } from "@/lib/comercial/roadmap";
import { projetarVendas, type EntradaProjecao } from "@/lib/comercial/projecao";

export const dynamic = "force-dynamic";

const ANO = /^[0-9]{4}$/;
const TETO_LINHAS = 25000;

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "commercial_orders" });
  if (!authz.ok) return authz.response;

  const ano = req.nextUrl.searchParams.get("ano")?.trim() ?? new Date().getFullYear().toString();
  if (!ANO.test(ano) || Number(ano) < 2000 || Number(ano) > 2100) {
    return fail("validation_failed", "ano aceita: AAAA (2000–2100).", 422, { requestId });
  }
  const supabase = await createClient();
  const orgId = authz.org.orgId;
  const hoje = new Date().toISOString().slice(0, 10);
  const mesAtual = hoje.slice(0, 7);

  const { data: pedidos, error: erroPedidos } = await supabase
    .from("commercial_orders")
    .select("total_cents, status, created_at")
    .eq("organization_id", orgId)
    .gte("created_at", `${ano}-01-01`)
    .lt("created_at", `${Number(ano) + 1}-01-01`)
    .order("created_at", { ascending: true })
    .limit(TETO_LINHAS);
  if (erroPedidos) return fail("internal_error", "Erro ao ler os pedidos.", 500, { requestId });
  const linhas = (pedidos ?? []) as { total_cents: number; status: string; created_at: string }[];
  const parcial = linhas.length >= TETO_LINHAS;

  const realizadoPorMes = new Map<string, number>();
  const diarioAtual = new Map<string, number>();
  const historicoDiario: number[] = [];
  const historicoDow: number[] = [];
  for (const p of linhas) {
    if (!contaComoVenda(p.status)) continue;
    const dia = p.created_at.slice(0, 10);
    realizadoPorMes.set(dia.slice(0, 7), (realizadoPorMes.get(dia.slice(0, 7)) ?? 0) + p.total_cents);
    if (dia.slice(0, 7) === mesAtual) diarioAtual.set(dia, (diarioAtual.get(dia) ?? 0) + p.total_cents);
  }
  // Histórico diário (90 dias antes de hoje) para o método histórico.
  const baseMs = new Date(`${hoje}T12:00:00Z`).getTime();
  const porDia = new Map<string, number>();
  for (const p of linhas) {
    if (!contaComoVenda(p.status)) continue;
    const dia = p.created_at.slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + p.total_cents);
  }
  for (let i = 89; i >= 1; i--) {
    const d = new Date(baseMs - i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    historicoDiario.push(porDia.get(iso) ?? 0);
    historicoDow.push(d.getUTCDay());
  }

  const { data: metas, error: erroMetas } = await supabase
    .from("commercial_goals")
    .select("ano_mes, valor_cents")
    .eq("organization_id", orgId)
    .like("ano_mes", `${ano}-%`)
    .is("vendedor_user_id", null);
  if (erroMetas) return fail("internal_error", "Erro ao ler as metas.", 500, { requestId });
  const metaPorMes = new Map<string, number | null>();
  for (const m of (metas ?? []) as { ano_mes: string; valor_cents: number }[]) {
    metaPorMes.set(m.ano_mes, m.valor_cents);
  }

  // Projeção só quando o ano pedido contém o mês em andamento.
  let projecao: { projetado_cents: number; metodo: "sem_dados" | "ritmo" | "historico" } | null = null;
  if (mesAtual.startsWith(ano)) {
    const diasNoMes = new Date(Number(mesAtual.slice(0, 4)), Number(mesAtual.slice(5, 7)), 0).getDate();
    const diaHoje = Number(hoje.slice(8, 10));
    const diasRestantesDow: number[] = [];
    for (let d = diaHoje + 1; d <= diasNoMes; d++) {
      diasRestantesDow.push(new Date(Date.UTC(Number(ano), Number(mesAtual.slice(5, 7)) - 1, d)).getUTCDay());
    }
    const acumulado = [...diarioAtual.values()].reduce((s, v) => s + v, 0);
    const entrada: EntradaProjecao = {
      acumuladoCents: acumulado,
      diasTranscorridos: diaHoje,
      diasNoMes,
      diasRestantesDow,
      historicoDiario,
      historicoDow,
    };
    const r = projetarVendas(entrada);
    projecao = { projetado_cents: r.projetadoCents, metodo: r.metodo };
  }

  return ok({ ano, meses: montarRoadmap({ ano, mesAtual, realizadoPorMes, metaPorMes, projecaoMesAtual: projecao }), amostra_parcial: parcial }, { requestId });
}
