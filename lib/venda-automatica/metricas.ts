/**
 * O resumo e a timeline da campanha (spec 18 §21/§22) — a leitura do painel.
 *
 * Tudo em JS sobre as linhas da campanha: a tabela é pequena (cota diária ×
 * dias), um SELECT resolve o painel inteiro, e nenhuma função de agregação
 * nova precisa nascer no banco para a tela.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { contaComoVenda } from "@/lib/comercial/dashboard";
import type { FunilDaCampanha } from "@/lib/prospeccao/funil";

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
  /** FASE 10 (§28): pedidos/faturamento dos contatos com lead da campanha. */
  pedidos: number;
  faturamento_cents: number;
}

function zero(): Record<StatusDaFila, number> {
  const conta = {} as Record<StatusDaFila, number>;
  for (const s of STATUS_DA_FILA) conta[s] = 0;
  return conta;
}

/** Uma linha da fila — o insumo puro da agregação (FASE 15: lote por campanha). */
export interface LinhaDaFila {
  status: StatusDaFila;
  dia: string;
  interest_level: string | null;
  snapshot: { categoria?: string };
  lead_id: string | null;
}

/**
 * A agregação da fila SEM ir ao banco (extraída da `resumoDaCampanha` na
 * FASE 15): tudo o que depende só das linhas — status, dia, interesse,
 * categoria, contatos/resposta/leads/oportunidades. `pedidos` e
 * `faturamento_cents` nascem zerados: vêm das queries de leads/pedidos, que
 * a rota individual faz e o lote faz uma vez só para todas as campanhas
 * (`lib/prospeccao/funil-lote.ts`). `dia`/`limite` vazios são lícitos quando
 * o chamador só quer o funil (a cota do dia não entra nele).
 */
export function resumoParcialDaFila(linhas: LinhaDaFila[], dia: string, limiteDiario: number): ResumoDaCampanha {
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
    pedidos: 0,
    faturamento_cents: 0,
  };
}

export async function resumoDaCampanha(
  admin: SupabaseClient,
  organizationId: string,
  campaignId: string,
  dia: string,
  limiteDiario: number,
  /** FASE 10: criado em — pedidos ANTES da campanha não foram por ela (D18). */
  desdeIso?: string,
): Promise<ResumoDaCampanha> {
  const { data } = await admin
    .from("automatic_sales_queue")
    .select("status, dia, interest_level, snapshot, lead_id")
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .limit(5000);

  const linhas = (data ?? []) as LinhaDaFila[];
  const resumo = resumoParcialDaFila(linhas, dia, limiteDiario);

  // FASE 10 (§28): o fim do funil — pedidos dos contatos que têm lead DESTA
  // campanha (fila.lead_id → crm_leads.contact_id → commercial_orders),
  // só a partir da criação da campanha (D18). Sem lead não há vínculo: a
  // fila é a única ponte campanha→contato que existe.
  const idsLead = [...new Set(linhas.map((l) => l.lead_id).filter((v): v is string => !!v))];
  if (desdeIso && idsLead.length > 0) {
    const { data: leads } = await admin
      .from("crm_leads")
      .select("id, contact_id")
      .eq("organization_id", organizationId)
      .in("id", idsLead)
      .limit(10000);
    const contatos = [
      ...new Set(((leads ?? []) as { contact_id: string | null }[]).map((l) => l.contact_id).filter((v): v is string => !!v)),
    ];
    if (contatos.length > 0) {
      const { data: pedidosLinhas } = await admin
        .from("commercial_orders")
        .select("total_cents, status")
        .eq("organization_id", organizationId)
        .in("contact_id", contatos)
        .gte("created_at", desdeIso)
        .limit(5000);
      for (const linha of (pedidosLinhas ?? []) as { total_cents: number; status: string }[]) {
        if (contaComoVenda(linha.status)) {
          resumo.pedidos++;
          resumo.faturamento_cents += linha.total_cents;
        }
      }
    }
  }

  return resumo;
}

/**
 * FASE 10 (§28): o resumo da VA virando o funil canônico da spec. Os rótulos
 * do §28 (Encontrados → … → Pedidos) traduzidos para a jornada da fila:
 * selecionados = saiu da descoberta/qualificação automática e entrou no
 * envio (queued + quem passou por ele); qualificados = lead estruturado
 * (qualified_lead + opportunity + order). Contagem independente por estágio
 * — ver o cabeçalho de `lib/prospeccao/funil.ts` (pedido sem oportunidade
 * fechada é dado real, não erro).
 */
export function funilDaCampanhaVa(r: ResumoDaCampanha): FunilDaCampanha {
  const naoSelecionados =
    (r.por_status.discovered ?? 0) + (r.por_status.qualified ?? 0) + (r.por_status.invalid_contact ?? 0);
  return {
    encontrados: r.total,
    selecionados: Math.max(0, r.total - naoSelecionados),
    contatados: r.contatados,
    responderam: r.responderam,
    qualificados:
      (r.por_status.qualified_lead ?? 0) + (r.por_status.opportunity ?? 0) + (r.por_status.order ?? 0),
    oportunidades: r.oportunidades,
    pedidos: r.pedidos,
    faturamento_cents: r.faturamento_cents,
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
