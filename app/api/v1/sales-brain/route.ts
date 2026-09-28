/**
 * GET /api/v1/sales-brain — recomendações operacionais sobre PEDIDOS REAIS.
 *
 * NEXUS 2.0 §26–§27: QUEM/porquê/quando/o-quê/como/próximo passo.
 * Deriva de `commercial_orders` a cada chamada (mesmo molde de
 * `radar-compras`): sem tabela própria, sem mock. Query params:
 * `?prioridade=alta|media|baixa`, `?limit=` (1..500, default 200).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { brainDoLote } from "@/lib/ai/sales-brain/batch";
import type { BrainRecomendacao } from "@/lib/ai/sales-brain/recommend";
import type { PedidoParaRadar } from "@/lib/comercial/radar-compras";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

/** O tipo vem da ROTA, não é redigitado no hook (contrato duplicado diverge). */
export type { BrainRecomendacao as SalesBrainItem } from "@/lib/ai/sales-brain/recommend";

export const dynamic = "force-dynamic";

const PRIORIDADES = ["alta", "media", "baixa"] as const;

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "commercial_orders" });
  if (!authz.ok) return authz.response;

  const prioridade = req.nextUrl.searchParams.get("prioridade")?.trim() ?? "";
  if (prioridade !== "" && !(PRIORIDADES as readonly string[]).includes(prioridade)) {
    return fail("validation_failed", "prioridade aceita: alta, media, baixa.", 422, { requestId });
  }
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? "200") || 200));
  const hoje = new Date().toISOString().slice(0, 10);

  const supabase = createAdminClient();
  const orgId = authz.org.orgId;
  const COLS = "id, contact_id, total_cents, status, origem, created_at";
  const TETO_LINHAS = 25000;

  const { count, error: erroContagem } = await supabase
    .from("commercial_orders")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (erroContagem) return fail("internal_error", "Erro ao ler os pedidos.", 500, { requestId });

  const total = Math.min(count ?? 0, TETO_LINHAS);
  const faixas: [number, number][] = [];
  for (let de = 0; de < total; de += 1000) faixas.push([de, Math.min(de + 999, total - 1)]);

  const paginas = await Promise.all(
    faixas.map(([de, ate]) =>
      supabase
        .from("commercial_orders")
        .select(COLS)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true })
        .range(de, ate),
    ),
  );
  const pedidos: PedidoParaRadar[] = [];
  for (const pg of paginas) {
    if (pg.error) return fail("internal_error", "Erro ao ler os pedidos.", 500, { requestId });
    for (const p of (pg.data ?? []) as unknown as {
      id: string;
      contact_id: string | null;
      total_cents: number;
      status: string;
      origem: string;
      created_at: string;
    }[]) {
      pedidos.push({
        id: p.id,
        contact_id: p.contact_id,
        total_cents: p.total_cents,
        status: p.status,
        origem: p.origem,
        dia: p.created_at.slice(0, 10),
      });
    }
  }

  // `brainDoLote` já filtra null na hora, mas o tipo herda `| null` de
  // `recomendar` — estreita aqui para o resto da rota ficar tipado limpo.
  const recs = brainDoLote(pedidos, hoje).filter((r): r is BrainRecomendacao => r !== null);
  const filtradas = (prioridade ? recs.filter((r) => r.prioridade === prioridade) : recs).slice(
    0,
    limit,
  );

  // Nome do cliente (exibição) — join defensivo em `contacts`. admin client
  // bypassa RLS, então o filtro de organization_id é OBRIGATÓRIO aqui.
  const ids = [...new Set(filtradas.map((r) => r.contact_id))];
  const nomes: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: contatos, error: erroContatos } = await supabase
      .from("contacts")
      .select("id, display_name")
      .eq("organization_id", orgId)
      .in("id", ids);
    if (!erroContatos) {
      for (const c of (contatos ?? []) as { id: string; display_name: string | null }[]) {
        const nome = c.display_name?.trim();
        if (nome) nomes[c.id] = nome;
      }
    }
    // Sem nome: o card usa o id curto — não derruba a tela por isso.
  }

  return ok(
    filtradas.map((r) => ({ ...r, contact_name: nomes[r.contact_id] ?? null })),
    { requestId },
  );
}
