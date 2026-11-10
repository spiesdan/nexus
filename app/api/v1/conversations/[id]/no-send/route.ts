/**
 * POST /api/v1/conversations/[id]/no-send — marca o contato como SEM ENVIO.
 *
 * ## O defeito que esta rota existe para consertar
 *
 * Quando um cliente pede para não receber mais nada, a parada dura já existe —
 * `contacts.is_blocked` (opt-out), lida pelo `stopGate` do before-send, pelo
 * `ComandoDaConversa` e pelo worker (`skip("contact_blocked")`). Até hoje ela só
 * era GRAÇADA pela chegada da palavra-chave de descadastro
 * (`lib/channels/pos-entrada.ts` → `aplicarOptOut`).
 *
 * Ou seja: pedir "não me mande mais nada" EM CONVERSA ia para o modelo, o modelo
 * podia (e às vezes devia) responder — mas a PARADA só nascia da regex de
 * palavra. A decisão humana tomada na linha da conversa ("por favor, não me
 * mande mais nada") nunca chegava ao estado; o bot continuava enviando até o
 * cliente repetir o desligamento ou nunca acontecer.
 *
 * ## O que esta rota grava — e por que é o mesmo estado
 *
 * `contacts.is_blocked = true` com `blocked_reason = 'manual'`, exatamente o
 * estado do opt-out detectado por palavra (`'stop_keyword'`). Mesma coluna, mesma
 * semântica de parada irrevogável do opt-out: o motor (stop gate primeiro) é quem
 * recusa o próximo envio; esta rota apenas entrega a decisão ao mesmo mecanismo.
 *
 * Por que `manual` e não um novo campo: o vocabulário de `blocked_reason` já é
 * deliberado (`docs/specs/02-spec-customer-360.md`: `'stop_keyword' | 'manual' |
 * 'lgpd' | ...`) e a inscrição humana da mesma decisão é a definida. Não nasce
 * regra nova — nasce a porta que converte "o cliente pediu" em estado.
 *
 * Por que não `bot_silenced_until`: silêncio é temporário, por conversa, e é a
 * pausa operacional ("vou atender"); parada de envio é do CONTATO e é a parada
 * irrevogável de opt-out. São invariantes distintos e já separados.
 *
 * ## Por que a regra mora na rota
 *
 * É o MESMO gesto do opt-out de palavra (update + audit + evento), já escrito em
 * `lib/channels/pos-entrada.ts`. A rota da tela (inbox) chama aqui; o ingest não
 * muda — a decisão humana e a decisão automática passam a usar UM único write.
 *
 * Auth: cookie session, role >= agent (mesmo teto da pausa). Audit: `contact.blocked`.
 * Atividade: linha do comando (`contact_no_send`) na timeline do negócio.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { registrarTrocaDeComando } from "@/lib/inbox/atividade-de-comando";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MOTIVO = "Cliente pediu para não receber mensagens";
const REASO_SEM_ENVIO = "manual";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const supabase = await createClient();

  // Client do REQUEST, nunca admin: é a policy `conversations_select` que aplica
  // a visibilidade, e ler com service role aqui deixaria um agent fora de escopo
  // marcar sem ver a conversa.
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, contact_id, status, assigned_to_user_id, bot_silenced_until")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (convError) return fail("internal_error", convError.message, 500, { requestId });
  if (!conversation) return fail("not_found", "Conversa não encontrada.", 404, { requestId });

  const conv = conversation as unknown as {
    id: string;
    contact_id: string | null;
    status: string;
    assigned_to_user_id: string | null;
    bot_silenced_until: string | null;
  };

  if (conv.status === "closed" || conv.status === "archived") {
    return fail(
      "state_conflict",
      "Esta conversa está encerrada — não há atendimento automático a pausar.",
      409,
      { requestId },
    );
  }

  if (!conv.contact_id) {
    return fail("not_found", "Conversa sem contato vinculado.", 404, { requestId });
  }

  // A parada. Escrita via admin (mesmo client do opt-out de palavra): o write é
  // do CONTATO; a checagem de visibilidade da conversa ficou no client do request.
  const admin = createAdminClient();
  const agora = new Date().toISOString();
  const { data: contato, error: contatoError } = await admin
    .from("contacts")
    .update({
      is_blocked: true,
      blocked_reason: REASO_SEM_ENVIO,
      blocked_at: agora,
    })
    .eq("organization_id", org.orgId)
    .eq("id", conv.contact_id)
    .select("id, is_blocked, blocked_reason, blocked_at")
    .single();
  if (contatoError) {
    return fail("internal_error", "Não foi possível registrar o sem envio.", 500, {
      requestId,
      details: contatoError.message,
    });
  }

  await audit({
    action: "contact.blocked",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "contact",
    resourceId: conv.contact_id,
    requestId,
    metadata: { reason: REASO_SEM_ENVIO, contact_id: conv.contact_id, origem: "inbox.no_send" },
  });

  await registrarTrocaDeComando({
    supabase,
    organizationId: org.orgId,
    conversationId: id,
    contactId: conv.contact_id,
    tipo: "contact_no_send",
    actor: { type: "user", id: user.id, role: org.role },
    motivo: MOTIVO,
    payload: { conversation_id: id, declared_by: "agent" },
  });

  return ok({ no_send: true, contact: contato ?? null }, { requestId });
}
