/**
 * Funis em LOTE (spec 19, FASE 15 — §45: batch queries, nada de N+1).
 *
 * A aba Campanhas pedia o funil de CADA campanha em uma request (`/painel` por
 * id) — 2 + N requests para desenhar a tela. Aqui o funil de todas as
 * campanhas de UMA família sai em 5 queries (descoberta) ou 3 (venda
 * automática), qual seja o número de campanhas, e as duas listas já
 * obrigatórias carregam junto (`?com_funil=1`).
 *
 * A agregação espelha as rotas de painel individuais, linha por linha — mesma
 * semântica, mesmo vocabulário de estágios (`lib/prospeccao/funil.ts`); o que
 * muda é só a forma de chegar lá: em vez de `in(id, …)` por campanha, tudo
 * viaja numa query e o agrupamento é feito em JS.
 *
 * Falha aqui NÃO derruba a lista: o chamador engole, registra e as linhas
 * ficam sem `funil` (mesmo comportamento de antes, quando uma campanha sem
 * painel deixava o card em silêncio).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { contaComoVenda } from "@/lib/comercial/dashboard";
import { calcularFunil, type FunilDaCampanha } from "@/lib/prospeccao/funil";
import type { StatusComercial } from "@/lib/schemas/prospeccao";
import {
  funilDaCampanhaVa,
  resumoParcialDaFila,
  type LinhaDaFila,
} from "@/lib/venda-automatica/metricas";

type Db = SupabaseClient;

interface ProspectDaCampanha {
  id: string;
  status_comercial: StatusComercial;
  owner_user_id: string | null;
  contact_id: string | null;
  lead_id: string | null;
}

export interface CampanhaComCorte {
  id: string;
  created_at: string;
}

const funilVazio = (): FunilDaCampanha => ({
  encontrados: 0,
  selecionados: 0,
  contatados: 0,
  responderam: 0,
  qualificados: 0,
  oportunidades: 0,
  pedidos: 0,
  faturamento_cents: 0,
});

/**
 * O funil de TODAS as campanhas de descoberta em 5 queries:
 * buscas → resultados → prospects → leads → pedidos, cada uma com `in(…)`
 * cobrindo a união das campanhas e agrupamento em JS.
 *
 * Os limites espelham os da rota individual multiplicados pelo nº de
 * campanhas (500 buscas, 10.000 resultados/prospects, 5.000 pedidos por
 * campanha lá) — o agregado só é truncado se a SOMA passar do que a rota
 * individual truncaria somando as de cada campanha.
 */
