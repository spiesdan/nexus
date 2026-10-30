/**
 * A RESTRIÇÃO DE ALCANCE — a POLÍTICA: quem ela atinge e o que o operador lê.
 *
 * A leitura do estado mora em `lib/channels/restricao-de-alcance.ts`, porque
 * descobrir a restrição exige nomear o provider (coluna do identificador da
 * sessão, transporte) e feature não faz isso. Aqui ficam só as duas perguntas
 * que são do PRODUTO:
 *
 *   1. esta campanha é atingida?
 *   2. o que dizer para quem está olhando?
 *
 * ═══ Por que só o disparo FRIO para ═════════════════════════════════════════
 *
 * A restrição é de `reachout` — "abrir conversa". Conversa que já existe
 * continua funcionando, e é isso que a plataforma cobra. Então:
 *
 *   - campanha de prospecção (`publico: "prospects"`) = conversa nova → PARA;
 *   - campanha de recuperação (`publico: "contatos"`) = conversa existente →
 *     segue.
 *
 * Parar as duas seria mais simples e estaria errado: tiraria do operador a
 * recuperação de clientes por causa de uma restrição que não a atinge.
 *
 * ═══ O incidente que originou isto, medido em 30/10/2026 ═══════════════════
 *
 * A campanha mandou duas mensagens (13:49 e 13:50 UTC, ambas entregues). Três
 * segundos depois o transporte registrou a restrição com prazo de 6 horas e
 * removeu o aparelho vinculado (`401 conflict/device_removed`). O produto não
 * conhecia o sinal, então o tick voltava a mandar a cada reconexão — e mandar
 * durante a restrição é exatamente o que faz a plataforma derrubar de novo. O
 * operador via "a conexão caiu", sem causa e sem prazo.
 */
import type { RestricaoDeAlcance } from "@/lib/channels/restricao-de-alcance";

export type { RestricaoDeAlcance };

/** Qual campanha é atingida pela restrição de "abrir conversa". */
export function restricaoAtingeO(publico: string): boolean {
  // `contatos` = recuperação de quem já conversa com a empresa. Qualquer outro
  // valor é prospecção — o default do produto quando a coluna é nula.
  return publico !== "contatos";
}

/**
 * A frase que o operador lê — no lugar do silêncio.
 *
 * `horaLocal` já vem formatada no fuso da organização: mostrar UTC para quem
 * opera em Brasília é o tipo de detalhe que faz a pessoa esperar na hora errada.
 */
export function textoDaRestricao(restricao: RestricaoDeAlcance, horaLocal: string | null): string {
  const prazo =
    horaLocal === null
      ? "sem prazo informado pelo WhatsApp"
      : `até ${horaLocal} (horário da organização)`;
  return (
    `O WhatsApp restringiu este número para iniciar conversas novas ${prazo} ` +
    `(${restricao.tipo}). A campanha volta sozinha depois desse horário — não precisa ` +
    "recriar, reagendar nem reconectar. Mandar durante a restrição é o que faz o WhatsApp " +
    "remover o aparelho vinculado de novo."
  );
}
