/**
 * GET/POST /api/v1/purchase-orders — pedidos de compra (NEXUS §47).
 *
 * Número atômico por org (`fn_proximo_numero_compra`, sessão do usuário —
 * call site declarado no gate de definers). Itens com snapshot de
 * código/nome + subtotal. Nasce `rascunho`; recebe pelo `/receber`.
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

const itemSchema = z.object({
  product_id: z.string().uuid(),
  quantidade: z.number().int().min(1).max(100000),
  custo_unit_cents: z.number().int().min(0).max(1000000000),
});

const compraSchema = z.object({
  supplier_id: z.string().uuid().nullable().optional(),
  observacoes: z.string().trim().max(2000).optional(),
  itens: z.array(itemSchema).min(1).max(200),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "purchase_orders" });
  if (!authz.ok) return authz.response;

  const status = req.nextUrl.searchParams.get("status")?.trim() ?? "";
  const supabase = await createClient();
  let q = supabase
    .from("purchase_orders")
    .select("id, numero, supplier_id, status, observacoes, created_at, updated_at")
    .eq("organization_id", authz.org.orgId)
    .order("numero", { ascending: false })
    .limit(200);
  if (status !== "" && ["rascunho", "enviado", "recebido", "cancelado"].includes(status)) {
    q = q.eq("status", status);
  }
  const { data, error } = await q;
  if (error) return fail("internal_error", "Erro ao listar compras.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "purchase_orders" });
  if (!authz.ok) return authz.response;

  let input;
  try {
    input = await validateRequest(compraSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const supabase = await createClient();
  const orgId = authz.org.orgId;

  if (input.supplier_id) {
    const { data: forn } = await supabase
      .from("suppliers")
      .select("id")
      .eq("organization_id", orgId)
      .eq("id", input.supplier_id)
      .maybeSingle();
    if (!forn) return fail("validation_failed", "Fornecedor não existe nesta organização.", 422, { requestId });
  }

  const idsProdutos = [...new Set(input.itens.map((i) => i.product_id))];
  const { data: prods, error: erroProds } = await supabase
    .from("catalog_products")
    .select("id, codigo, nome")
    .eq("organization_id", orgId)
    .in("id", idsProdutos);
  if (erroProds) return fail("internal_error", "Erro ao ler os produtos.", 500, { requestId });
  const porId = new Map(((prods ?? []) as { id: string; codigo: string; nome: string }[]).map((p) => [p.id, p]));
  for (const pid of idsProdutos) {
    if (!porId.has(pid)) return fail("validation_failed", "Um dos produtos não existe.", 422, { requestId });
  }

  // Contador atômico com a sessão do usuário (a função confere membership).
  const { data: numero, error: erroNum } = await supabase.rpc("fn_proximo_numero_compra", { p_org: orgId });
  if (erroNum || typeof numero !== "number") {
    return fail("internal_error", "Erro ao numerar o pedido de compra.", 500, { requestId });
  }

  const { data: pedido, error: erroPed } = await supabase
    .from("purchase_orders")
    .insert({
      organization_id: orgId,
      numero: numero,
      supplier_id: input.supplier_id ?? null,
      observacoes: input.observacoes ?? null,
      created_by: authz.user.id,
    })
    .select("id, numero, supplier_id, status")
    .single();
  if (erroPed || !pedido) return fail("internal_error", "Erro ao criar o pedido de compra.", 500, { requestId });
  const pedidoId = (pedido as unknown as { id: string }).id;

  const linhas = input.itens.map((i) => {
    const p = porId.get(i.product_id) as { codigo: string; nome: string };
    return {
      organization_id: orgId,
      purchase_order_id: pedidoId,
      product_id: i.product_id,
      produto_codigo: p.codigo,
      produto_nome: p.nome,
      quantidade: i.quantidade,
      custo_unit_cents: i.custo_unit_cents,
      subtotal_cents: i.quantidade * i.custo_unit_cents,
    };
  });
  const { error: erroItens } = await supabase.from("purchase_order_items").insert(linhas);
  if (erroItens) return fail("internal_error", "Pedido criado, mas os itens falharam — confira e recrie.", 500, { requestId });

  await audit({
    action: "purchase.created",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "purchase_order",
    resourceId: pedidoId,
    requestId,
    metadata: { numero, itens: linhas.length },
  });
  return ok({ ...pedido, itens: linhas.length }, { requestId, status: 201 });
}
