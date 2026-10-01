/**
 * O vocabulário da Venda Automática (spec 18 §5/§6/§11).
 *
 * Os status estão em minúsculas porque é o padrão do schema (status_comercial,
 * conversations.status) — a spec escreve em CAIXA ALTA por ser texto de tela.
 * Os conjuntos aqui são lidos pela fila, pelo worker, pelo painel e pelos
 * testes de idempotência: um status novo entra na migration E nesta lista, no
 * mesmo commit.
 */

/** A jornada de um item da fila (§5). */
export const STATUS_DA_FILA = [
  "discovered",
  "qualified",
  "queued",
  "contacting",
  "contacted",
  "responded",
  "qualified_lead",
  "opportunity",
  "order",
  "no_response",
  "not_interested",
  "invalid_contact",
  "failed",
] as const;

export type StatusDaFila = (typeof STATUS_DA_FILA)[number];

/**
 * Status que CONSUMEM a cota diária (§6): a cota é de novos contatos iniciados
 * — a linha só conta quando passou por CONTACTING no dia, seja qual for o
 * desfecho. `queued` não conta (ainda não saiu); `discovered`/`qualified` são
 * candidatos que ainda não entraram na fila de envio.
 */
export const STATUS_QUE_CONSUMEM_COTA: readonly StatusDaFila[] = [
  "contacting",
  "contacted",
  "responded",
  "qualified_lead",
  "opportunity",
  "order",
  "no_response",
  "not_interested",
  "invalid_contact",
  "failed",
];

/**
 * Status que mantêm o contato "em andamento" para o unique parcial
 * (organization_id, contact_id) — duas campanhas nunca andam juntas (§15).
 * Estados finais (no_response, not_interested, invalid_contact, failed, order)
 * ficam DE FORA de propósito: um contato encerrado não proíbe outra abordagem
 * futura.
 */
export const STATUS_ATIVOS_DO_CONTATO: readonly StatusDaFila[] = [
  "queued",
  "contacting",
  "contacted",
  "responded",
  "qualified_lead",
  "opportunity",
];

/** Classificação de interesse da conversa (§11), estruturada no banco. */
export const NIVEIS_DE_INTERESSE = ["alto", "medio", "baixo", "recusou"] as const;

export type NivelDeInteresse = (typeof NIVEIS_DE_INTERESSE)[number];

/** Os status que ainda podem evoluir (o passo de respostas enxerga eles). */
export const STATUS_ABERTOS_A_RESPOSTA: readonly StatusDaFila[] = [
  "contacted",
  "responded",
  "qualified_lead",
  "opportunity",
  "no_response",
];

export interface ResumoDaCampanha {
  id: string;
  organization_id: string;
  nome: string;
  status: "active" | "paused" | "completed";
  cidade: string;
  uf: string | null;
  categorias: string[];
  limite_diario: number;
  janela_inicio: string;
  janela_fim: string;
  oferta_produtos: string[];
  perfil_abordagem: string | null;
  followup_horas: number[];
  followup_textos: string[];
  responsavel_user_id: string | null;
}

export interface ItemDaFila {
  id: string;
  organization_id: string;
  campaign_id: string;
  prospect_id: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  lead_id: string | null;
  message_id: string | null;
  dia: string;
  status: StatusDaFila;
  interest_level: NivelDeInteresse | null;
  followup_count: number;
  proximo_followup_at: string | null;
  ultima_mensagem_at: string | null;
  rejection_reason: string | null;
  snapshot: {
    nome?: string;
    categoria?: string;
    cidade?: string;
    telefone?: string;
  };
}
