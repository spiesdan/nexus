/**
 * Os filtros ANTES de entrar na fila (spec 18 §4) e a cota do dia (§6) —
 * função PURA: nada aqui fala com banco. O motor monta o contexto (queries de
 * duplicidade) e esta função decide; os motivos viram `rejection_reason` na
 * linha da fila e evento na timeline (§22).
 */
import { whatsappPotencial } from "@/lib/prospeccao/normalizacao";

import type { StatusDaFila } from "./tipos";
import { STATUS_QUE_CONSUMEM_COTA } from "./tipos";

export type MotivoDeRecusa =
  | "fora_da_cidade"
  | "fora_da_categoria"
  | "sem_telefone"
  | "telefone_invalido"
  | "sem_whatsapp"
  | "nao_contatar"
  | "ja_cliente"
  | "ja_lead"
  | "ja_foi_prospectada"
  | "conversa_ativa"
  | "mensagem_recente"
  | "ja_recusou"
  | "pedido_em_andamento"
  | "ja_na_fila";

export interface CandidatoDaCampanha {
  nome: string;
  cidade: string | null;
  categorias: string[];
  /** Linha crua de `business_prospects` — mesmos nomes, sem mapeamento. */
  telefone_normalizado: string | null;
  do_not_contact: boolean;
}

export interface ContextoDeDuplicidade {
  /** Já está (ou já esteve) em fila de Venda Automática. */
  jaNaFila: boolean;
  /** É cliente: contato com histórico de pedido. */
  jaCliente: boolean;
  /** Já é lead no funil. */
  jaLead: boolean;
  /** Conversa aberta (qualquer motivo). */
  conversaAtiva: boolean;
  /** Recebeu mensagem outbound recentemente (cooldown por número). */
  mensagemRecente: boolean;
  /** Recusou contato: opt-out, do_not_contact, ou já caiu em not_interested. */
  recusouContato: boolean;
  /** Pedido em andamento. */
  pedidoEmAndamento: boolean;
}

export interface FiltroDaCampanha {
  cidade: string;
  categorias: string[];
}

/** Minúsculas + sem acento: "São Paulo" e "sao paulo" são a mesma cidade. */
export function normalizarTexto(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function cidadeConfere(candidata: string | null, esperada: string): boolean {
  if (!candidata) return false;
  return normalizarTexto(candidata) === normalizarTexto(esperada);
}

function categoriaConfere(categorias: string[], esperadas: string[]): boolean {
  if (esperadas.length === 0) return true; // sem categoria = qualquer uma
  const tem = new Set(categorias.map(normalizarTexto));
  return esperadas.some((e) => tem.has(normalizarTexto(e)));
}

/**
 * §4 na ordem: localização → categoria → duplicidade. O primeiro motivo vence
 * (a tela mostra UM motivo por linha — lista de motivos confunde).
 */
export function avaliarElegibilidade(
  candidato: CandidatoDaCampanha,
  filtro: FiltroDaCampanha,
  contexto: ContextoDeDuplicidade,
): { ok: true } | { ok: false; motivo: MotivoDeRecusa } {
  if (!cidadeConfere(candidato.cidade, filtro.cidade)) {
    return { ok: false, motivo: "fora_da_cidade" };
  }
  if (!categoriaConfere(candidato.categorias, filtro.categorias)) {
    return { ok: false, motivo: "fora_da_categoria" };
  }
  if (candidato.do_not_contact) return { ok: false, motivo: "nao_contatar" };

  if (!candidato.telefone_normalizado) return { ok: false, motivo: "sem_telefone" };
  if (!/^\+\d{8,15}$/.test(candidato.telefone_normalizado)) {
    return { ok: false, motivo: "telefone_invalido" };
  }
  // A Venda Automática fala por WhatsApp: sem número móvel com potencial de WA
  // não há canal — a entrega em fixo não existe.
  if (!whatsappPotencial(candidato.telefone_normalizado)) {
    return { ok: false, motivo: "sem_whatsapp" };
  }

  if (contexto.recusouContato) return { ok: false, motivo: "ja_recusou" };
  if (contexto.jaNaFila) return { ok: false, motivo: "ja_na_fila" };
  if (contexto.jaCliente) return { ok: false, motivo: "ja_cliente" };
  if (contexto.pedidoEmAndamento) return { ok: false, motivo: "pedido_em_andamento" };
  if (contexto.jaLead) return { ok: false, motivo: "ja_lead" };
  if (contexto.conversaAtiva) return { ok: false, motivo: "conversa_ativa" };
  if (contexto.mensagemRecente) return { ok: false, motivo: "mensagem_recente" };

  return { ok: true };
}

/**
 * §6: quanto ainda cabe hoje. A cota é de NOVOS contatos iniciados — quem já
 * passou por CONTACTING conta, seja qual for o desfecho; follow-ups de ontem
 * não entram na conta (eles não passam por CONTACTING de novo).
 */
export function cotaRestante(limiteDiario: number, consumidosHoje: number): number {
  return Math.max(0, limiteDiario - consumidosHoje);
}

/** Quantos dos status da fila já consumiram cota no dia. */
export function contarConsumo(
  linhas: { status: StatusDaFila }[],
): number {
  return linhas.filter((l) => STATUS_QUE_CONSUMEM_COTA.includes(l.status)).length;
}
