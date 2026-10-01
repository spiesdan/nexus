/**
 * As operações da fila (spec 18 §5/§6) — a camada que conversa com
 * `automatic_sales_queue`.
 *
 * Toda transição é um UPDATE CONDICIONAL (`.eq("status", de)`): dois workers
 * no mesmo tick, ou um tick sobreposto ao anterior, não duplicam trabalho —
 * quem não acha a linha para atualizar, não age. É a mesma idempotência do
 * `queued → contacting` que o schema garante por índice único parcial no
 * INSERT; aqui vale para o UPDATE.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CandidatoDaCampanha, FiltroDaCampanha } from "./elegibilidade";
import { STATUS_ABERTOS_A_RESPOSTA, STATUS_QUE_CONSUMEM_COTA, type NivelDeInteresse, type StatusDaFila } from "./tipos";

export interface CampanhaParaFila {
  id: string;
  organization_id: string;
  cidade: string;
  uf: string | null;
  categorias: string[];
  limite_diario: number;
  followup_horas: number[];
  followup_textos: string[];
  responsavel_user_id: string | null;
}

/** Quantas linhas desta campanha já passaram por CONTACTING hoje. */
export async function consumoDoDia(
  admin: SupabaseClient,
  organizationId: string,
  campaignId: string,
  dia: string,
): Promise<number> {
  const { count } = await admin
    .from("automatic_sales_queue")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .eq("dia", dia)
    .in("status", [...STATUS_QUE_CONSUMEM_COTA]);
  return count ?? 0;
}

/** Quantas linhas estão esperando envio (não gastam cota ainda). */
export async function pendentesDoDia(
  admin: SupabaseClient,
  organizationId: string,
  campaignId: string,
): Promise<number> {
  const { count } = await admin
    .from("automatic_sales_queue")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .eq("status", "queued");
  return count ?? 0;
}

/**
 * Os candidatos do Radar para esta campanha. Pré-filtro no banco (cidade,
 * sem bloqueio, com número e potencial de WhatsApp), filtro fino de
 * categoria/acentuacao no `avaliarElegibilidade`.
 *
 * A cidade busca DUAS vezes — crua e sem acento — porque `business_prospects`
 * guarda o que o provedor devolveu ("São Paulo") e o operador pode digitar
 * sem acento. Duas idas baratas em índice valem mais que um `ILIKE` que não
 * acha a cidade de quem escreveu certo-por-outro-jeito.
 */
export async function candidatosDaCampanha(
  admin: SupabaseClient,
  organizationId: string,
  f: FiltroDaCampanha & { uf: string | null },
  limite: number,
): Promise<Array<{ id: string } & CandidatoDaCampanha>> {
  const semAcento = f.cidade
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const buscar = async (cidade: string) => {
    let q = admin
      .from("business_prospects")
      .select("id, nome, cidade, categorias, telefone_normalizado, do_not_contact")
      .eq("organization_id", organizationId)
      .ilike("cidade", cidade)
      .eq("do_not_contact", false)
      .eq("bloqueado", false)
      .not("status_comercial", "in", '("cliente","descartado","sem_interesse")')
      .not("telefone_normalizado", "is", null)
      .eq("whatsapp_potencial", true)
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limite);
    if (f.uf) q = q.eq("estado", f.uf);
    const { data } = await q;
    return (data ?? []) as unknown as Array<{ id: string } & CandidatoDaCampanha>;
  };

  const cru = await buscar(f.cidade);
  if (semAcento === f.cidade) return cru;

  const dobrado = await buscar(semAcento);
  const vistos = new Set(cru.map((c) => c.id));
  return [...cru, ...dobrado.filter((c) => !vistos.has(c.id))].slice(0, limite);
}

/** Insere na fila. `false` = já estava (unique parcial) — não é erro. */
export async function inserirNaFila(
  admin: SupabaseClient,
  dados: {
    organizationId: string;
    campaignId: string;
    prospectId: string;
    contactId: string;
    dia: string;
    snapshot: Record<string, unknown>;
  },
): Promise<boolean> {
  const { error } = await admin.from("automatic_sales_queue").insert({
    organization_id: dados.organizationId,
    campaign_id: dados.campaignId,
    prospect_id: dados.prospectId,
    contact_id: dados.contactId,
    dia: dados.dia,
    status: "queued",
    snapshot: dados.snapshot,
  });
  if (!error) return true;
  return (error as { code?: string } | null)?.code === "23505";
}

/**
 * `queued → contacting` — a reivindicação. Devolve false se outro worker já
 * levou a linha (ou se ela saiu de `queued` por ação humana).
 */
