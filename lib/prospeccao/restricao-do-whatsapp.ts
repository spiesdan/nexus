/**
 * A RESTRIÇÃO DE ALCANCE DO WHATSAPP — por que a campanha precisa parar
 * sozinha, e por quanto tempo.
 *
 * ═══ O que aconteceu, medido em 30/10/2026 ══════════════════════════════════
 *
 * A campanha mandou duas mensagens (13:49 e 13:50 UTC, ambas entregues). Três
 * segundos depois, o WAHA registrou:
 *
 *     reachout timelock restriction set
 *       enforcementType: "RESTRICT_ALL_COMPANIONS"
 *       timeEnforcementEnds: 2026-10-30T19:50:04Z      ← 6 horas
 *     stream errored out  code:"401"  conflict/device_removed
 *
 * A restrição já estava no payload da sessão desde o primeiro segundo, e o
 * produto não a lia (`grep -r reachoutTimelock` não achava nada). Consequência:
 * toda vez que o número reconectava, o tick voltava a mandar — e mandar DURANTE
 * a restrição é exatamente o comportamento que faz a plataforma derrubar o
 * aparelho de novo. O operador via "a conexão caiu", sem causa e sem prazo, e
 * reconectava para cair outra vez.
 *
 * ═══ Por que só o disparo FRIO para ═════════════════════════════════════════
 *
 * `reachout` é "abrir conversa". Conversa que já existe continua funcionando —
 * e é isso que o WhatsApp cobra. Então:
 *
 *   - campanha de prospecção (`publico: "prospects"`) = conversa nova → PARA;
 *   - campanha de recuperação (`publico: "contatos"`) = conversa existente →
 *     segue.
 *
 * Parar as duas seria mais simples e estaria errado: tiraria do operador a
 * recuperação de clientes por causa de uma restrição que não a atinge.
 *
 * ═══ Falhar ABERTO é a escolha certa aqui ═══════════════════════════════════
 *
 * Se o transporte não responder, `restricaoAtivaDaSessao` devolve `null` e a
 * campanha segue. Não é descuido: o caminho de envio já falha sozinho quando o
 * número está fora, e transformar "não deu para perguntar" em "campanha
 * parada" faria uma oscilação de rede de dois segundos congelar a operação
 * inteira. A restrição só bloqueia quando é POSITIVA e com prazo no futuro.
 */
import { CHANNEL_PROVIDER_WAHA } from "@/lib/channels/capabilities";
import { getWahaClient, type RestricaoDeAlcance } from "@/lib/waha/client";

export type { RestricaoDeAlcance };

/** Qual campanha é atingida pela restrição de "abrir conversa". */
export function restricaoAtingeO(publico: string): boolean {
  // `contatos` = recuperação de quem já conversa com a empresa. Qualquer outro
  // valor é prospecção — o default do produto quando a coluna é nula.
  return publico !== "contatos";
}

/** Só o canal por QR tem aparelho vinculado a restringir. */
function temAparelhoVinculado(sessao: { provider?: string | null }): boolean {
  return sessao.provider === CHANNEL_PROVIDER_WAHA;
}

/**
 * A restrição ativa AGORA nesta sessão, ou `null`.
 *
 * Consulta o transporte na hora — não o banco. O estado gravado tem a idade da
 * última varredura (5 min no melhor caso), e a janela entre "restrição gravada"
 * e "aparelho removido" foi de 3 SEGUNDOS no incidente que originou este
 * arquivo. Uma decisão tomada com dado de 5 minutos atrás não protege nada.
 */
export async function restricaoAtivaDaSessao(
  sessao: {
    provider?: string | null;
    waha_session_name?: string | null;
  },
  agoraMs: number = Date.now(),
): Promise<RestricaoDeAlcance | null> {
  if (!temAparelhoVinculado(sessao)) return null;
  const nome = sessao.waha_session_name;
  if (!nome) return null;

  const client = getWahaClient();
  if (!client) return null;

  try {
    const estado = await client.getSessionQr(nome);
    const restricao = estado.restricaoDeAlcance ?? null;
    if (!restricao) return null;
    // Sem prazo informado não dá para dizer "já passou" — e mandar durante a
    // restrição é o que derruba o número. Trata como ativa.
    if (restricao.terminaEm === null) return restricao;
    return Date.parse(restricao.terminaEm) > agoraMs ? restricao : null;
  } catch {
    // Não deu para perguntar. Segue: o envio em si falha se o número estiver
    // fora, e congelar a operação por uma oscilação de rede é pior.
    return null;
  }
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
