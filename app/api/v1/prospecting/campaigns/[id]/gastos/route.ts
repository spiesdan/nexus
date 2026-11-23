/**
 * GET/POST /api/v1/prospecting/campaigns/[id]/gastos — mídia lançada à mão.
 *
 * Tabela `prospecting_campaign_spend` (0337). LANÇAMENTO MANUAL até existir
 * Marketing API: nada é importado ou inferido. Leitura para `agent`, escrita
 * para `manager`, com auditoria do autor. `organization_id` vem da sessão,
 * nunca do corpo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD"),
  valor_cents: z.number().int().min(1, "valor precisa ser positivo").max(2_000_000_000),
  observacao: z.string().trim().max(500).optional().default(""),
});

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Contexto): Promise<Response> {
  const requestId = randomUUID();
  const autorizado = await requireRole("agent", { requestId, resource: "prospecting_campaign_spend" });
  if (!autorizado.ok) return autorizado.response;
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospecting_campaign_spend")
    .select("id, data, valor_cents, observacao, autor_id, created_at")
    .eq("organization_id", autorizado.org.orgId)
    .eq("campaign_id", id)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok({ lancamentos: data ?? [] }, { requestId });
}

export async function POST(req: NextRequest, ctx: Contexto): Promise<Response> {
  const requestId = randomUUID();
  const autorizado = await requireRole("manager", { requestId, resource: "prospecting_campaign_spend" });
  if (!autorizado.ok) return autorizado.response;
  const { id } = await ctx.params;

  const lido = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success) {
    return fail("validation_failed", "Dados inválidos.", 422, { requestId });
  }

  const supabase = await createClient();
  const { data: campanha } = await supabase
    .from("prospecting_campaigns")
    .select("id")
    .eq("organization_id", autorizado.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!campanha) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

  const { data, error } = await supabase
    .from("prospecting_campaign_spend")
    .insert({
      organization_id: autorizado.org.orgId,
      campaign_id: id,
      data: lido.data.data,
      valor_cents: lido.data.valor_cents,
      observacao: lido.data.observacao,
      autor_id: autorizado.user.id,
    })
    .select("id, data, valor_cents, observacao, autor_id, created_at")
    .single();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    organizationId: autorizado.org.orgId,
    actorUserId: autorizado.user.id,
    action: "campaign.spend.created",
    resourceType: "prospecting_campaign_spend",
    resourceId: data.id,
    requestId,
    metadata: { campaign_id: id, valor_cents: data.valor_cents, data: data.data },
  });
  return ok({ lancamento: data }, { status: 201, requestId });
}
