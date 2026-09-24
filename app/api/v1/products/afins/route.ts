/**
 * GET /api/v1/products/afins — "quem compra X também compra Y" (§25, §45).
 *
 * `?carrinho=<id, id>` (product_ids no pedido em edição) + opcional
 * `?contact_id=` (recorrentes do cliente). Varredura limitada dos pedidos
 * recentes (`amostra_parcial` declarado); nomes resolvidos no catálogo.
 * Leitura pura via RLS de sessão, `organization_id` explícito.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { topCoocorrencia, topRecorrentes } from "@/lib/comercial/afins";

export const dynamic = "force-dynamic";

const LIMITE_PEDIDOS = 800;
const TETO_IDS_POR_LOTE = 100;

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "commercial_orders" });
  if (!authz.ok) return authz.response;

  const carrinho = (req.nextUrl.searchParams.get("carrinho") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
  const contactId = req.nextUrl.searchParams.get("contact_id")?.trim() ?? "";
  if (carrinho.length === 0 && !contactId) {
    return fail("validation_failed", "informe carrinho ou contact_id.", 422, { requestId });
  }

  const supabase = await createClient();
  const orgId = authz.org.orgId;

  // Pedidos recentes (para afinidade) — e do cliente (para recorrência).
  const { data: recentes, error: erroRecentes } = await supabase
    .from("commercial_orders")
    .select("id, contact_id")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(LIMITE_PEDIDOS);
  if (erroRecentes) return fail("internal_error", "Erro ao ler os pedidos.", 500, { requestId });
  const pedidos = (recentes ?? []) as { id: string; contact_id: string | null }[];
  const parcial = pedidos.length >= LIMITE_PEDIDOS;
  const idsRecentes = pedidos.map((p) => p.id);
  const idsDoCliente = contactId ? pedidos.filter((p) => p.contact_id === contactId).map((p) => p.id) : [];

  // Itens em lotes de 100 (IN grande morre no PostgREST — molde do radar).
  async function itensDe(orderIds: string[]): Promise<{ order_id: string; product_id: string | null }[]> {
    const todos: { order_id: string; product_id: string | null }[] = [];
    for (let i = 0; i < orderIds.length; i += TETO_IDS_POR_LOTE) {
      const lote = orderIds.slice(i, i + TETO_IDS_POR_LOTE);
      const { data, error } = await supabase
        .from("commercial_order_items")
        .select("order_id, product_id")
        .eq("organization_id", orgId)
        .in("order_id", lote);
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as { order_id: string; product_id: string | null }[]) {
        if (r.product_id) todos.push(r);
      }
    }
    return todos;
  }

  let itens: { order_id: string; product_id: string | null }[] = [];
  try {
    itens = await itensDe(idsRecentes);
  } catch {
    return fail("internal_error", "Erro ao ler os itens.", 500, { requestId });
  }
  const afins = topCoocorrencia(itens, carrinho, 5);

  let recorrentes: { product_id: string; vezes: number }[] = [];
  if (contactId && idsDoCliente.length > 0) {
    try {
      const itensCliente = await itensDe(idsDoCliente);
      const freq = new Map<string, number>();
      for (const it of itensCliente) {
        if (!it.product_id) continue;
        freq.set(it.product_id, (freq.get(it.product_id) ?? 0) + 1);
      }
      recorrentes = topRecorrentes(
        [...freq.entries()].map(([product_id, vezes]) => ({ product_id, vezes })),
        carrinho,
        5,
      );
    } catch {
      return fail("internal_error", "Erro ao ler os itens do cliente.", 500, { requestId });
    }
  }

  // Nomes do catálogo para os sugeridos.
  const idsSugeridos = [...new Set([...afins.map((a) => a.product_id), ...recorrentes.map((r) => r.product_id)])];
  const nomes = new Map<string, { nome: string; codigo: string; preco_cents: number }>();
  if (idsSugeridos.length > 0) {
    const { data: prods } = await supabase
      .from("catalog_products")
      .select("id, nome, codigo, preco_cents")
      .eq("organization_id", orgId)
      .in("id", idsSugeridos);
    for (const p of (prods ?? []) as { id: string; nome: string; codigo: string; preco_cents: number }[]) {
      nomes.set(p.id, { nome: p.nome, codigo: p.codigo, preco_cents: p.preco_cents });
    }
  }

  const comNome = (id: string) => nomes.get(id) ?? { nome: id.slice(0, 8), codigo: "—", preco_cents: 0 };
  return ok(
    {
      afins: afins.map((a) => ({ ...a, ...comNome(a.product_id) })),
      recorrentes: recorrentes.map((r) => ({ ...r, ...comNome(r.product_id) })),
      amostra: { pedidos_varridos: pedidos.length, amostra_parcial: parcial },
    },
    { requestId },
  );
}
