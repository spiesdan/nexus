/**
 * GET/PATCH /api/v1/purchase-orders/[id] — detalhe + transições de status.
 *
 * rascunho → enviado | cancelado; enviado → cancelado. Receber é pelo
 * `/receber` (que vira `recebido` sozinho quando completa).
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

const statusSchema = z.object({
  status: z.enum(["enviado", "cancelado"]),
});

async function detalhe(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, id: string) {
  const { data: pedido } = await supabase
    .from("purchase_orders")
    .select("id, numero, supplier_id, status, observacoes, created_at, updated_at")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!pedido) return null;
  const { data: itens } = await supabase
    .from("purchase_order_items")
    .select("id, product_id, produto_codigo, produto_nome, quantidade, recebido_qtd, custo_unit_cents, subtotal_cents")
    .eq("organization_id", orgId)
    .eq("purchase_order_id", id)
    .order("created_at", { ascending: true });
  return { ...(pedido as Record<string, unknown>), itens: itens ?? [] };
}

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "purchase_orders" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const d = await detalhe(supabase, authz.org.orgId, id);
  if (!d) return fail("not_found", "Pedido de compra não encontrado.", 404, { requestId });
  return ok(d, { requestId });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "purchase_orders" });
  if (!authz.ok) return authz.response;

  let input;
  try {
    input = await validateRequest(statusSchema, req);
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
  const { data: atual } = await supabase
    .from("purchase_orders")
    .select("id, status")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  const st = (atual as unknown as { status: string } | null)?.status;
  if (!st) return fail("not_found", "Pedido de compra não encontrado.", 404, { requestId });
  // Recebido/cancelado é histórico; enviado só cancela.
  if (st !== "rascunho" && !(st === "enviado" && input.status === "cancelado")) {
    return fail("validation_failed", `Pedido ${st} não muda para ${input.status}.`, 422, { requestId });
  }

  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: input.status })
    .eq("organization_id", orgId)
    .eq("id", id);
  if (error) return fail("internal_error", "Erro ao atualizar o pedido.", 500, { requestId });

  await audit({
    action: "purchase.status",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "purchase_order",
    resourceId: id,
    requestId,
    metadata: { de: st, para: input.status },
  });
  const d = await detalhe(supabase, orgId, id);
  return ok(d, { requestId });
}
