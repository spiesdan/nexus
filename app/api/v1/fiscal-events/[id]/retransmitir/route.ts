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
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { lerMensagemCarta } from "@/lib/fiscal/eventos";
import { transmitirCartaRegistrada, type EventoCarta } from "@/lib/fiscal/transmissao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "fiscal_events" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: evento } = await admin
    .from("fiscal_events")
    .select("id, invoice_id, tipo, status, mensagem, protocolo, created_at")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const atual = evento as (EventoCarta & { invoice_id: string }) | null;
  if (!atual) return fail("not_found", "Evento não encontrado.", 404, { requestId });
  if (atual.tipo !== "carta_correcao") {
    return fail("validation_failed", "Só carta de correção é retransmitida por aqui.", 422, { requestId });
  }
  if (atual.status === "transmitida") {
    return fail("state_conflict", "Carta já transmitida à SEFAZ — não se retransmite.", 409, { requestId });
  }

  const carta = lerMensagemCarta(atual.mensagem);
  if (!carta) {
    return fail("internal_error", "Mensagem da carta ilegível (sequência/correção ausentes).", 500, { requestId });
  }

  const { data: nota } = await admin
    .from("invoices")
    .select("status, chave_acesso")
    .eq("id", atual.invoice_id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const n = nota as { status: string; chave_acesso: string | null } | null;
  if (!n) return fail("not_found", "Nota da carta não encontrada.", 404, { requestId });
  if (n.status !== "autorizada") {
    return fail("validation_failed", `Nota ${n.status}: carta de correção só retransmite em nota autorizada.`, 422, { requestId });
  }
  if (!n.chave_acesso) {
    return fail("validation_failed", "Nota sem chave de acesso.", 422, { requestId });
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

  if (!final) return fail("internal_error", "Erro ao gravar o retorno da SEFAZ.", 500, { requestId });
  return ok({ ...final, ...(motivo ? { motivo_transmissao: motivo } : {}) }, { requestId });
}
