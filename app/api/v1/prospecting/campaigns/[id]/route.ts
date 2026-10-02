/**
 * GET   /api/v1/prospecting/campaigns/[id] — detalhe da campanha (§28).
 * PATCH /api/v1/prospecting/campaigns/[id] — editar objetivo (§28).
 *
 * Antes da FASE 10 não existia rota nenhuma em `[id]` (só `executar/`); o
 * painel precisa do detalhe e de onde escrever o "Objetivo" que a spec cobra.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { validateRequest } from "@/lib/schemas";
import { campanhaPatchSchema } from "@/lib/schemas/prospeccao";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const COLUNAS =
  "id, nome, objetivo, categorias, cidades, status, recorrencia_dias, ultima_execucao_at, created_at";

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospecting_campaigns")
    .select(COLUNAS)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (error) {
    logger.error("[prospecting.campaign] falha ao ler a campanha", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error.message,
    });
    return fail("internal_error", "Erro ao ler a campanha.", 500, { requestId });
  }
  if (!data) return fail("not_found", "Campanha não encontrada.", 404, { requestId });
  return ok(data, { requestId });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  let input;
  try {
    input = await validateRequest(campanhaPatchSchema, req);
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
  const { data, error } = await supabase
    .from("prospecting_campaigns")
    .update({ objetivo: input.objetivo, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select(COLUNAS)
    .maybeSingle();
  if (error) {
    logger.error("[prospecting.campaign] falha ao salvar o objetivo", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error.message,
    });
    return fail("internal_error", "Erro ao salvar o objetivo.", 500, { requestId });
  }
  if (!data) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

  await audit({
    action: "prospecting_campaign.updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "prospecting_campaign",
    resourceId: id,
    requestId,
  });

  return ok(data, { requestId });
}
