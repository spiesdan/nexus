/**
 * GET  /api/v1/ai/followups/enrollments — lista enrollments da org ativa
 *   (any member), filtro opcional `?status=`.
 * POST /api/v1/ai/followups/enrollments — enrollment (manager+); lógica em
 *   `lib/followup/enroll.ts`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createFollowupEnrollmentSchema } from "@/lib/followup/api-schemas";
import { ENROLLMENT_LIST_COLUMNS, enrollFollowupFlow } from "@/lib/followup/enroll";

export const dynamic = "force-dynamic";

/**
 * Teto e página. O PostgREST corta em 1000 linhas por resposta — sem `.range`
 * explícito, uma organização com mais de 1000 contatos em fluxo recebia a
 * primeira página em silêncio e a tela não tinha como saber. Aqui a rota diz o
 * que entregou: `meta.has_more` e `meta.next_offset`.
 */
const LIMITE_PADRAO = 200;
const LIMITE_MAXIMO = 500;

const ENROLLMENT_STATUSES = [
  "active",
  "waiting_reply",
  "paused_handoff",
  "paused_manual",
  "completed",
  "cancelled",
  "dead",
];

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "followup_enrollments" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg } = authz;

  const status = req.nextUrl.searchParams.get("status");
  if (status !== null && !ENROLLMENT_STATUSES.includes(status)) {
    return fail("invalid_request", "status inválido.", 400, { requestId });
  }

  // Paginação explícita. Default 200, teto 500; `offset` para seek simples.
  // Um `limit` inválido não é motivo para 400 — a tela degrada para o padrão,
  // mas NUNCA corta em silêncio: a resposta diz `has_more` e `next_offset`.
  const limiteBruto = Number(req.nextUrl.searchParams.get("limit") ?? "");
  const offsetBruto = Number(req.nextUrl.searchParams.get("offset") ?? "");
  const limit = Number.isFinite(limiteBruto) && limiteBruto > 0
    ? Math.min(Math.floor(limiteBruto), LIMITE_MAXIMO)
    : LIMITE_PADRAO;
  const offset = Number.isFinite(offsetBruto) && offsetBruto > 0 ? Math.floor(offsetBruto) : 0;

  const supabase = await createClient();
  let query = supabase
    .from("followup_enrollments")
    .select(ENROLLMENT_LIST_COLUMNS)
    .eq("organization_id", activeOrg.orgId)
    // Ordem total: `updated_at` sozinho empata em lote e a página seguinte
    // repetiria/pularia linha. `id` desempata.
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });
  if (status !== null) query = query.eq("status", status);

  // `limit + 1` é a sonda de truncamento: sobrou linha além da página?
  const { data, error } = await query.range(offset, offset + limit);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const linhas = data ?? [];
  const hasMore = linhas.length > limit;
  const pagina = hasMore ? linhas.slice(0, limit) : linhas;
  return ok(pagina, {
    requestId,
    meta: {
      limit,
      offset,
      has_more: hasMore,
      next_offset: hasMore ? offset + limit : null,
    },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "followup_enrollments" });
  if (!authz.ok) return authz.response;
  const { user, org: activeOrg } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", "Body JSON inválido.", 400, { requestId });
  }

  const parsed = createFollowupEnrollmentSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Campos inválidos.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = await createClient();
  const result = await enrollFollowupFlow(supabase, {
    organizationId: activeOrg.orgId,
    pointerId: parsed.data.pointer_id,
    contactId: parsed.data.contact_id,
    agentId: parsed.data.agent_id,
    actorUserId: user.id,
    requestId,
  });

  if (!result.ok) {
    return fail(result.code, result.message, result.status, { requestId });
  }
  return ok(result.enrollment, { requestId, status: 201 });
}
