/**
 * GET    /api/v1/automatic-sales/campaigns/[id] — a campanha.
 * PATCH  /api/v1/automatic-sales/campaigns/[id] — pausar/retomar e editar.
 * DELETE /api/v1/automatic-sales/campaigns/[id] — encerra (apaga fila e eventos
 *        por cascata da FK: a fila é MEIO, não histórico contábil — quem quer
 *        o passado guarda o relatório exportado).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { campanhaVaUpdateSchema } from "@/lib/venda-automatica/schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const LISTA =
  "id, nome, status, cidade, uf, categorias, limite_diario, janela_inicio, janela_fim, " +
  "oferta_produtos, perfil_abordagem, followup_horas, followup_textos, responsavel_user_id, created_at";

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "automatic_sales_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automatic_sales_campaigns")
    .select(LISTA)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();

  if (error || !data) return fail("not_found", "Campanha não encontrada.", 404, { requestId });
  return ok(data, { requestId });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "automatic_sales_campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = campanhaVaUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error?.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automatic_sales_campaigns")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id")
    .single();

  if (error || !data) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "automatic_sales.campaign_updated",
    resourceType: "automatic_sales_campaign",
    resourceId: id,
    metadata: { campos: Object.keys(parsed.data) },
    requestId,
  });

  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "automatic_sales_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automatic_sales_campaigns")
    .delete()
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id")
    .maybeSingle();

  if (error || !data) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "automatic_sales.campaign_deleted",
    resourceType: "automatic_sales_campaign",
    resourceId: id,
    requestId,
  });

  return ok({ id }, { requestId });
}
