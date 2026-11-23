/**
 * PATCH/DELETE /api/v1/payment-methods/[id] — editar e desativar forma/prazo.
 *
 * DELETE é desativação (`ativo = false`), não apagão: o histórico de pedidos
 * continua podendo dizer qual era a configuração daquele dia. A org vem da
 * sessão, nunca do corpo; o id é conferido com `.eq("organization_id", ...)`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { FORMAS_DE_PAGAMENTO } from "@/lib/schemas/fiscal";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  nome: z.string().trim().min(2).max(120).optional(),
  tpag: z.enum(FORMAS_DE_PAGAMENTO).nullable().optional(),
  dias_prazo: z.number().int().min(0).max(365).nullable().optional(),
  ativo: z.boolean().optional(),
});

type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Contexto): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  const autorizado = await requireRole("manager", { requestId, resource: "payment_methods" });
  if (!autorizado.ok) return autorizado.response;
  const { id } = await ctx.params;

  const lido = patchSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success) return fail("validation_failed", "Dados inválidos.", 422, { requestId });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commercial_payment_methods")
    .update(lido.data)
    .eq("id", id)
    .eq("organization_id", autorizado.org.orgId)
    .select("id, tipo, codigo, nome, tpag, dias_prazo, ativo")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", "Forma de pagamento não encontrada.", 404, { requestId });

  void audit({
    action: "settings.payment_method.updated",
    actorUserId: autorizado.user.id,
    organizationId: autorizado.org.orgId,
    requestId,
    resourceId: data.id,
    metadata: lido.data as Record<string, unknown>,
  });
  return ok({ payment_method: data }, { requestId });
}

export async function DELETE(req: NextRequest, ctx: Contexto): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  const autorizado = await requireRole("manager", { requestId, resource: "payment_methods" });
  if (!autorizado.ok) return autorizado.response;
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commercial_payment_methods")
    .update({ ativo: false })
    .eq("id", id)
    .eq("organization_id", autorizado.org.orgId)
    .select("id, codigo")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", "Forma de pagamento não encontrada.", 404, { requestId });

  void audit({
    action: "settings.payment_method.disabled",
    actorUserId: autorizado.user.id,
    organizationId: autorizado.org.orgId,
    requestId,
    resourceId: data.id,
    metadata: { codigo: data.codigo },
  });
  return ok({ desativado: true }, { requestId });
}
