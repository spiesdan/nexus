/**
 * Abre (ou reabre) a conversa 1:1 com um contato compartilhado no cartão do inbox.
 * Usa a mesma sessão de canal da mensagem onde o cartão apareceu.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureConversation, sessaoProntaParaEnvio } from "@/lib/automation/start-conversation";
import { encontrarContatoPorTelefone } from "@/lib/channels/contato-por-telefone";
import { phoneLookupVariants, canonicalPhoneBR } from "@/lib/channels/phone-variants";
import { parseDialablePhone } from "@/lib/messaging/contact-card";
import { logger } from "@/lib/logger";

type Admin = SupabaseClient;

export interface OpenSharedContactInput {
  channel_session_id?: string;
  contact_id?: string;
  phone_number?: string;
  name?: string;
  /** Contexto de origem (spec 19, item 17): gravado NO CONTATO na abertura. */
  source?: string;
  source_metadata?: Record<string, unknown>;
  /** Tags do contato (categoria, cidade…). */
  tags?: string[];
  /** Tags da conversa ("prospeccao") — mesma separação que a VA usa. */
  conversation_tags?: string[];
}

export interface OpenSharedContactResult {
  conversation_id: string;
  contact_id: string;
}

/**
 * Delega para `encontrarContatoPorTelefone` — ver o cabeçalho de
 * `escolherContatoCanonico`. Era cópia local com `.limit(1)` e sem `order by`.
 */
async function findContactByPhoneVariants(
  admin: Admin,
  orgId: string,
  rawPhone: string,
): Promise<{ id: string; phone_number: string } | null> {
  return encontrarContatoPorTelefone(admin as never, orgId, rawPhone);
}

async function resolveContactId(
  admin: Admin,
  orgId: string,
  input: OpenSharedContactInput,
): Promise<string> {
  if (input.contact_id) {
    const { data, error } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("id", input.contact_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("contact_not_found");
    return (data as { id: string }).id;
  }

  const phone = input.phone_number ? parseDialablePhone(input.phone_number) : null;
  if (!phone) throw new Error("invalid_phone");
  const canonico = canonicalPhoneBR(phone);

  const existente = await findContactByPhoneVariants(admin, orgId, canonico);
  if (existente) return existente.id;

  const waid = canonico.replace(/\D/g, "");
  const { data: contactId, error: upsertErr } = await admin.rpc(
    "fn_upsert_wa_contact" as never,
    {
      p_org: orgId,
      p_kind: "phone",
      p_phone: canonico,
      p_lid: null,
      p_chat_id: waid,
      p_notify: input.name?.trim() || null,
    } as never,
  );
  if (upsertErr || !contactId) {
    throw new Error(upsertErr?.message ?? "contact_upsert_failed");
  }
  return contactId as string;
}

/**
 * Grava o contexto de quem abriu a conversa (spec 19, item 17) sem apagar nada
 * que já exista: `source` só entra se o contato ainda não tinha origem (a
 * abertura não reescreve a verdade de um contato que já veio de outro canal),
 * o metadata junta com o antigo vencendo choque de chave, e as tags são união
 * de conjuntos — leitura-depois-escrita, porque `text[]` não tem append no
 * PostgREST (mesma conta de `etiquetarConversa`). Falha aqui NÃO derruba a
 * abertura da conversa: o contexto é cortesia, a conversa é o essencial.
 */
async function aplicarContexto(
  admin: Admin,
  orgId: string,
  contactId: string,
  conversationId: string,
  input: OpenSharedContactInput,
): Promise<void> {
  if (input.source || input.source_metadata || input.tags?.length) {
    const { data } = await admin
      .from("contacts")
      .select("source, source_metadata, tags")
      .eq("organization_id", orgId)
      .eq("id", contactId)
      .maybeSingle();
    const atual = (data ?? null) as {
      source?: string | null;
      source_metadata?: Record<string, unknown> | null;
      tags?: string[] | null;
    } | null;
    const patch: Record<string, unknown> = {};
    if (input.source && !atual?.source) patch.source = input.source;
    if (input.source_metadata) {
      patch.source_metadata = { ...input.source_metadata, ...(atual?.source_metadata ?? {}) };
    }
    if (input.tags?.length) {
      const uniao = [...new Set([...(atual?.tags ?? []), ...input.tags])];
      if (uniao.length !== (atual?.tags?.length ?? 0)) patch.tags = uniao;
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await admin
        .from("contacts")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId)
        .eq("id", contactId);
      if (error) {
        logger.warn("[inbox] contexto de origem não gravado no contato", {
          organizationId: orgId,
          contactId,
          causa: error.message,
        });
      }
    }
  }

  if (input.conversation_tags?.length) {
    const { data } = await admin
      .from("conversations")
      .select("tags")
      .eq("organization_id", orgId)
      .eq("id", conversationId)
      .maybeSingle();
    const atuais = ((data as { tags?: string[] | null } | null)?.tags ?? []) as string[];
    const uniao = [...new Set([...atuais, ...input.conversation_tags])];
    if (uniao.length !== atuais.length) {
      const { error } = await admin
        .from("conversations")
        .update({ tags: uniao, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId)
        .eq("id", conversationId);
      if (error) {
        logger.warn("[inbox] etiqueta da conversa não gravada", {
          organizationId: orgId,
          conversationId,
          causa: error.message,
        });
      }
    }
  }
}

/** Garante contato + conversa na sessão indicada; reabre conversa fechada se existir. */
export async function openSharedContactConversation(
  admin: Admin,
  organizationId: string,
  input: OpenSharedContactInput,
): Promise<OpenSharedContactResult> {
  const sessionId = input.channel_session_id ?? (await sessaoProntaParaEnvio(admin, organizationId));
  if (!sessionId) throw new Error("session_not_found");
  const { data: session, error: sessErr } = await admin
    .from("channel_sessions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessErr) throw new Error(sessErr.message);
  if (!session) throw new Error("session_not_found");

  const contactId = await resolveContactId(admin, organizationId, input);
  const conversationId = await ensureConversation(
    admin,
    organizationId,
    contactId,
    sessionId,
  );
  await aplicarContexto(admin, organizationId, contactId, conversationId, input);
  return { conversation_id: conversationId, contact_id: contactId };
}
