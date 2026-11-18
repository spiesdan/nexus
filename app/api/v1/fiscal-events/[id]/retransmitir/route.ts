/**
 * POST /api/v1/fiscal-events/[id]/retransmitir — reenvia uma carta de correção registrada.
 *
 * A sequência da CC-e é a ordem de chegada (teto 20): não dá para "criar de
 * novo" quando a transmissão falha — o que se refaz é o MESMO evento, com a
 * MESMA sequência e a MESMA correção. Só carta de correção passa por aqui
 * (cancelamento se refaz reenviando o POST /cancel, que enxerga o estado);
 * evento já transmitido não retransmite.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { hashDaRequisicao, reservarIdempotencia } from "@/lib/api/idempotencia";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { lerMensagemCarta } from "@/lib/fiscal/eventos";
import { transmitirCartaRegistrada, type EventoCarta } from "@/lib/fiscal/transmissao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "fiscal_events" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const admin = createAdminClient();

  // D-03 — mesma chave devolve a MESMA carta transmitida; outro evento com a
  // mesma chave é 409. A sequência da CC-e não se recria: reusa a mesma linha.
  const chave = req.headers.get("Idempotency-Key")?.trim() || null;
  let reserva: Awaited<ReturnType<typeof reservarIdempotencia>> | null = null;
  if (chave) {
    reserva = await reservarIdempotencia(admin, {
      orgId: authz.org.orgId,
      endpoint: "POST /api/v1/fiscal-events/[id]/retransmitir",
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
      return fail("idempotency_conflict", "Esta Idempotency-Key já foi usada com outra carta.", 409, { requestId });
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

  const { data: evento } = await admin
    .from("fiscal_events")
    .select("id, invoice_id, tipo, status, mensagem, protocolo, created_at")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const atual = evento as (EventoCarta & { invoice_id: string }) | null;
  if (!atual) return falhar("not_found", "Evento não encontrado.", 404, { requestId });
  if (atual.tipo !== "carta_correcao") {
    return falhar("validation_failed", "Só carta de correção é retransmitida por aqui.", 422, { requestId });
  }
  if (atual.status === "transmitida") {
    return falhar("state_conflict", "Carta já transmitida à SEFAZ — não se retransmite.", 409, { requestId });
  }

  const carta = lerMensagemCarta(atual.mensagem);
  if (!carta) {
    return falhar("internal_error", "Mensagem da carta ilegível (sequência/correção ausentes).", 500, { requestId });
  }

  const { data: nota } = await admin
    .from("invoices")
    .select("status, chave_acesso")
    .eq("id", atual.invoice_id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const n = nota as { status: string; chave_acesso: string | null } | null;
  if (!n) return falhar("not_found", "Nota da carta não encontrada.", 404, { requestId });
  if (n.status !== "autorizada") {
    return falhar("validation_failed", `Nota ${n.status}: carta de correção só retransmite em nota autorizada.`, 422, { requestId });
  }
  if (!n.chave_acesso) {
    return falhar("validation_failed", "Nota sem chave de acesso.", 422, { requestId });
  }

  const { evento: final, motivo } = await transmitirCartaRegistrada(authz.org.orgId, atual.id, {
    chave: n.chave_acesso,
    correcao: carta.correcao,
    sequencia: carta.sequencia,
  });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "invoice.carta_correcao",
    resourceType: "invoices",
    resourceId: atual.invoice_id,
    requestId,
  });

  if (!final) return falhar("internal_error", "Erro ao gravar o retorno da SEFAZ.", 500, { requestId });
  const resposta = { ...final, ...(motivo ? { motivo_transmissao: motivo } : {}) };
  if (reserva?.estado === "livre") await reserva.finalizar({ status: 200, body: resposta });
  return ok(resposta, { requestId });
}
