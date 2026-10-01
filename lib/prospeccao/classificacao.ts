/**
 * A CLASSIFICAÇÃO COMERCIAL (§10 do plano) — a realidade do CRM na fila de
 * prospecção, derivada a cada leitura, nunca gravada.
 *
 * Gravar mentiria com o tempo: o prospect nasce "novo" e o CRM muda depois
 * (vira cliente, ganha lead aberto, é abordado). A classe responde "o que
 * este contato É para a operação hoje"; o detalhe continua no
 * `status_comercial` (workflow do vendedor) e nos vínculos (contact_id /
 * lead_id). Ordem = prioridade: cliente > negociação > lead > descartado >
 * abordado > qualificado > pré-contato > novo.
 *
 * §10 lista os rótulos como exemplos; aqui a cobertura é o enum
 * STATUS_COMERCIAL inteiro + a realidade CRM (contacts + crm_leads).
 */

export const CLASSIFICACOES = [
  "cliente_existente",
  "em_negociacao",
  "lead_existente",
  "sem_potencial",
  "ja_abordado",
  "qualificado",
  "aguardando_qualificacao",
  "novo",
] as const;
export type Classificacao = (typeof CLASSIFICACOES)[number];

export const ROTULO_CLASSIFICACAO: Record<Classificacao, string> = {
  cliente_existente: "Cliente existente",
  em_negociacao: "Em negociação",
  lead_existente: "Lead existente",
  sem_potencial: "Sem potencial / descartado",
  ja_abordado: "Já abordado",
  qualificado: "Qualificado",
  aguardando_qualificacao: "Aguardando qualificação",
  novo: "Novo prospect",
};

/** O que o CRM sabe do prospect, já resolvido em lote pela rota. */
export interface VerdadesCrm {
  /** Cliente: vínculo/contact match por telefone/email, ou status "cliente". */
  cliente: boolean;
  /** Existe lead vinculado (lead_id ou match pelo contato) — qualquer status. */
  temLead: boolean;
  /** E esse lead está aberto: oportunidade em andamento. */
  leadAberto: boolean;
}

export function classificarProspect(
  statusComercial: string,
  crm: VerdadesCrm,
): Classificacao {
  if (crm.cliente || statusComercial === "cliente") return "cliente_existente";
  if (crm.leadAberto) return "em_negociacao";
  if (crm.temLead) return "lead_existente";
  switch (statusComercial) {
    case "sem_interesse":
    case "descartado":
      return "sem_potencial";
    case "contatado":
    case "respondeu":
      return "ja_abordado";
    case "qualificado":
      return "qualificado";
    case "nao_analisado":
    case "contato_pendente":
      return "aguardando_qualificacao";
    default:
      return "novo";
  }
}
