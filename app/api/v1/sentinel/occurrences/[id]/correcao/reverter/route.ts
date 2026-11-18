/**
 * POST /api/v1/sentinel/occurrences/[id]/correcao/reverter — desfaz a antecipação.
 *
 * Só funciona enquanto o job continua `pending` com o `run_after` que a correção
 * gravou. Se o worker já reclamou, a RPC devolve zero linhas e a rota responde
 * 409: reversão honesta ou nenhuma, nunca um "desfiz" que não desfez.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { correcaoDeJobSuportada } from "@/lib/sentinel/correcao-constantes";

import { carregarOcorrencia, UUID } from "../_comum";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "sentinel" });
  if (!authz.ok) return authz.response;

  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail("invalid_request", "Id inválido.", 400, { requestId });

  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { ocorrencia, erro } = await carregarOcorrencia(supabase, authz.org.orgId, id);
  if (erro) return fail("internal_error", "Não foi possível abrir a ocorrência.", 500, { requestId });
  if (!ocorrencia) return fail("not_found", "Ocorrência não encontrada.", 404, { requestId });

  if (!correcaoDeJobSuportada(ocorrencia.regra, ocorrencia.entidade_tipo)) {
    return fail("correcao_nao_suportada", "Esta ocorrência não tem correção reversível.", 422, {
      requestId,
    });
  }
  if (ocorrencia.estado !== "corrigida") {
    return fail("reversao_indisponivel", "A ocorrência não está corrigida.", 409, {
      requestId,
      details: { estado: ocorrencia.estado },
    });
  }

  const admin = createAdminClient();
  const { data: mudanca, error: erroMudanca } = await admin.rpc("fn_sentinel_reverter_job", {
    p_organization_id: authz.org.orgId,
    p_occurrence_id: ocorrencia.id,
    p_ator: authz.user.id,
  });

  if (erroMudanca) {
    return fail("internal_error", "Não foi possível reverter a correção.", 500, { requestId });
  }
  const linha = Array.isArray(mudanca) ? mudanca[0] : mudanca;
  if (!linha) {
    return fail(
      "reversao_indisponivel",
      "O job já foi reclamado ou mudou; não há reversão honesta. Nada foi alterado.",
      409,
      { requestId },
    );
  }

  await audit({
    action: "sentinel.correction_reverted",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "sentinel_occurrences",
    resourceId: ocorrencia.id,
    metadata: { correcao: "antecipar_job", job_id: (linha as { job_id?: string }).job_id },
  });

  return ok(
    {
      ocorrencia_id: ocorrencia.id,
      estado: "nova",
      job_id: (linha as { job_id?: string }).job_id ?? null,
    },
    { requestId },
  );
}
