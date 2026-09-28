/**
 * GET /api/v1/inventory/sugestoes — sugestão de compra (§47).
 *
 * `?alvo_dias=14`: para cada produto com controle de estoque e giro
 * medido nos últimos 30 dias, cobertura e quantidade para recompor.
 * Saldo de `catalog_products`, saídas de `commercial_order_items`
 * (pedidos reais). Leitura pura via RLS de sessão, `organization_id`
 * explícito. Movimentações auditadas pedem schema novo (FASE 6 parte 2).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { ordenarSugestoes, sugerirPara } from "@/lib/estoque/sugestao";

export const dynamic = "force-dynamic";

const JANELA_DIAS = 30;
const TETO_PEDIDOS = 2000;
const TETO_IDS_POR_LOTE = 100;
const TETO_PRODUTOS = 5000;

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "catalog_products" });
  if (!authz.ok) return authz.response;

  const alvoParam = Number(req.nextUrl.searchParams.get("alvo_dias") ?? "14");
  const alvoDias = Number.isFinite(alvoParam) ? Math.min(90, Math.max(1, Math.trunc(alvoParam))) : 14;

  const supabase = await createClient();
  const orgId = authz.org.orgId;
  const corte = new Date(Date.now() - JANELA_DIAS * 86400000).toISOString();

  const { data: produtos, error: erroProdutos } = await supabase
    .from("catalog_products")
    .select("id, codigo, nome, quantidade, controla_estoque, custo_cents")
    .eq("organization_id", orgId)
    .eq("ativo", true)
    .limit(TETO_PRODUTOS);
  if (erroProdutos) return fail("internal_error", "Erro ao ler os produtos.", 500, { requestId });
  const lista = (produtos ?? []) as {
    id: string;
    codigo: string;
    nome: string;
    quantidade: number;
    controla_estoque: boolean;
    custo_cents: number | null;
  }[];
  const parcialProdutos = lista.length >= TETO_PRODUTOS;

  const { data: pedidos, error: erroPedidos } = await supabase
    .from("commercial_orders")
    .select("id")
    .eq("organization_id", orgId)
    .gte("created_at", corte)
    .order("created_at", { ascending: false })
    .limit(TETO_PEDIDOS);
  if (erroPedidos) return fail("internal_error", "Erro ao ler os pedidos.", 500, { requestId });
  const idsPedidos = ((pedidos ?? []) as { id: string }[]).map((p) => p.id);
  const parcialPedidos = idsPedidos.length >= TETO_PEDIDOS;

  const saidas = new Map<string, number>();
  for (let i = 0; i < idsPedidos.length; i += TETO_IDS_POR_LOTE) {
    const lote = idsPedidos.slice(i, i + TETO_IDS_POR_LOTE);
    const { data: itens, error } = await supabase
      .from("commercial_order_items")
      .select("product_id, quantidade")
      .eq("organization_id", orgId)
      .in("order_id", lote);
    if (error) return fail("internal_error", "Erro ao ler os itens.", 500, { requestId });
    for (const it of (itens ?? []) as { product_id: string | null; quantidade: number }[]) {
      if (!it.product_id) continue;
      saidas.set(it.product_id, (saidas.get(it.product_id) ?? 0) + it.quantidade);
    }
  }

  const sugestoes = ordenarSugestoes(
    lista.flatMap((p) => {
      const s = sugerirPara(
        {
          product_id: p.id,
          quantidade: p.quantidade,
          saidas_janela: saidas.get(p.id) ?? 0,
          dias_janela: JANELA_DIAS,
          controla_estoque: p.controla_estoque,
          custo_unit_cents: p.custo_cents,
        },
        alvoDias,
      );
      return s ? [{ ...s, codigo: p.codigo, nome: p.nome, quantidade: p.quantidade }] : [];
    }),
  );

  return ok(
    {
      alvo_dias: alvoDias,
      janela_dias: JANELA_DIAS,
      sugestoes,
      amostra_parcial: parcialProdutos || parcialPedidos,
    },
    { requestId },
  );
}
