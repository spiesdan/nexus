/**
 * A FINALIDADE de um número: para que ele existe na operação.
 *
 * Um negócio tem mais de um número de WhatsApp, e eles não fazem a mesma coisa:
 * um atende e vende (o comercial), outro só avisa que o pedido saiu para
 * entrega (o de expedição). Sem essa distinção, o aviso de rota sai pelo número
 * que o cliente usa para comprar — o mesmo que carrega conversa, campanha e
 * follow-up —, e o cliente recebe uma notificação fria no meio do atendimento.
 *
 * O marcador mora em `channel_sessions.metadata.finalidade` (jsonb que já
 * existia, e que o transporte não usa). Não é coluna porque:
 *
 *  - a ausência do marcador JÁ significa "comercial", então nenhuma linha
 *    antiga precisa de backfill nem de default;
 *  - um banco que subiu código sem a migration continua funcionando — não há
 *    coluna nova para faltar (ver `lib/channels/archived.ts`, mesmo problema);
 *  - o número de finalidades é pequeno e fechado, mas a lista vive aqui, com
 *    type guard, e não espalhada em `if` de string solta.
 *
 * A regra de "um número de expedição por organização" é do servidor, não do
 * banco: ao marcar um, os outros são desmarcados na mesma escrita
 * (`app/api/v1/channel-sessions/[id]/route.ts`).
 */

export const FINALIDADES = ["comercial", "expedicao"] as const;

export type Finalidade = (typeof FINALIDADES)[number];

/** O padrão: tudo que não foi marcado atende e vende. */
export const FINALIDADE_COMERCIAL: Finalidade = "comercial";

/** O número que manda os avisos de "saiu para entrega". */
export const FINALIDADE_EXPEDICAO: Finalidade = "expedicao";

/**
 * Lê o marcador de um `metadata` cru. Valor desconhecido, nulo ou de outro tipo
 * cai em "comercial": o pior desfecho de um dado estranho é o aviso sair pelo
 * número de sempre, nunca o número de atendimento virar remetente de aviso.
 */
export function finalidadeDoCanal(metadata: unknown): Finalidade {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return FINALIDADE_COMERCIAL;
  }
  const valor = (metadata as { finalidade?: unknown }).finalidade;
  return valor === FINALIDADE_EXPEDICAO ? FINALIDADE_EXPEDICAO : FINALIDADE_COMERCIAL;
}

/**
 * Devolve o `metadata` com a finalidade trocada, preservando o resto.
 *
 * "comercial" é o padrão e por isso NÃO é gravado: apagar a chave mantém o
 * jsonb limpo e faz o valor voltar a significar exatamente o que significava
 * antes de alguém ter marcado o número.
 */
export function comFinalidade(metadata: unknown, finalidade: Finalidade): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  if (finalidade === FINALIDADE_EXPEDICAO) {
    base.finalidade = FINALIDADE_EXPEDICAO;
    return base;
  }
  delete base.finalidade;
  return base;
}

/** Vale como etiqueta na tela? Só o que foi marcado de propósito. */
export function eCanalDeExpedicao(metadata: unknown): boolean {
  return finalidadeDoCanal(metadata) === FINALIDADE_EXPEDICAO;
}
