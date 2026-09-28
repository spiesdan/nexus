/**
 * GET   /api/v1/leads — busca de leads para a Global Search (§17) (handler de escrita em ./_handler.ts).
 * POST  /api/v1/leads — create lead (handler em ./_handler.ts).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createLeadSchema, validateRequest, type CreateLeadInput } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

import { createLeadHandler } from "./_handler";

export const dynamic = "force-dynamic";

/**
 * A busca do ⌘K e da página `/app/busca` precisa de uma porta de LEITURA para
 * `crm_leads`: o board só é alcançável pelo `/api/v1/pipelines/[id]/board`
 * (que exige manager), e um viewer procurando um lead pelo nome não tem por
 * onde. É a mesma regra do catálogo e dos prospects: viewer lê, `busca` casa
 * por `title` (o nome do lead — `createLeadSchema.title`), limitado para não
 * devolver o funil inteiro numa tecla.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;

  const busca = req.nextUrl.searchParams.get("busca")?.trim() ?? "";
  const limite = Math.min(20, Math.max(1, Number(req.nextUrl.searchParams.get("limite") ?? 5) || 5));
  const supabase = await createClient();

  let q = supabase
    .from("crm_leads")
    .select("id, title, status, pipeline_id, created_at")
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (busca !== "") q = q.ilike("title", `%${busca}%`);

  const { data, error } = await q;
  if (error) return fail("internal_error", "Erro ao buscar leads.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  // spec 13 §4: escrita é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  let input;
  try {
    input = await validateRequest(createLeadSchema, req);
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

  try {
    const lead = await createLeadHandler(
      supabase,
      {
        organization_id: activeOrg.orgId,
        actor: { type: "user", id: authUser.id },
        requestId,
      },
      input as CreateLeadInput,
    );
    return ok(lead, { requestId, status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}
