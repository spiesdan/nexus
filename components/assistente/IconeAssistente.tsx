/**
 * A marca do assistente — o símbolo do Grok Bot (xAI): uma bola cheia com dois
 * "olhos" de cápsula vazados no quadrante superior direito.
 *
 * ─── De onde vem este desenho ──────────────────────────────────────────────
 *
 * Foi medido no material de lançamento do Grok Bot (`x.ai/news/introducing-
 * grok-bot`, imagem OG) e confere com o ícone do app para macOS (a mesma bola
 * com os mesmos dois olhos, dentro do quadrado preto). O glifo aqui é a versão
 * chapada: só a bola e os olhos, sem o fundo, sem sombra, sem gradiente.
 *
 * Por que ele substituiu o rosto do bloub: a bolota animada (olhos que seguem
 * o cursor, expressões) chamava mais atenção do que os ícones de linha ao
 * lado e fazia o ajudante parecer um mascote. Este é um SÍMBOLO — silhueta
 * única em `currentColor`, do tamanho de um ícone, que herda a cor do botão
 * (cinza em repouso, texto no hover, branco no cabeçalho do painel).
 *
 * ─── Por que os olhos são VAZADOS ──────────────────────────────────────────
 *
 * Na marca original os olhos são o fundo aparecendo, não tinta. Desenhá-los
 * como buracos (`fillRule="evenodd"`) mantém isso em qualquer superfície: o
 * gatilho da TopBar, o cabeçalho colorido do painel, claro ou escuro. Se
 * fossem pintados, precisariam saber a cor de fundo de cada lugar — e o hover
 * do botão (`bg-muted`) mudaria por baixo deles sem aviso.
 *
 * O `viewBox` é 24×24 e a bola ocupa quase tudo (r = 11,55): o desenho é o
 * quadrado inteiro, então `tamanho` é o tamanho desenhado, sem padding
 * interno. Os olhos ficam a ~0,9 unidade da borda — a folga apertada é da
 * marca, e é o que dá o ar de "olhando para cima e para a direita".
 *
 * Marca de terceiro: é o símbolo do Grok Bot. Para uso interno/experimental
 * tudo bem; se o produto for vendido com essa cara, o caminho é desenhar um
 * mark próprio com a mesma geometria — este arquivo é o único lugar a trocar.
 */
export function IconeAssistente({
  tamanho = 24,
  className,
}: {
  tamanho?: number;
  className?: string;
}) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Bola + dois olhos de cápsula (55°), vazados por `evenodd`. */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M12 0.45a11.55 11.55 0 1 0 0 23.1a11.55 11.55 0 1 0 0-23.1ZM13.18 10.14A1.19 1.19 0 0 0 15.13 8.78L13.22 6.06A1.19 1.19 0 0 0 11.27 7.42ZM18.73 7.54A1.19 1.19 0 0 0 20.68 6.18L18.77 3.46A1.19 1.19 0 0 0 16.82 4.82Z"
      />
    </svg>
  );
}
