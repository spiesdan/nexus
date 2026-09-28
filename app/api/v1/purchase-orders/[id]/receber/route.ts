/**
 * POST /api/v1/purchase-orders/[id]/receber — entrada da compra no estoque.
 *
 * `{ itens: [{ item_id, quantidade }] }` (default: o restante de cada
 * item). Só com pedido `enviado`. Cada quantidade recebida vira movimento
 * `entrada` (origem compra) + soma no saldo; idempotente por
 * `recebido_qtd` (re-tick recebe só o que falta). Completo vira
 * `recebido` sozinho. Auditoria `purchase.received` com o lote.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const receberSchema = z.object({
  itens: z
    .array(
      z.object({
        item_id: z.string().uuid(),
        quantidade: z.number().int().min(1).max(100000),
      }),
    )
    .max(200)
    .optional(),
});

type ItemLinha = {
  id: string;
  product_id: string | null;
  produto_codigo: string;
  produto_nome: string;
  quantidade: number;
  recebido_qtd: number;
};

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "purchase_orders" });
  if (!authz.ok) return authz.response;

  let input;
  try {
    input = await validateRequest(receberSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const { id } = await params;
  const supabase = await createClient();
  const orgId = authz.org.orgId;

  const { data: pedido } = await supabase
    .from("purchase_orders")
    .select("id, numero, status")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  const st = (pedido as unknown as { numero: number; status: string } | null);
  if (!st) return fail("not_found", "Pedido de compra não encontrado.", 404, { requestId });
  if (st.status !== "enviado") {
    return fail("validation_failed", `Só pedido enviado recebe (atual: ${st.status}).`, 422, { requestId });
  }

  const { data: itensDb, error: erroItens } = await supabase
    .from("purchase_order_items")
    .select("id, product_id, produto_codigo, produto_nome, quantidade, recebido_qtd")
    .eq("organization_id", orgId)
    .eq("purchase_order_id", id);
  if (erroItens) return fail("internal_error", "Erro ao ler os itens.", 500, { requestId });
  const itens = (itensDb ?? []) as ItemLinha[];
  if (itens.length === 0) return fail("validation_failed", "Pedido sem itens.", 422, { requestId });

  const pedidoQtd = new Map((input.itens ?? []).map((i) => [i.item_id, i.quantidade]));
  const alvos = itens.map((it) => ({
    ...it,
    receber: Math.max(0, Math.min(it.quantidade - it.recebido_qtd, pedidoQtd.get(it.id) ?? it.quantidade - it.recebido_qtd)),
  }));
  if (alvos.every((a) => a.receber <= 0)) {
    return fail("validation_failed", "Nada a receber (itens já completos?).", 422, { requestId });
  }
  const idsProdutos = [...new Set(alvos.filter((a) => a.receber > 0 && a.product_id).map((a) => a.product_id as string))];
  const { data: prods } = await supabase
    .from("catalog_products")
    .select("id, quantidade, controla_estoque")
    .eq("organization_id", orgId)
    .in("id", idsProdutos.length > 0 ? idsProdutos : ["00000000-0000-0000-0000-000000000000"]);
  const saldos = new Map(
    ((prods ?? []) as { id: string; quantidade: number; controla_estoque: boolean }[]).map((p) => [p.id, p]),
  );

  let recebidos = 0;
  for (const a of alvos) {
    if (a.receber <= 0 || !a.product_id) continue;
    const saldo = saldos.get(a.product_id);
    if (!saldo || !saldo.controla_estoque) continue;
    const novoSaldo = saldo.quantidade + a.receber;
    const [{ error: erroMov }, { error: erroSaldo }, { error: erroItem }] = await Promise.all([
      supabase.from("inventory_movements").insert({
        organization_id: orgId,
        product_id: a.product_id,
        tipo: "entrada",
        quantidade: a.receber,
        origem: "compra",
        purchase_order_id: id,
        observacao: `Recebimento compra ${(pedido as unknown as { numero: number }).numero}`,
        created_by: authz.user.id,
      }),
      supabase.from("catalog_products").update({ quantidade: novoSaldo }).eq("organization_id", orgId).eq("id", a.product_id),
      supabase
        .from("purchase_order_items")
        .update({ recebido_qtd: a.recebido_qtd + a.receber })
        .eq("organization_id", orgId)
        .eq("id", a.id),
    ]);
    if (erroMov || erroSaldo || erroItem) {
      return fail("internal_error", `Falha ao receber ${a.produto_codigo} — confira o pedido antes de repetir.`, 500, {
        requestId,
      });
    }
    saldos.set(a.product_id, { ...saldo, quantidade: novoSaldo });
    recebidos += 1;
  }
  if (recebidos === 0) {
    return fail("validation_failed", "Nenhum item elegível (sem produto vivo com estoque).", 422, { requestId });
  }

  // Completo = soma(recebido) >= soma(pedido): reconta com precisão.
  const { data: totais } = await supabase
    .from("purchase_order_items")
    .select("quantidade, recebido_qtd")
    .eq("organization_id", orgId)
    .eq("purchase_order_id", id);
  const ped = ((totais ?? []) as { quantidade: number; recebido_qtd: number }[]).reduce(
    (s, i) => ({ q: s.q + i.quantidade, r: s.r + i.recebido_qtd }),
    { q: 0, r: 0 },
  );
  if (ped.r >= ped.q) {
    await supabase.from("purchase_orders").update({ status: "recebido" }).eq("organization_id", orgId).eq("id", id);
  }

  await audit({
    action: "purchase.received",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "purchase_order",
    resourceId: id,
    requestId,
    metadata: { itens_recebidos: recebidos, completo: ped.r >= ped.q },
  });
  return ok({ itens_recebidos: recebidos, completo: ped.r >= ped.q }, { requestId });
}
