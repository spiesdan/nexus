/**
 * POST /api/v1/sentinel/occurrences/[id]/correcao/simular — DRY-RUN.
 *
 * Não escreve NADA. Devolve se o caso é corrigível, o antes/depois exato e o
 * hash que a execução terá de apresentar. É o que o gestor revisa na tela antes
 * de aprovar a execução.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { planejarAntecipacao } from "@/lib/sentinel/correcao";
import { correcaoDeJobSuportada } from "@/lib/sentinel/correcao-constantes";

import { carregarJob, carregarOcorrencia, UUID } from "../_comum";

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
    return fail(
      "correcao_nao_suportada",
      "Esta ocorrência não tem correção automática: só job de manutenção aprovado é corrigível.",
      422,
      { requestId },
    );
  }
  if (ocorrencia.estado !== "aprovada") {
    return fail(
      "aprovacao_pendente",
      "Aprove a ocorrência antes de simular a execução.",
      409,
      { requestId, details: { estado: ocorrencia.estado } },
    );
  }

  const { job, erro: erroJob } = await carregarJob(supabase, authz.org.orgId, ocorrencia);
  if (erroJob) return fail("internal_error", "Não foi possível ler o job.", 500, { requestId });

  const resultado = planejarAntecipacao(job, new Date().toISOString());
  if (!resultado.elegivel) {
    return fail("correcao_nao_elegivel", resultado.motivo, 409, { requestId });
  }

  return ok(
    {
      ocorrencia_id: ocorrencia.id,
      elegivel: true,
      plano: resultado.plano,
      job: {
        id: job!.id,
        kind: job!.kind,
        status: job!.status,
        attempts: job!.attempts,
        max_attempts: job!.max_attempts,
      },
    },
    { requestId },
  );
}
