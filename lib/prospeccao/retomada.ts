/**
 * RETOMADA E FOLLOW-UP DE 48h — decisão pura, sem marca no código.
 *
 * Regra do dono: empresa NUNCA contatada recebe o template Meta escolhido na
 * campanha; empresa JÁ contatada recebe o TEXTO DE RETOMADA. Esse texto é
 * PRESET CONFIGURÁVEL (`prospecting_message_presets`, categoria `retomada`) —
 * o nome do tenant nunca entra no código. Quarenta e oito horas depois, um
 * follow-up se a pessoa não respondeu; se respondeu, pediu opt-out, a conversa
 * foi encerrada ou o prospect foi excluído, nada é enviado.
 *
 * LIMITAÇÃO DURA DA META (lib/channels/janela.ts): fora da janela de 24h,
 * texto livre é rejeitado com 131047. Por isso a retomada fora da janela só
 * sai com TEMPLATE APROVADO. Sem template aprovado, o fluxo fica BLOQUEADO com
 * motivo nomeado — nunca "texto bonito que a Meta recusa".
 */
import type { EstadoDaJanela } from "@/lib/channels/janela";

/** Categoria do preset configurável — não é texto de marca. */
export const CATEGORIA_PRESET_RETOMADA = "retomada";
export const HORAS_FOLLOWUP = 48;
export const TETO_TENTATIVAS = 3;

export type DecisaoDeMensagem =
  | { tipo: "template"; template: string; motivo: string }
  | { tipo: "texto"; texto: string; motivo: string }
  | { tipo: "bloqueado"; motivo: string };

/**
 * O texto vem do preset gravado no banco. Nunca há fallback com texto fixo:
 * quando o operador não configurou, a tela diz o que falta.
 */
export function mensagemParaProspect(args: {
  jaContatado: boolean;
  janela: EstadoDaJanela;
  presetRetomada: string | null | undefined;
  templateEscolhido: string;
  templateRetomadaAprovado: string | null | undefined;
}): DecisaoDeMensagem {
  if (!args.jaContatado) {
    return {
      tipo: "template",
      template: args.templateEscolhido,
      motivo: "Primeiro contato: template Meta escolhido na campanha.",
    };
  }
  const preset = args.presetRetomada?.trim() ?? "";
  if (args.janela.tipo === "aberta" && preset !== "") {
    return {
      tipo: "texto",
      texto: preset,
      motivo: "Janela de 24h aberta pela resposta: texto de retomada do preset.",
    };
  }
  if (args.templateRetomadaAprovado?.trim()) {
    return {
      tipo: "template",
      template: args.templateRetomadaAprovado.trim(),
      motivo: "Fora da janela de 24h: template de retomada aprovado na Meta.",
    };
  }
  return {
    tipo: "bloqueado",
    motivo:
      "Fora da janela de 24h e sem template de retomada aprovado na Meta. " +
      "Configure o preset/bind antes de disparar (texto livre fora da janela falha com 131047).",
  };
}

export interface MotivoDeCancelamento {
  cancelar: boolean;
  motivo: string | null;
}

/** Uma linha por (campanha, prospect): reexecutar o tick nunca duplica. */
export function deveAgendarFollowup(args: {
  respondeu: boolean;
  optOut: boolean;
  conversaEncerradaPorOptOut: boolean;
  prospectExcluido: boolean;
  jaAgendado: boolean;
  tentativas: number;
}): MotivoDeCancelamento {
  if (args.jaAgendado) return { cancelar: true, motivo: "já agendado (idempotente)" };
  if (args.prospectExcluido) return { cancelar: true, motivo: "prospect excluído" };
  if (args.optOut || args.conversaEncerradaPorOptOut)
    return { cancelar: true, motivo: "opt-out" };
  if (args.respondeu) return { cancelar: true, motivo: "respondeu" };
  if (args.tentativas >= TETO_TENTATIVAS)
    return { cancelar: true, motivo: "teto de tentativas" };
  return { cancelar: false, motivo: null };
}

/** +48h corridos, em ISO-8601 UTC. */
export function agendarEm(partindoDe: Date): string {
  return new Date(partindoDe.getTime() + HORAS_FOLLOWUP * 3_600_000).toISOString();
}
