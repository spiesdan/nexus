/**
 * PATCH/DELETE /api/v1/prospecting/campaigns/[id]/gastos/[spendId].
 *
 * Só `manager`. O `organization_id` vem da sessão; o `spendId` é conferido
 * com `.eq("organization_id")` e `.eq("campaign_id")` antes de mexer.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  valor_cents: z.number().int().min(1).max(2_000_000_000).optional(),
  observacao: z.string().trim().max(500).optional(),
});

type Contexto = { params: Promise<{ id: string; spendId: string }> };

export async function PATCH(req: NextRequest, ctx: Contexto): Promise<Response> {
  const requestId = randomUUID();
  const autorizado = await requireRole("manager", { requestId, resource: "prospecting_campaign_spend" });
  if (!autorizado.ok) return autorizado.response;
  const { id, spendId } = await ctx.params;

  const lido = patchSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success || Object.keys(lido.data).length === 0) {
    return fail("validation_failed", "Dados inválidos.", 422, { requestId });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospecting_campaign_spend")
    .update(lido.data)
    .eq("id", spendId)
    .eq("campaign_id", id)
    .eq("organization_id", autorizado.org.orgId)
    .select("id, data, valor_cents, observacao, autor_id, created_at")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", "Lançamento não encontrado.", 404, { requestId });

  void audit({
    organizationId: autorizado.org.orgId,
    actorUserId: autorizado.user.id,
    action: "campaign.spend.updated",
    resourceType: "prospecting_campaign_spend",
    resourceId: data.id,
    requestId,
    metadata: { campaign_id: id, ...lido.data },
  });
  return ok({ lancamento: data }, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: Contexto): Promise<Response> {
  const requestId = randomUUID();
  const autorizado = await requireRole("manager", { requestId, resource: "prospecting_campaign_spend" });
  if (!autorizado.ok) return autorizado.response;
  const { id, spendId } = await ctx.params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospecting_campaign_spend")
    .delete()
    .eq("id", spendId)
    .eq("campaign_id", id)
    .eq("organization_id", autorizado.org.orgId)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", "Lançamento não encontrado.", 404, { requestId });

  void audit({
    organizationId: autorizado.org.orgId,
    actorUserId: autorizado.user.id,
    action: "campaign.spend.deleted",
    resourceType: "prospecting_campaign_spend",
    resourceId: data.id,
    requestId,
    metadata: { campaign_id: id },
  });
  return ok({ removido: true }, { requestId });
}
