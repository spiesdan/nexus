/**
 * GET/POST /api/v1/inventory/movements — razão do estoque (NEXUS §46).
 *
 * POST registra entrada/saída/ajuste manual e atualiza o saldo cacheado
 * (`catalog_products.quantidade`) na mesma chamada: razão sem saldo e
 * saldo sem razão divergem em silêncio. Saída além do saldo: 422
 * (estoque insuficiente) — negativo só via ajuste explícito com motivo.
 * Leitura viewer+, escrita agent+, auditoria por movimento.
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

const movimentoSchema = z.object({
  product_id: z.string().uuid(),
  tipo: z.enum(["entrada", "saida", "ajuste"]),
  // entrada/saída: > 0. ajuste: delta com sinal, != 0.
  quantidade: z.number().int().refine((n) => n !== 0, "quantidade não pode ser zero"),
  observacao: z.string().trim().max(500).optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "inventory_movements" });
  if (!authz.ok) return authz.response;

  const productId = req.nextUrl.searchParams.get("product_id")?.trim() ?? "";
  const tipo = req.nextUrl.searchParams.get("tipo")?.trim() ?? "";
  const supabase = await createClient();
  let q = supabase
    .from("inventory_movements")
    .select("id, product_id, tipo, quantidade, origem, observacao, created_by, created_at")
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (productId) q = q.eq("product_id", productId);
  if (tipo !== "" && ["entrada", "saida", "ajuste"].includes(tipo)) q = q.eq("tipo", tipo);
  const { data, error } = await q;
  if (error) return fail("internal_error", "Erro ao listar movimentos.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "inventory_movements" });
  if (!authz.ok) return authz.response;

  let input;
  try {
    input = await validateRequest(movimentoSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }
  if (input.tipo !== "ajuste" && input.quantidade <= 0) {
    return fail("validation_failed", "entrada/saída pede quantidade positiva.", 422, { requestId });
  }

  const supabase = await createClient();
  const orgId = authz.org.orgId;
  const { data: produto, error: erroProd } = await supabase
    .from("catalog_products")
    .select("id, quantidade, controla_estoque")
    .eq("organization_id", orgId)
    .eq("id", input.product_id)
    .maybeSingle();
  if (erroProd) return fail("internal_error", "Erro ao ler o produto.", 500, { requestId });
  const prod = produto as unknown as { id: string; quantidade: number; controla_estoque: boolean } | null;
  if (!prod) return fail("not_found", "Produto não encontrado.", 404, { requestId });
  if (!prod.controla_estoque) {
    return fail("validation_failed", "Produto não controla estoque.", 422, { requestId });
  }

  const delta = input.tipo === "saida" ? -input.quantidade : input.quantidade;
  const novoSaldo = prod.quantidade + delta;
  if (novoSaldo < 0) {
    return fail("validation_failed", `Estoque insuficiente (saldo ${prod.quantidade}). Use ajuste com motivo para corrigir.`, 422, {
      requestId,
    });
  }

  const { data: mov, error: erroMov } = await supabase
    .from("inventory_movements")
    .insert({
      organization_id: orgId,
      product_id: input.product_id,
      tipo: input.tipo,
      quantidade: input.quantidade,
      origem: "manual",
      observacao: input.observacao ?? null,
      created_by: authz.user.id,
    })
    .select("id, product_id, tipo, quantidade, origem, observacao, created_at")
    .single();
  if (erroMov || !mov) return fail("internal_error", "Erro ao registrar o movimento.", 500, { requestId });

  const { error: erroSaldo } = await supabase
    .from("catalog_products")
    .update({ quantidade: novoSaldo })
    .eq("organization_id", orgId)
    .eq("id", input.product_id);
  if (erroSaldo) return fail("internal_error", "Movimento registrado, mas o saldo não atualizou — confira o produto.", 500, { requestId });

  await audit({
    action: "inventory.movement",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "product",
    resourceId: input.product_id,
    requestId,
    metadata: { tipo: input.tipo, quantidade: input.quantidade, saldo_anterior: prod.quantidade, saldo_novo: novoSaldo },
  });
  return ok({ ...mov, saldo_novo: novoSaldo }, { requestId, status: 201 });
}
