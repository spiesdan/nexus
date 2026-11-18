/**
 * POST /api/v1/sentinel/occurrences/[id]/correcao — executa a correção APROVADA.
 *
 * O corpo é o plano que o gestor viu: `antes`, `depois`, `hash` e `confirmado`.
 * O hash amarra o dry-run à execução; o `antes` é o CAS que a RPC repete. Se o
 * job mudou (worker reclamou, run_after alterado), a RPC devolve zero linhas e a
 * rota responde 409 — nunca "corrige" um estado que ninguém revisou.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hashDaCorrecao, planejarAntecipacao } from "@/lib/sentinel/correcao";
import { correcaoDeJobSuportada } from "@/lib/sentinel/correcao-constantes";

import { carregarJob, carregarOcorrencia, UUID } from "./_comum";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  confirmado: z.literal(true),
  // O `antes` vem do PostgREST com offset (`+00:00`) e microssegundos.
  antes: z.string().datetime({ offset: true }),
  depois: z.string().datetime({ offset: true }),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "sentinel" });
  if (!authz.ok) return authz.response;

  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail("invalid_request", "Id inválido.", 400, { requestId });

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return fail("invalid_json", "Corpo inválido.", 400, { requestId });
  }
  const parsed = corpoSchema.safeParse(bruto);
  if (!parsed.success) {
    return fail("validation_error", "Confirmação, antes/depois e hash são obrigatórios.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

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
    return fail("aprovacao_pendente", "A ocorrência não está aprovada.", 409, {
      requestId,
      details: { estado: ocorrencia.estado },
    });
  }

  const { job, erro: erroJob } = await carregarJob(supabase, authz.org.orgId, ocorrencia);
  if (erroJob) return fail("internal_error", "Não foi possível ler o job.", 500, { requestId });
  if (!job) return fail("correcao_nao_elegivel", "Job não encontrado.", 409, { requestId });

  // Recalcula com o `depois` que o gestor revisou; o job tem de continuar no
  // mesmo `antes` e elegível pelas mesmas regras.
  const plano = planejarAntecipacao(job, parsed.data.depois);
  if (!plano.elegivel) {
    return fail("correcao_nao_elegivel", plano.motivo, 409, { requestId });
  }
  if (
    plano.plano.antes.run_after !== parsed.data.antes ||
    plano.plano.depois.run_after !== parsed.data.depois ||
    plano.plano.hash !== parsed.data.hash
  ) {
    return fail(
      "plano_desatualizado",
      "O job mudou desde a simulação. Simule de novo antes de executar.",
      409,
      { requestId },
    );
  }
  if (hashDaCorrecao(job.id, parsed.data.antes, parsed.data.depois) !== parsed.data.hash) {
    return fail("plano_desatualizado", "Hash do plano não confere.", 409, { requestId });
  }

  const admin = createAdminClient();
  const { data: mudanca, error: erroMudanca } = await admin.rpc("fn_sentinel_corrigir_job", {
    p_organization_id: authz.org.orgId,
    p_occurrence_id: ocorrencia.id,
    p_ator: authz.user.id,
    p_antes: parsed.data.antes,
    p_depois: parsed.data.depois,
  });

  if (erroMudanca) {
    return fail("internal_error", "Não foi possível executar a correção.", 500, { requestId });
  }
  const linha = Array.isArray(mudanca) ? mudanca[0] : mudanca;
  if (!linha) {
    return fail(
      "correcao_nao_aplicada",
      "O job mudou ou deixou de ser elegível. Nada foi alterado.",
      409,
      { requestId },
    );
  }

  await audit({
    action: "sentinel.correction_applied",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "sentinel_occurrences",
    resourceId: ocorrencia.id,
    metadata: {
      correcao: "antecipar_job",
      job_id: job.id,
      run_after_antes: parsed.data.antes,
      run_after_depois: parsed.data.depois,
    },
  });

  return ok(
    {
      ocorrencia_id: ocorrencia.id,
      job_id: job.id,
      estado: "corrigida",
      antes: parsed.data.antes,
      depois: parsed.data.depois,
    },
    { requestId },
  );
}
