/**
 * POST .../correcao/conversa — executa a liberação APROVADA.
 *
 * Exige motivo (o porquê fica no histórico), o antes revisado e o hash do
 * dry-run. A RPC repete o CAS: se outro agente assumiu a conversa, zero linhas,
 * 409 — nunca libera/rouba o claim de outra pessoa.
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
import { hashDaCorrecao, planejarLiberacaoConversa } from "@/lib/sentinel/correcao";
import { correcaoDeConversaSuportada } from "@/lib/sentinel/correcao-constantes";

import { carregarOcorrencia, UUID } from "../_comum";
import { carregarConversa } from "./_comum";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  confirmado: z.literal(true),
  motivo: z.string().trim().min(3).max(500),
  antes_atendente: z.string().uuid(),
  antes_assigned_at: z.string().datetime({ offset: true }),
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
    return fail("validation_error", "Confirmação, motivo e antes/depois são obrigatórios.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { ocorrencia, erro } = await carregarOcorrencia(supabase, authz.org.orgId, id);
  if (erro) return fail("internal_error", "Não foi possível abrir a ocorrência.", 500, { requestId });
  if (!ocorrencia) return fail("not_found", "Ocorrência não encontrada.", 404, { requestId });

  if (!correcaoDeConversaSuportada(ocorrencia.regra, ocorrencia.entidade_tipo)) {
    return fail(
      "correcao_nao_suportada",
      "Esta ocorrência não tem correção de conversa: só claim parado é liberável.",
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

  const { conversa, erro: erroConversa } = await carregarConversa(
    supabase,
    authz.org.orgId,
    ocorrencia,
  );
  if (erroConversa) {
    return fail("internal_error", "Não foi possível ler a conversa.", 500, { requestId });
  }
  if (!conversa) return fail("correcao_nao_elegivel", "Conversa não encontrada.", 409, { requestId });

  const plano = planejarLiberacaoConversa(conversa, new Date().toISOString());
  if (!plano.elegivel) {
    return fail("correcao_nao_elegivel", plano.motivo, 409, { requestId });
  }
  if (
    plano.plano.antes.atendente_id !== parsed.data.antes_atendente ||
    plano.plano.antes.assigned_at !== parsed.data.antes_assigned_at ||
    plano.plano.hash !== parsed.data.hash
  ) {
    return fail(
      "plano_desatualizado",
      "A conversa mudou desde a simulação. Simule de novo antes de executar.",
      409,
      { requestId },
    );
  }
  if (
    hashDaCorrecao(
      conversa.id,
      `${parsed.data.antes_atendente}|${parsed.data.antes_assigned_at}`,
      "open",
    ) !== parsed.data.hash
  ) {
    return fail("plano_desatualizado", "Hash do plano não confere.", 409, { requestId });
  }

  const admin = createAdminClient();
  const { data: mudanca, error: erroMudanca } = await admin.rpc("fn_sentinel_liberar_conversa", {
    p_organization_id: authz.org.orgId,
    p_occurrence_id: ocorrencia.id,
    p_ator: authz.user.id,
    p_motivo: parsed.data.motivo,
    p_atendente: parsed.data.antes_atendente,
    p_assigned_at: parsed.data.antes_assigned_at,
  });

  if (erroMudanca) {
    return fail("internal_error", "Não foi possível liberar a conversa.", 500, { requestId });
  }
  const linha = Array.isArray(mudanca) ? mudanca[0] : mudanca;
  if (!linha) {
    return fail(
      "correcao_nao_aplicada",
      "A conversa mudou ou deixou de ser elegível. Nada foi alterado.",
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
      correcao: "liberar_conversa",
      conversa_id: conversa.id,
      atendente_antes: parsed.data.antes_atendente,
      assigned_at_antes: parsed.data.antes_assigned_at,
    },
  });

  return ok(
    {
      ocorrencia_id: ocorrencia.id,
      conversa_id: conversa.id,
      estado: "corrigida",
      antes: plano.plano.antes,
      depois: plano.plano.depois,
    },
    { requestId },
  );
}
