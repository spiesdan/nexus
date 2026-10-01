/**
 * Follow-up da Venda Automática (spec 18 §14): 24h sem resposta → FU1 → 48h →
 * FU2 → ENCERRA. Nunca indefinidamente (D6: escalonamento próprio, teto = o
 * comprimento de `campaign.followup_horas`, padrão 2).
 *
 * Texto: o configurado na campanha (`followup_textos[i]`) quando houver, senão
 * o padrão de sempre — follow-up é mensagem curta de retorno, não texto que
 * precisa ser reescrito pela IA a cada envio.
 */

/** Textos padrão quando a campanha não configurou os seus. */
export const TEXTOS_PADRAO_DE_FOLLOWUP: readonly string[] = [
  "Oi, {empresa}! Passando para saber se voce conseguiu ver minha mensagem. Posso te mostrar as opcoes?",
  "Oi, {empresa}! Fica a ultima mensagem por aqui — se fizer sentido, e so responder que a gente te ajuda. Ate mais!",
];

/** `{{empresa}}` trocado pelo nome — render simples, sem engine de template. */
export function textoDeFollowup(
  configurados: readonly string[],
  indice: number,
  empresa: string,
): string {
  const fonte = configurados[indice] ?? TEXTOS_PADRAO_DE_FOLLOWUP[indice] ?? null;
  if (!fonte) return "";
  return fonte.replaceAll("{empresa}", empresa).trim();
}

/**
 * Quanto esperar DEPOIS do envio de mais um follow-up, em horas.
 *
 * O relógio é sempre o da mensagem recém-enviada (no worker, `ultima_mensagem_at`
 * acabou de ser gravado por ela): o primeiro agendamento é `+horas[0]` a partir
 * da PRIMEIRA mensagem; a partir daí, o próximo marco é a diferença entre
 * horários consecutivos — com o padrão {24,48}, FU1 a 24h da primeira e FU2 a
 * 24h do FU1 (≈ 48h da primeira).
 *
 * `null` = acabou: não há marco seguinte, e é o worker que encerra a jornada.
 */
export function atrasoProximoFollowup(horas: readonly number[], followupAposEnvio: number): number | null {
  if (horas.length === 0) return null;
  if (followupAposEnvio <= 0) return (horas[0] ?? 0) * 3_600_000; // agendamento inicial
  const anterior = horas[followupAposEnvio - 1];
  const proximo = horas[followupAposEnvio];
  if (anterior === undefined || proximo === undefined) return null;
  return Math.max(0, (proximo - anterior) * 3_600_000);
}

/** Há mais algum follow-up a enviar após este? (`count` = já enviados) */
export function temFollowupPendente(horas: readonly number[], countEnviados: number): boolean {
  return countEnviados < horas.length;
}