export async function funisDaDescoberta(
  supabase: Db,
  org: string,
  campanhas: CampanhaComCorte[],
): Promise<Record<string, FunilDaCampanha>> {
  if (campanhas.length === 0) return {};
  const n = campanhas.length;
  const resultado: Record<string, FunilDaCampanha> = {};
  for (const c of campanhas) resultado[c.id] = funilVazio();

  // 1) buscas da campanha (a mesma ponte campanha → resultados de lá).
  const { data: buscas, error: errBuscas } = await supabase
    .from("prospecting_searches")
    .select("id, campaign_id")
    .eq("organization_id", org)
    .in(
      "campaign_id",
      campanhas.map((c) => c.id),
    )
    .limit(500 * n);
  // Supabase não lança: sem este throw o erro vira "zero encontrados" em
  // silêncio e o catch da rota (logger.warn) nunca dispara.
  if (errBuscas) throw new Error(errBuscas.message);
  const campanhaDaBusca = new Map<string, string>();
  for (const b of (buscas ?? []) as { id: string; campaign_id: string | null }[]) {
    if (b.campaign_id) campanhaDaBusca.set(b.id, b.campaign_id);
  }
  const idsBusca = [...campanhaDaBusca.keys()];
  if (idsBusca.length === 0) return resultado;

  // 2) resultados → prospects por campanha.
  const prospectsDaCampanha = new Map<string, Set<string>>();
  for (const c of campanhas) prospectsDaCampanha.set(c.id, new Set());
  const { data: resultados, error: errResultados } = await supabase
    .from("prospect_search_results")
    .select("prospect_id, search_id")
    .eq("organization_id", org)
    .in("search_id", idsBusca)
    .limit(10000 * n);
  if (errResultados) throw new Error(errResultados.message);
  for (const r of (resultados ?? []) as { prospect_id: string; search_id: string }[]) {
    const campanhaId = campanhaDaBusca.get(r.search_id);
    if (campanhaId) prospectsDaCampanha.get(campanhaId)?.add(r.prospect_id);
  }

  // 3) prospects da união (uma query só).
  const todosIds = [...new Set([...prospectsDaCampanha.values()].flatMap((s) => [...s]))];
  const porId = new Map<string, ProspectDaCampanha>();
  if (todosIds.length > 0) {
    const { data, error: errProspects } = await supabase
      .from("business_prospects")
      .select("id, status_comercial, owner_user_id, contact_id, lead_id")
      .eq("organization_id", org)
      .in("id", todosIds)
      .limit(10000 * n);
    if (errProspects) throw new Error(errProspects.message);
    for (const p of (data ?? []) as unknown as ProspectDaCampanha[]) porId.set(p.id, p);
  }

  const linhasPorCampanha = new Map<string, ProspectDaCampanha[]>();
  for (const c of campanhas) {
    const ids = prospectsDaCampanha.get(c.id) ?? new Set<string>();
    linhasPorCampanha.set(
      c.id,
      [...ids].map((id) => porId.get(id)).filter((p): p is ProspectDaCampanha => !!p),
    );
  }

  // 4) leads da união (oportunidades = lead aberto, como na rota individual).
  const leadsDaCampanha = new Map<string, Set<string>>();
  const todosLeads = new Set<string>();
  for (const c of campanhas) {
    const ids = new Set(
      (linhasPorCampanha.get(c.id) ?? [])
        .map((p) => p.lead_id)
        .filter((v): v is string => !!v),
    );
    leadsDaCampanha.set(c.id, ids);
    for (const id of ids) todosLeads.add(id);
  }
  const statusDoLead = new Map<string, string>();
  const contatoDoLead = new Map<string, string>();
  if (todosLeads.size > 0) {
    const { data: leads, error: errLeads } = await supabase
      .from("crm_leads")
      .select("id, contact_id, status")
      .eq("organization_id", org)
      .in("id", [...todosLeads]);
    if (errLeads) throw new Error(errLeads.message);
    for (const l of (leads ?? []) as { id: string; contact_id: string | null; status: string }[]) {
      statusDoLead.set(l.id, l.status);
      if (l.contact_id) contatoDoLead.set(l.id, l.contact_id);
    }
  }

  // 5) pedidos dos contatos da união, a partir do MENOR created_at das
  //    campanhas (D18: pedido anterior à campanha não foi causado por ela);
  //    o corte por campanha é aplicado em JS.
  const contatoDaCampanha = new Map<string, Set<string>>();
  const todosContatos = new Set<string>();
  for (const c of campanhas) {
    const contatos = new Set<string>();
    for (const p of linhasPorCampanha.get(c.id) ?? []) if (p.contact_id) contatos.add(p.contact_id);
    for (const leadId of leadsDaCampanha.get(c.id) ?? []) {
      const contato = contatoDoLead.get(leadId);
      if (contato) contatos.add(contato);
    }
    contatoDaCampanha.set(c.id, contatos);
    for (const id of contatos) todosContatos.add(id);
  }
  let pedidosLinha: { contact_id: string; total_cents: number; status: string; created_at: string }[] = [];
  if (todosContatos.size > 0) {
    const desdeIso = campanhas.map((c) => c.created_at).sort()[0];
    const { data, error: errPedidos } = await supabase
      .from("commercial_orders")
      .select("contact_id, total_cents, status, created_at")
      .eq("organization_id", org)
      .in("contact_id", [...todosContatos])
      .gte("created_at", desdeIso)
      .limit(5000 * n);
    if (errPedidos) throw new Error(errPedidos.message);
    pedidosLinha = (data ?? []) as unknown as typeof pedidosLinha;
  }

  for (const c of campanhas) {
    const linhas = linhasPorCampanha.get(c.id) ?? [];
    const contatos = contatoDaCampanha.get(c.id) ?? new Set<string>();
    const corte = Date.parse(c.created_at);
    let oportunidades = 0;
    for (const leadId of leadsDaCampanha.get(c.id) ?? []) {
      if (statusDoLead.get(leadId) === "open") oportunidades++;
    }
    let pedidos = 0;
    let faturamento = 0;
    for (const o of pedidosLinha) {
      if (!contatos.has(o.contact_id)) continue;
      if (Date.parse(o.created_at) < corte) continue;
      if (contaComoVenda(o.status)) {
        pedidos++;
        faturamento += o.total_cents;
      }
    }
    resultado[c.id] = calcularFunil(linhas, { oportunidades, pedidos, faturamento_cents: faturamento });
  }
  return resultado;
}

