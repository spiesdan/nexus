/**
 * POST .../correcao/conversa/simular — DRY-RUN da liberação de claim.
 *
 * Não escreve nada. Devolve o antes (responsável/claim) e o depois (fila, sem
 * responsável) + hash; o gestor revisa e confirma na tela.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { planejarLiberacaoConversa } from "@/lib/sentinel/correcao";
import { correcaoDeConversaSuportada } from "@/lib/sentinel/correcao-constantes";

import { carregarOcorrencia, UUID } from "../../_comum";
import { carregarConversa } from "../_comum";

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

  if (!correcaoDeConversaSuportada(ocorrencia.regra, ocorrencia.entidade_tipo)) {
    return fail(
      "correcao_nao_suportada",
      "Esta ocorrência não tem correção de conversa: só claim parado é liberável.",
      422,
      { requestId },
    );
  }
  if (ocorrencia.estado !== "aprovada") {
    return fail("aprovacao_pendente", "Aprove a ocorrência antes de simular a execução.", 409, {
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

  const resultado = planejarLiberacaoConversa(conversa, new Date().toISOString());
  if (!resultado.elegivel) {
    return fail("correcao_nao_elegivel", resultado.motivo, 409, { requestId });
  }

  return ok(
    {
      ocorrencia_id: ocorrencia.id,
      elegivel: true,
      plano: resultado.plano,
      conversa: { id: conversa!.id, status: conversa!.status },
    },
    { requestId },
  );
}
