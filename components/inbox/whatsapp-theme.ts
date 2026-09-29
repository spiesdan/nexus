/**
 * Paleta do inbox — o "dark premium" de referência (`Inbox – dark premium.html`),
 * em tokens: nenhuma COR aqui é decision de componente, nenhuma regra de
 * negócio, texto ou comportamento muda neste arquivo.
 *
 * Trocada em 2026-09-28 da gramática WhatsApp Web (`#efeae2`, `#d9fdd3`,
 * selo `#25d366`) para a da referência: canvas = `--bg` do tema, bolha de
 * entrada branca com tinta escura (as duas são fixas na referência — vêm do
 * `:root` dela, não do modo), bolha de saída verde-pálida `#c8e6bb`, seletor
 * da lista em `--brand-soft` com filete esquerdo da marca, e não-lidas na
 * cor da marca em vez do verde WA. Escopo estrito ao inbox — o resto do
 * produto segue os tokens Nexus.
 */
export const WA = {
  /** Fundo do fio da conversa (classe em `app/globals.css`, tema-aware). */
  chatBg: "wa-chat-bg",
  /** Bolha de quem enviou (loja) — verde-pálido da referência. */
  outgoing: "border border-black/5 bg-[#c8e6bb] text-[#1c2b16] shadow-sm",
  /** Bolha de quem recebeu (cliente) — branca nos DOIS temas, como na referência. */
  incoming: "border border-black/5 bg-white text-[#141414] shadow-sm",
  /**
   * Hora e metadados DENTRO da bolha branca. `#667781` e não o `--mute` da
   * referência (`#9a9a9d`): este texto vive sobre branco nos dois temas, e
   * `#9a9a9d` sobre branco dá 2,5:1 — reprovado para 10px. O `#667781` dá
   * 4,5:1 e é o mesmo tom que o WhatsApp usa no lugar.
   */
  bubbleMeta: "text-[#667781]",
  /** Barras de topo (cabeçalho da conversa, filtros) e base do composer. */
  bar: "bg-card",
  /** Linha selecionada na lista — `--brand-soft` da referência. */
  selected: "bg-accent-soft",
  /** Linha em hover na lista. */
  hover: "hover:bg-muted/60",
  /** Selo de não-lidas — a cor da marca, como os contadores das abas. */
  unread: "border-transparent bg-accent text-accent-foreground",
  /** Rótulo do divisor de dia no fio (o resto da pílula vem no componente). */
  dayLabel: "text-muted-foreground",
  /** Barra vertical da citação, saída (loja) — verde da saída a 60%. */
  quoteOut: "border-[#2f6b1f]/60",
  /** Barra vertical da citação, entrada (cliente) — cinza do texto do cliente. */
  quote: "border-[#667781]/60",
} as const;
