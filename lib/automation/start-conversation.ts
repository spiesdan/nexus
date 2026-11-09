/**
 * Conversa programática p/ automação: acha a conversa aberta do contato na
 * sessão, REABRE a fechada, ou cria uma nova. Distinto da ingestão WAHA (que
 * usa RPCs de identidade) — aqui contato e sessão já são conhecidos.
 *
 * Por que reabrir: o índice uniq_conversations_1to1_per_contact_session é
 * único por (org, contato, sessão) SEM filtro de status — um contato cuja
 * única conversa está closed/archived tornaria o INSERT impossível (23505) e
 * o envio automatizado falharia pra sempre. Reabrir é também o comportamento
 * certo de produto: a conversa É o thread com aquele contato naquele número.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ARCHIVED_AT, queryTolerantToMissingArchived } from "@/lib/channels/archived";
import { eCanalDeExpedicao } from "@/lib/channels/finalidade";

const OPEN_STATUSES = ["open", "pending", "claimed", "ai_handling"];

interface CanalParaEnvio {
  id: string;
  status?: string;
  metadata: unknown;
}

export interface SessaoDeExpedicao {
  id: string;
  /**
   * `WORKING` = pode enviar agora. Qualquer outro valor (STOPPED, STARTING,
   * SCAN_QR_CODE, FAILED…) = o aviso fica na fila até a sessão voltar.
   */
  status: string;
  dedicado: true;
}

/**
 * Sessão viva da org: WORKING primeiro; senão qualquer uma não arquivada.
 *
 * Entre as vivas, o número COMERCIAL vence o de expedição mesmo sendo mais novo.
 * Sem essa ordem, marcar um segundo número como "avisos de expedição" e torná-lo
 * WORKING antes do comercial (ou reconectar o comercial depois) faria follow-up,
 * campanha e venda automática saírem pelo número de aviso — a separação que o
 * usuário pediu existiria só no texto da tela. O canal de expedição continua
 * elegível como último recurso: org com um único número não pode ficar muda.
 */
export async function sessaoProntaParaEnvio(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string | null> {
  const listar = (soWorking: boolean, ignorarArquivadas: boolean) => {
    let q = supabase
      .from("channel_sessions")
      .select("id, metadata")
      .eq("organization_id", organizationId);
    if (soWorking) q = q.eq("status", "WORKING");
    if (ignorarArquivadas) q = q.is(ARCHIVED_AT, null);
    // Sem `limit(1)`: a escolha entre comercial e expedição é feita depois de
    // ler os candidatos, e cortar a lista antes disso devolveria justamente a
    // linha errada.
    return q.order("created_at", { ascending: true });
  };
  const tentar = async (soWorking: boolean): Promise<string | null> => {
    const { data } = await queryTolerantToMissingArchived(
      () => listar(soWorking, true),
      () => listar(soWorking, false),
    );
    const canais = (data as CanalParaEnvio[] | null) ?? [];
    const comercial = canais.find((c) => !eCanalDeExpedicao(c.metadata));
    return (comercial ?? canais[0])?.id ?? null;
  };
  return (await tentar(true)) ?? (await tentar(false));
}

/**
 * A sessão por onde saem os avisos de EXPEDIÇÃO ("seu pedido saiu para
 * entrega").
 *
 * ═══ NUNCA cai no comercial ═══════════════════════════════════════════════
 *
 * Até 2026-11-09, se o número de expedição estivesse parado, o aviso saía pelo
 * comercial "para não deixar de avisar". O dono mediu o custo disso: a conta
 * comercial passou a ver no inbox avisos de rota que não são dela, e o próprio
 * cliente recebeu a notificação fria no número em que compra. Numa organização
 * com dois números e duas contas separadas, o fallback destrói a separação.
 *
 * Então esta função devolve APENAS o canal marcado como expedição — sem filtrar
 * por status. Quem chama decide: `WORKING` envia; fora do ar, o aviso vai para
 * a fila durável (`lib/expedicao/aviso-de-carga.ts`) e é entregue quando a
 * sessão voltar. Sem canal marcado, devolve `null` e nada sai por outro número.
 *
 * O canal arquivado não conta: excluir o número é a promessa de que ele não é
 * mais elegível para envio.
 */
export async function sessaoParaAvisosDeExpedicao(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<SessaoDeExpedicao | null> {
  const listar = (ignorarArquivadas: boolean) => {
    let q = supabase
      .from("channel_sessions")
      .select("id, status, metadata")
      .eq("organization_id", organizationId);
    if (ignorarArquivadas) q = q.is(ARCHIVED_AT, null);
    return q.order("created_at", { ascending: true });
  };
  const { data } = await queryTolerantToMissingArchived(
    () => listar(true),
    () => listar(false),
  );
  const dedicado = ((data as CanalParaEnvio[] | null) ?? []).find((c) =>
    eCanalDeExpedicao(c.metadata),
  );
  if (!dedicado) return null;

  return {
    id: dedicado.id,
    status: String(dedicado.status ?? "STOPPED"),
    dedicado: true,
  };
}

export async function ensureConversation(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  channelSessionId: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("conversations")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("channel_session_id", channelSessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; status: string };
    if (OPEN_STATUSES.includes(row.status)) return row.id;
    const { error: reopenErr } = await admin
      .from("conversations")
      .update({ status: "open", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("organization_id", organizationId);
    if (reopenErr) throw new Error(reopenErr.message);
    return row.id;
  }

  const { data: created, error } = await admin
    .from("conversations")
    .insert({
      organization_id: organizationId,
      contact_id: contactId,
      channel_session_id: channelSessionId,
      channel: "whatsapp",
      status: "open",
      metadata: { created_by: "automation" },
    })
    .select("id")
    .single();
  if (error || !created) {
    // Corrida: outro processo criou a conversa 1:1 entre o select e o insert.
    if ((error as { code?: string } | null)?.code === "23505") {
      const { data: winner } = await admin
        .from("conversations")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("contact_id", contactId)
        .eq("channel_session_id", channelSessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (winner) return (winner as { id: string }).id;
    }
    throw new Error(error?.message ?? "conversation_insert_failed");
  }
  return (created as { id: string }).id;
}
