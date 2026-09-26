/**
 * Tema WhatsApp do inbox — assimilação do usuário final.
 *
 * A lista, o fio e o composer seguem a gramática visual do WhatsApp Web
 * (fundo do fio, bolha de saída verde-clara, barras em cinza-gelo, selo de
 * não-lidas verde). Só COR: nenhum comportamento, texto ou regra muda aqui.
 * Escopo estrito ao inbox — o resto do produto mantém os tokens Nexus.
 */

export const WA = {
  /** Fundo do fio da conversa. */
  chatBg: "wa-chat-bg",
  /** Bolha de quem enviou (loja). */
  outgoing: "border border-black/5 bg-[#d9fdd3] text-[#111b21] shadow-sm",
  /** Bolha de quem recebeu (cliente). */
  incoming: "border border-black/5 bg-white text-[#111b21] shadow-sm",
  /** Hora e metadados dentro da bolha. */
  bubbleMeta: "text-[#667781]",
  /** Barras de topo (cabeçalho da conversa, filtros) e base do composer. */
  bar: "bg-[#f0f2f5]",
  /** Linha selecionada na lista. */
  selected: "bg-[#f0f2f5]",
  /** Linha em hover na lista. */
  hover: "hover:bg-[#f5f6f6]",
  /** Selo de não-lidas. */
  unread: "border-transparent bg-[#25d366] text-white",
  /** Rótulo do divisor de dia no fio. */
  dayLabel: "text-[#54656f]",
  /** Barra vertical da citação, saída (loja) — verde a 60%. */
  quoteOut: "border-[#075e54]/60",
  /** Barra vertical da citação, entrada (cliente) — verde cheio. */
  quote: "border-[#075e54]",
} as const;