/**
 * O funil da venda automática em 3 queries: fila → leads → pedidos. A
 * agregação da fila é a MESMA da rota de painel (`resumoParcialDaFila`), só
 * que por campanha a partir de uma query única; `dia`/`limite` não entram no
 * funil (só o resumo da tela usa cota do dia), por isso vêm vazios aqui.
 */
export async function funisDaVendaAutomatica(
  supabase: Db,
  org: string,
  campanhas: CampanhaComCorte[],
): Promise<Record<string, FunilDaCampanha>> {
  if (campanhas.length === 0) return {};
  const n = campanhas.length;
  const resultado: Record<string, FunilDaCampanha> = {};
  for (const c of campanhas) resultado[c.id] = funilVazio();

  const { data: fila, error: errFila } = await supabase
    .from("automatic_sales_queue")
    .select("campaign_id, status, dia, interest_level, snapshot, lead_id")
    .eq("organization_id", org)
    .in(
      "campaign_id",
      campanhas.map((c) => c.id),
    )
    .limit(5000 * n);
  if (errFila) throw new Error(errFila.message);
  const linhasPorCampanha = new Map<string, LinhaDaFila[]>();
  for (const c of campanhas) linhasPorCampanha.set(c.id, []);
  for (const l of (fila ?? []) as unknown as (LinhaDaFila & { campaign_id: string | null })[]) {
    if (l.campaign_id && linhasPorCampanha.has(l.campaign_id)) {
      linhasPorCampanha.get(l.campaign_id)?.push(l);
    }
  }

  const todosLeads = new Set<string>();
  for (const [, linhas] of linhasPorCampanha) {
    for (const l of linhas) if (l.lead_id) todosLeads.add(l.lead_id);
  }
  const contatoDoLead = new Map<string, string>();
  if (todosLeads.size > 0) {
    const { data: leads, error: errLeads } = await supabase
      .from("crm_leads")
      .select("id, contact_id")
      .eq("organization_id", org)
      .in("id", [...todosLeads])
      .limit(10000 * n);
    if (errLeads) throw new Error(errLeads.message);
    for (const l of (leads ?? []) as { id: string; contact_id: string | null }[]) {
      if (l.contact_id) contatoDoLead.set(l.id, l.contact_id);
    }
  }

  const contatoDaCampanha = new Map<string, Set<string>>();
  const todosContatos = new Set<string>();
  for (const c of campanhas) {
    const contatos = new Set<string>();
    for (const l of linhasPorCampanha.get(c.id) ?? []) {
      const contato = l.lead_id ? contatoDoLead.get(l.lead_id) : undefined;
      if (contato) contatos.add(contato);
    }
    contatoDaCampanha.set(c.id, contatos);
    for (const id of contatos) todosContatos.add(id);
  }
  let pedidosLinha: { contact_id: string; total_cents: number; status: string; created_at: string }[] = [];
  if (todosContatos.size > 0) {
    const desdeIso = campanhas.map((c) => c.created_at).sort()[0];
    const { data, error: errPedidos } = await supabase
      .from("commercial_orders")
      .select("contact_id, total_cents, status, created_at")
      .eq("organization_id", org)
      .in("contact_id", [...todosContatos])
      .gte("created_at", desdeIso)
      .limit(5000 * n);
    if (errPedidos) throw new Error(errPedidos.message);
    pedidosLinha = (data ?? []) as unknown as typeof pedidosLinha;
  }

  for (const c of campanhas) {
    const resumo = resumoParcialDaFila(linhasPorCampanha.get(c.id) ?? [], "", 0);
    const contatos = contatoDaCampanha.get(c.id) ?? new Set<string>();
    const corte = Date.parse(c.created_at);
    let pedidos = 0;
    let faturamento = 0;
    for (const o of pedidosLinha) {
      if (!contatos.has(o.contact_id)) continue;
      if (Date.parse(o.created_at) < corte) continue;
      if (contaComoVenda(o.status)) {
        pedidos++;
        faturamento += o.total_cents;
      }
    }
    resumo.pedidos = pedidos;
    resumo.faturamento_cents = faturamento;
    resultado[c.id] = funilDaCampanhaVa(resumo);
  }
  return resultado;
}
