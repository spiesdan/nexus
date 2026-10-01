/**
 * GET /api/v1/automatic-sales/campaigns/[id]/queue — a fila da campanha.
 * Filtro opcional `?status=...` (um dos estados da migration 0246).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { STATUS_DA_FILA } from "@/lib/venda-automatica/tipos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const LISTA =
  "id, prospect_id, contact_id, conversation_id, lead_id, dia, status, interest_level, " +
  "followup_count, proximo_followup_at, ultima_mensagem_at, rejection_reason, snapshot, created_at";

export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "automatic_sales_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const status = req.nextUrl.searchParams.get("status");
  if (status !== null && !(STATUS_DA_FILA as readonly string[]).includes(status)) {
    return fail("validation_failed", "Status inválido.", 422, { requestId });
  }

  const supabase = await createClient();
  let q = supabase
    .from("automatic_sales_queue")
    .select(LISTA)
    .eq("organization_id", authz.org.orgId)
    .eq("campaign_id", id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (status !== null) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return fail("internal_error", "Erro ao listar a fila.", 500, { requestId });
  return ok(data ?? [], { requestId });
}
