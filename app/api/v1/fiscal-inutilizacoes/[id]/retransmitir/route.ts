/**
 * POST /api/v1/fiscal-inutilizacoes/[id]/retransmitir — manda a faixa registrada ao SEFAZ.
 *
 * Repete o mesmo caminho do POST de criação (mesmo helper, mesma resposta):
 * "registrada" vira "transmitida" com protocolo, ou "erro" com o cStat que a
 * SEFAZ devolveu. Faixa já transmitida não retransmite (inutilização não se
 * refaz) — e nada aqui inventa protocolo quando o sidecar não responde.
 *
 * Sem coluna de ano/modelo na tabela, a retransmissão vai com o padrão do
 * sidecar (ano atual, modelo 55) — ver `inutilizacaoSchema`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { hashDaRequisicao, reservarIdempotencia } from "@/lib/api/idempotencia";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { transmitirInutilizacaoRegistrada, type InutilizacaoLinha } from "@/lib/fiscal/transmissao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "fiscal-inutilizacoes" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const admin = createAdminClient();

  // D-03 — retransmissão é efeito externo: mesma chave devolve a MESMA
  // resposta; chave reusada com outro id é 409. Sem header, nada muda.
  const chave = req.headers.get("Idempotency-Key")?.trim() || null;
  let reserva: Awaited<ReturnType<typeof reservarIdempotencia>> | null = null;
  if (chave) {
    reserva = await reservarIdempotencia(admin, {
      orgId: authz.org.orgId,
      endpoint: "POST /api/v1/fiscal-inutilizacoes/[id]/retransmitir",
      chave,
      requestHash: hashDaRequisicao({ id }),
    });
    if (reserva.estado === "replay") {
      return ok(reserva.resposta.body, {
        requestId,
        status: 200,
        headers: { "Idempotency-Replayed": "true" },
      });
    }
    if (reserva.estado === "conflito") {
      return fail("idempotency_conflict", "Esta Idempotency-Key já foi usada com outra faixa.", 409, { requestId });
    }
    if (reserva.estado === "em_andamento") {
      return fail("idempotency_in_progress", "A retransmissão com esta chave ainda está em andamento.", 409, { requestId });
    }
    if (reserva.estado === "erro") {
      return fail("internal_error", "Não foi possível reservar a chave de idempotência.", 500, { requestId });
    }
  }

  /** Qualquer falha depois da reivindicação libera a chave para retry. */
  const falhar = async (...args: Parameters<typeof fail>): Promise<Response> => {
    if (reserva?.estado === "livre") await reserva.abortar();
    return fail(...args);
  };

  const { data: linha } = await admin
    .from("fiscal_inutilizacoes")
    .select("id, serie, numero_inicial, numero_final, motivo, status")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const atual = linha as Pick<InutilizacaoLinha, "id" | "serie" | "numero_inicial" | "numero_final" | "motivo" | "status"> | null;
  if (!atual) return falhar("not_found", "Inutilização não encontrada.", 404, { requestId });
  if (atual.status === "transmitida") {
    return falhar("state_conflict", "Faixa já transmitida à SEFAZ — não se retransmite.", 409, { requestId });
  }

  const { linha: final, motivo } = await transmitirInutilizacaoRegistrada(authz.org.orgId, atual.id, {
    serie: atual.serie,
    numero_inicial: atual.numero_inicial,
    numero_final: atual.numero_final,
    justificativa: atual.motivo,
    ano: null,
    modelo: null,
  });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fiscal.inutilizacao_retransmitida",
    resourceType: "fiscal_inutilizacoes",
    resourceId: atual.id,
    requestId,
  });

  if (!final) return falhar("internal_error", "Erro ao gravar o retorno da SEFAZ.", 500, { requestId });
  const resposta = { ...final, ...(motivo ? { motivo_transmissao: motivo } : {}) };
  if (reserva?.estado === "livre") await reserva.finalizar({ status: 200, body: resposta });
  return ok(resposta, { requestId });
}
