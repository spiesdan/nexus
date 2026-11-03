import { z } from "zod";

/**
 * O CONTRATO DAS NOTAS DE ENTRADA — NF-e que emitiram contra o CNPJ.
 *
 * O fluxo anda em 3 passos, cada um com sua rota: SINCRONIZAR puxa os
 * resumos da SEFAZ (distribuição DF-e), MANIFESTAR declara ciência (só
 * então a SEFAZ libera o XML completo) e IMPORTAR grava estoque + contas
 * a pagar. Pular etapa não existe: sem XML não há itens, e sem itens a
 * importação volta 422 nomeando o passo que falta.
 */

export const STATUS_DA_ENTRADA = ["nova", "manifestada", "importada", "ignorada"] as const;
export type StatusDaEntrada = (typeof STATUS_DA_ENTRADA)[number];

export const ROTULO_DA_ENTRADA: Record<StatusDaEntrada, string> = {
  nova: "Nova",
  manifestada: "Manifestada",
  importada: "Importada",
  ignorada: "Ignorada",
};

/** Eventos de manifestação do destinatário (códigos da SEFAZ). */
export const EVENTOS_MANIFESTACAO = ["210200", "210210", "210220", "210240"] as const;
export type EventoManifestacao = (typeof EVENTOS_MANIFESTACAO)[number];

export const ROTULO_DA_MANIFESTACAO: Record<string, string> = {
  ciencia: "Ciência",
  confirmacao: "Confirmação",
  desconhecimento: "Desconhecimento",
  nao_realizada: "Não realizada",
};

/** Código da SEFAZ → nome que a coluna `fiscal_manifestations.evento` aceita. */
export const NOME_DO_EVENTO: Record<
  EventoManifestacao,
  "ciencia" | "confirmacao" | "desconhecimento" | "nao_realizada"
> = {
  "210210": "ciencia",
  "210200": "confirmacao",
  "210220": "desconhecimento",
  "210240": "nao_realizada",
};

export const manifestarEntradaSchema = z.object({
  evento: z.enum(EVENTOS_MANIFESTACAO),
  justificativa: z.string().trim().max(255).optional(),
});

export type ManifestarEntrada = z.infer<typeof manifestarEntradaSchema>;

export const itemEntradaSchema = z.object({
  codigo: z.string(),
  ean: z.string().nullable().optional(),
  descricao: z.string(),
  ncm: z.string().optional(),
  cfop: z.string().optional(),
  unidade: z.string().optional(),
  quantidade: z.number(),
  preco_cents: z.number().int(),
  total_cents: z.number().int(),
  /** 0290 — impostos do item. Ausentes em XML antigo/resumo. */
  icms_cents: z.number().int().optional(),
  ipi_cents: z.number().int().optional(),
  pis_cents: z.number().int().optional(),
  cofins_cents: z.number().int().optional(),
  cst: z.string().optional(),
});

export type ItemEntrada = z.infer<typeof itemEntradaSchema>;

export const duplicataEntradaSchema = z.object({
  numero: z.string().optional(),
  vencimento: z.string().optional(),
  valor_cents: z.number().int(),
});

export type DuplicataEntrada = z.infer<typeof duplicataEntradaSchema>;

/** Conferência: o portão que separa "chegou" de "pode mexer no estoque". */
export const STATUS_DA_CONFERENCIA = [
  "pendente",
  "em_conferencia",
  "aprovada",
  "rejeitada",
] as const;
export type StatusDaConferencia = (typeof STATUS_DA_CONFERENCIA)[number];

export const ROTULO_DA_CONFERENCIA: Record<StatusDaConferencia, string> = {
  pendente: "Pendente",
  em_conferencia: "Em conferência",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
};

/** Situação do documento na SEFAZ (não confundir com o status da importação). */
export const SITUACOES_FISCAIS = [
  "autorizada",
  "cancelada",
  "denegada",
  "desconhecida",
] as const;
export type SituacaoFiscal = (typeof SITUACOES_FISCAIS)[number];

export const ROTULO_DA_SITUACAO: Record<SituacaoFiscal, string> = {
  autorizada: "Autorizada",
  cancelada: "Cancelada",
  denegada: "Denegada",
  desconhecida: "Desconhecida",
};

export interface EntradaFiscal {
  id: string;
  chave: string;
  nsu: number;
  emitente_cnpj: string;
  emitente_nome: string;
  emitente_ie: string | null;
  numero: number | null;
  serie: string | null;
  dh_emi: string | null;
  valor_total_cents: number;
  xml: string | null;
  itens_json: ItemEntrada[];
  cobranca_json: DuplicataEntrada[];
  manifestacao: string | null;
  manifestada_em: string | null;
  status: StatusDaEntrada;
  contact_id: string | null;
  estoque_processado_em: string | null;
  financeiro_processado_em: string | null;
  created_at: string;
  /** 0290 — vínculo com o fornecedor; nulo até a sincronização resolver o CNPJ. */
  supplier_id: string | null;
  tipo_documento: "resumo" | "completa" | null;
  situacao_fiscal: SituacaoFiscal;
  protocolo: string | null;
  dh_entrada: string | null;
  natureza_operacao: string | null;
  totais_json: TotaisDaNota;
  conferencia_status: StatusDaConferencia;
  conferida_por: string | null;
  conferida_em: string | null;
  observacoes: string | null;
}

/** O `ICMSTot` do XML, em centavos. Ausente = o documento é resumo. */
export interface TotaisDaNota {
  produtos_cents?: number;
  frete_cents?: number;
  seguro_cents?: number;
  desconto_cents?: number;
  outras_despesas_cents?: number;
  impostos_cents?: number;
  icms_cents?: number;
  ipi_cents?: number;
  pis_cents?: number;
  cofins_cents?: number;
  total_cents?: number;
}

export interface Pagavel {
  id: string;
  entrada_id: string | null;
  contact_id: string | null;
  fornecedor_nome: string | null;
  fornecedor_cnpj: string | null;
  parcela_n: number;
  total_parcelas: number;
  valor_original_cents: number;
  vencimento: string;
  status: string;
  forma_pagamento: string | null;
  observacoes: string | null;
  created_at: string;
}

export const COLUNAS_DA_ENTRADA =
  "id, chave, nsu, emitente_cnpj, emitente_nome, emitente_ie, numero, serie, dh_emi, " +
  "valor_total_cents, xml, itens_json, cobranca_json, manifestacao, manifestada_em, " +
  "status, contact_id, estoque_processado_em, financeiro_processado_em, created_at, " +
  "supplier_id, tipo_documento, situacao_fiscal, protocolo, dh_entrada, natureza_operacao, " +
  "totais_json, conferencia_status, conferida_por, conferida_em, observacoes";

export const COLUNAS_DO_PAGAVEL =
  "id, entrada_id, contact_id, fornecedor_nome, fornecedor_cnpj, parcela_n, total_parcelas, " +
  "valor_original_cents, vencimento, status, forma_pagamento, observacoes, created_at";

/** Como a linha da grade mostra número/série. */
export function identificacaoDaEntrada(numero: number | null, serie: string | null): string {
  if (numero === null) return "Sem número";
  return serie ? `${numero}/${serie}` : `${numero}`;
}