export async function reivindicarEnvio(
  admin: SupabaseClient,
  organizationId: string,
  queueId: string,
  dia: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("automatic_sales_queue")
    .update({ status: "contacting", dia, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", queueId)
    .eq("status", "queued")
    .select("id");
  if (error) return false;
  return (data ?? []).length > 0;
}

/**
 * Devolve uma linha `contacting` presa (worker morreu no meio do envio).
 * 15 minutos: tempo de mais de um tick e de um envio lento, pouco suficiente
 * para não brigar com um worker vivo.
 *
 * O desfecho depende de QUAL reivindicação ficou órfã: `followup_count = 0` é
 * a primeira mensagem → volta para `queued` (a cota só é gasta quando o envio
 * de fato acontece); `followup_count > 0` é um follow-up → volta para
 * `contacted` com o agendamento intacto, senão a linha voltaria à fila como
 * se nunca tivesse sido contatada e mandaria a primeira mensagem de novo.
 */
export async function recuperarTravadas(
  admin: SupabaseClient,
  organizationId: string,
  campaignId: string,
  agoraIso: string,
): Promise<void> {
  const corte = new Date(new Date(agoraIso).getTime() - 15 * 60_000).toISOString();
  await admin
    .from("automatic_sales_queue")
    .update({ status: "queued", updated_at: agoraIso })
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .eq("status", "contacting")
    .eq("followup_count", 0)
    .lt("updated_at", corte);
  await admin
    .from("automatic_sales_queue")
    .update({ status: "contacted", updated_at: agoraIso })
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .eq("status", "contacting")
    .gt("followup_count", 0)
    .lt("updated_at", corte);
}

/** UPDATE condicional genérico: só transiciona se o status for o esperado. */
export async function transicionar(
  admin: SupabaseClient,
  organizationId: string,
  queueId: string,
  de: StatusDaFila,
  campos: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await admin
    .from("automatic_sales_queue")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", queueId)
    .eq("status", de)
    .select("id");
  if (error) return false;
  return (data ?? []).length > 0;
}

export interface LinhaParaEnvio {
  id: string;
  contact_id: string;
  snapshot: { nome?: string; categoria?: string; cidade?: string; telefone?: string };
}

export async function filaParaEnvio(
  admin: SupabaseClient,
  organizationId: string,
  campaignId: string,
  limite: number,
): Promise<LinhaParaEnvio[]> {
  const { data } = await admin
    .from("automatic_sales_queue")
    .select("id, contact_id, snapshot")
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .eq("status", "queued")
    .not("contact_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(limite);
  return (data ?? []) as unknown as LinhaParaEnvio[];
}

export interface LinhaParaFollowup {
  id: string;
  conversation_id: string | null;
  contact_id: string;
  followup_count: number;
  proximo_followup_at: string;
  ultima_mensagem_at: string | null;
  snapshot: { nome?: string };
}

export async function filaParaFollowup(
  admin: SupabaseClient,
  organizationId: string,
  campaignId: string,
  agoraIso: string,
  limite = 20,
): Promise<LinhaParaFollowup[]> {
  const { data } = await admin
    .from("automatic_sales_queue")
    .select(
      "id, conversation_id, contact_id, followup_count, proximo_followup_at, ultima_mensagem_at, snapshot",
    )
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .eq("status", "contacted")
    .not("proximo_followup_at", "is", null)
    .lte("proximo_followup_at", agoraIso)
    .order("proximo_followup_at", { ascending: true })
    .limit(limite);
  return (data ?? []) as unknown as LinhaParaFollowup[];
}

export interface LinhaParaClassificar {
  id: string;
  status: StatusDaFila;
  conversation_id: string;
  contact_id: string;
  prospect_id: string | null;
  lead_id: string | null;
  ultima_mensagem_at: string;
  interest_level: NivelDeInteresse | null;
  snapshot: { nome?: string; categoria?: string; cidade?: string };
}

export async function filaParaClassificacao(
  admin: SupabaseClient,
  organizationId: string,
  campaignId: string,
  limite = 10,
): Promise<LinhaParaClassificar[]> {
  const { data } = await admin
    .from("automatic_sales_queue")
    .select(
      "id, status, conversation_id, contact_id, prospect_id, lead_id, ultima_mensagem_at, interest_level, snapshot",
    )
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .in("status", [...STATUS_ABERTOS_A_RESPOSTA])
    .not("conversation_id", "is", null)
    .not("ultima_mensagem_at", "is", null)
    .order("ultima_mensagem_at", { ascending: true })
    .limit(limite);
  return (data ?? []) as unknown as LinhaParaClassificar[];
}
