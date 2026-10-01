/**
 * O resumo e a timeline da campanha (spec 18 §21/§22) — a leitura do painel.
 *
 * Tudo em JS sobre as linhas da campanha: a tabela é pequena (cota diária ×
 * dias), um SELECT resolve o painel inteiro, e nenhuma função de agregação
 * nova precisa nascer no banco para a tela.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { cotaRestante } from "./elegibilidade";
import { STATUS_DA_FILA, type StatusDaFila } from "./tipos";

export interface ResumoDaCampanha {
  dia: string;
  limite_diario: number;
  consumidos_hoje: number;
  restante_hoje: number;
  pendentes: number;
  total: number;
  por_status: Record<StatusDaFila, number>;
  por_interesse: Record<string, number>;
  por_categoria: Record<string, number>;
  contatados: number;
  responderam: number;
  taxa_resposta_pct: number;
  leads_criados: number;
  oportunidades: number;
}

function zero(): Record<StatusDaFila, number> {
  const conta = {} as Record<StatusDaFila, number>;
  for (const s of STATUS_DA_FILA) conta[s] = 0;
  return conta;
}

export async function resumoDaCampanha(
  admin: SupabaseClient,
  organizationId: string,
  campaignId: string,
  dia: string,
  limiteDiario: number,
): Promise<ResumoDaCampanha> {
  const { data } = await admin
    .from("automatic_sales_queue")
    .select("status, dia, interest_level, snapshot, lead_id")
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .limit(5000);

  const linhas = (data ?? []) as Array<{
    status: StatusDaFila;
    dia: string;
    interest_level: string | null;
    snapshot: { categoria?: string };
    lead_id: string | null;
  }>;

  const por_status = zero();
  const por_interesse: Record<string, number> = {};
  const por_categoria: Record<string, number> = {};
  let consumidos_hoje = 0;
  let pendentes = 0;
  let contatados = 0;
  let responderam = 0;
  let leads_criados = 0;
  let oportunidades = 0;

  const CONSUMEM = new Set([
    "contacting", "contacted", "responded", "qualified_lead", "opportunity",
    "order", "no_response", "not_interested", "invalid_contact", "failed",
  ]);

  for (const l of linhas) {
    por_status[l.status] = (por_status[l.status] ?? 0) + 1;
    if (l.status === "queued") pendentes++;
    if (l.dia === dia && CONSUMEM.has(l.status)) consumidos_hoje++;
    if (l.interest_level) {
      por_interesse[l.interest_level] = (por_interesse[l.interest_level] ?? 0) + 1;
    }
    const cat = l.snapshot?.categoria || "(sem categoria)";
    por_categoria[cat] = (por_categoria[cat] ?? 0) + 1;
    if (CONSUMEM.has(l.status) && l.status !== "failed" && l.status !== "invalid_contact") {
      contatados++;
    }
    if (["responded", "qualified_lead", "opportunity", "order"].includes(l.status)) {
      responderam++;
    }
    if (l.lead_id) leads_criados++;
    if (l.status === "opportunity") oportunidades++;
  }

  return {
    dia,
    limite_diario: limiteDiario,
    consumidos_hoje,
    restante_hoje: cotaRestante(limiteDiario, consumidos_hoje),
    pendentes,
    total: linhas.length,
    por_status,
    por_interesse,
    por_categoria,
    contatados,
    responderam,
    taxa_resposta_pct: contatados > 0 ? Math.round((responderam / contatados) * 100) : 0,
    leads_criados,
    oportunidades,
  };
}

export interface EventoDaTimeline {
  id: string;
  queue_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** A timeline da campanha (§22) — mais recente primeiro. */
export async function timelineDaCampanha(
  admin: SupabaseClient,
  organizationId: string,
  campaignId: string,
  limite = 200,
): Promise<EventoDaTimeline[]> {
  const { data } = await admin
    .from("automatic_sales_events")
    .select("id, queue_id, event_type, payload, created_at")
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(limite);
  return (data ?? []) as unknown as EventoDaTimeline[];
}
