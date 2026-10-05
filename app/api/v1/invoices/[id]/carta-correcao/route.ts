/**
 * POST /api/v1/invoices/[id]/carta-correcao — registra e TRANSMITE CC-e na nota autorizada.
 *
 * Só autorizada recebe carta (regra fiscal: sem autorização não há o que
 * corrigir). Texto de 15 a 1000 caracteres, no máximo 20 cartas por nota —
 * a sequência é a ordem de chegada.
 *
 * O evento nasce "registrada_local" e só vira "transmitida" quando a SEFAZ
 * devolve protocolo (cStat 135). Sem sidecar/certificado ele continua local —
 * o status diz a verdade, e o POST de novo (ou a rota de retransmissão) tenta
 * transmitir sem criar carta nova (a sequência não pode mudar).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { montarMensagemCarta } from "@/lib/fiscal/eventos";
import { transmitirCartaRegistrada } from "@/lib/fiscal/transmissao";
import { cartaCorrecaoSchema, MAX_CARTAS_POR_NOTA } from "@/lib/schemas/fiscal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;

  const parsed = cartaCorrecaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Correção inválida (15 a 1000 caracteres).", 422, { requestId });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: nota } = await supabase
    .from("invoices")
    .select("id, status, numero, serie, chave_acesso")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const atual = nota as unknown as { id: string; status: string; chave_acesso: string | null } | null;
  if (!atual) return fail("not_found", "Nota não encontrada.", 404, { requestId });
  if (atual.status !== "autorizada") {
    return fail("validation_failed", "Carta de correção só existe para nota autorizada.", 422, { requestId });
  }

  const admin = createAdminClient();
  const { count } = await admin
    .from("fiscal_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", authz.org.orgId)
    .eq("invoice_id", id)
    .eq("tipo", "carta_correcao");
  const sequencia = (count ?? 0) + 1;
  if (sequencia > MAX_CARTAS_POR_NOTA) {
    return fail("validation_failed", "Nota já tem 20 cartas de correção (teto da SEFAZ).", 422, { requestId });
  }

  const mensagem = montarMensagemCarta(sequencia, parsed.data.correcao);
  const { data, error } = await admin
    .from("fiscal_events")
    .insert({
      organization_id: authz.org.orgId,
      invoice_id: id,
      tipo: "carta_correcao",
      status: "registrada_local",
      mensagem,
      created_by: authz.user.id,
    })
    .select("id, tipo, status, mensagem, protocolo, created_at")
    .single();

  if (error || !data) {
    return fail("internal_error", "Erro ao registrar a carta de correção.", 500, { requestId });
  }

  const eventoCriado = data as unknown as { id: string };
  const chave = atual.chave_acesso;
  const r = chave
    ? await transmitirCartaRegistrada(authz.org.orgId, eventoCriado.id, {
        chave,
        correcao: parsed.data.correcao,
        sequencia,
      })
    : { evento: null, motivo: "Nota sem chave de acesso." };

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "invoice.carta_correcao",
    resourceType: "invoices",
    resourceId: id,
    requestId,
  });

  // 201 = carta registrada (com ou sem transmissão); `motivo_transmissao`
  // explica o que faltou para quem foi ao fisco — a timeline lê o status.
  const eventoFinal = r.evento ?? (data as unknown as Record<string, unknown>);
  return ok({ ...eventoFinal, ...(r.motivo ? { motivo_transmissao: r.motivo } : {}) }, { requestId, status: 201 });
}
