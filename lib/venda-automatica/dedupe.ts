/**
 * O contexto de duplicidade de cada candidato (spec 18 §4) — uma leva de
 * queries por candidato, tudo filtrado por `organization_id`.
 *
 * A ordem das checagens importa no `avaliarElegibilidade`, não aqui: aqui só
 * coletamos fatos. Duas coleções de memória o trabalho inteiro: o telefone
 * resolve o contato (unique parcial: um contato vivo por número), e o contato
 * resolve conversa, lead e pedido.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContextoDeDuplicidade } from "./elegibilidade";
import { STATUS_ATIVOS_DO_CONTATO } from "./tipos";

/** Cooldown por número: mensagem nossa nos últimos 7 dias = contato recente. */
export const COOLDOWN_DIAS = 7;

const JANELA_ABERTA = ["open", "pending", "claimed", "ai_handling"];

export async function contextoDeDuplicidade(
  admin: SupabaseClient,
  organizationId: string,
  alvo: { prospectId: string | null; telefone: string | null },
): Promise<ContextoDeDuplicidade> {
  const telefone = alvo.telefone;

  // ── Fila de Venda Automática: já andou aqui (em qualquer campanha)? ────────
  const naFila = admin
    .from("automatic_sales_queue")
    .select("status, interest_level")
    .eq("organization_id", organizationId)
    .limit(20);
  const { data: filas } = alvo.prospectId
    ? await naFila.or(`prospect_id.eq.${alvo.prospectId}`)
    : telefone
      ? await naFila.contains("snapshot", { telefone })
      : { data: null };
  const linhas = (filas ?? []) as Array<{ status: string; interest_level: string | null }>;
  const recusou = linhas.some(
    (l) => l.interest_level === "recusou" || l.status === "not_interested",
  );
  const ativo = linhas.some((l) =>
    (STATUS_ATIVOS_DO_CONTATO as readonly string[]).includes(l.status),
  );

  // ── Contato (unique parcial por telefone; merged sai do caminho) ───────────
  const contato = telefone
    ? await admin
        .from("contacts")
        .select("id, is_blocked, consent")
        .eq("organization_id", organizationId)
        .eq("phone_number", telefone)
        .is("is_merged_into", null)
        .limit(1)
        .maybeSingle()
    : { data: null };
  const contatoRow = contato.data as {
    id: string;
    is_blocked: boolean;
    consent?: { marketing?: { declined_at?: string | null } | null } | null;
  } | null;

  const base: ContextoDeDuplicidade = {
    jaNaFila: ativo,
    jaCliente: false,
    jaLead: false,
    conversaAtiva: false,
    mensagemRecente: false,
    recusouContato: recusou || Boolean(contatoRow?.is_blocked) ||
      Boolean(contatoRow?.consent?.marketing?.declined_at),
    pedidoEmAndamento: false,
  };
  if (!contatoRow) return base;

  const contatoId = contatoRow.id;

  // ── Conversa aberta = alguém já está falando com este número ───────────────
  const { data: conversa } = await admin
    .from("conversations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contatoId)
    .in("status", JANELA_ABERTA)
    .limit(1)
    .maybeSingle();
  base.conversaAtiva = Boolean(conversa);

  // ── Mensagem recente (nossa): janela de resfriamento por número ───────────
  const corte = new Date(Date.now() - COOLDOWN_DIAS * 86_400_000).toISOString();
  const { data: recente } = await admin
    .from("messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contatoId)
    .eq("direction", "outbound")
    .gte("created_at", corte)
    .limit(1)
    .maybeSingle();
  base.mensagemRecente = Boolean(recente);

  // ── Lead aberto no funil ──────────────────────────────────────────────────
  const { data: lead } = await admin
    .from("crm_leads")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contatoId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  base.jaLead = Boolean(lead);

  // ── Pedidos: cliente (entregue) vs. em andamento (ciclo aberto) ───────────
  const { data: pedidos } = await admin
    .from("commercial_orders")
    .select("status")
    .eq("organization_id", organizationId)
    .eq("contact_id", contatoId)
    .limit(20);
  const status = ((pedidos ?? []) as Array<{ status: string }>).map((p) => p.status);
  base.jaCliente = status.includes("entregue");
  base.pedidoEmAndamento = status.some(
    (s) => s === "rascunho" || s === "em_analise" || s === "aprovado" || s === "faturado" || s === "expedido",
  );

  return base;
}
