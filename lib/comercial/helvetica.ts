/**
 * A MÉTRICA DA HELVETICA — quanto cada caractere ocupa, em 1/1000 do tamanho
 * da fonte.
 *
 * ═══ POR QUE ISTO EXISTE ═════════════════════════════════════════════════
 *
 * O impresso do pedido é uma cópia da impressão do Mercos, e a cópia é feita
 * por POSIÇÃO: cada trecho é posicionado na coordenada medida no PDF de
 * referência. Isso funciona enquanto cada trecho cabe na largura da sua
 * coluna. Quando não cabe, o navegador do Mercos quebra a linha e EMPURRA o
 * resto do bloco para baixo — e o nosso, que posiciona por coordenada, deixava
 * o texto quebrado passar por cima da linha seguinte.
 *
 * Medido na base do próprio produto, em 19/10/2026: **1.344 dos 10.769 pedidos
 * com cliente têm nome acima de 45 caracteres** — a largura da coluna do nome
 * do cliente. Não é caso raro; é um pedido em cada oito saindo borrado.
 *
 * Para quebrar a linha no mesmo ponto que o navegador, é preciso saber a
 * largura do texto. Daí esta tabela: ela é a do arquivo `Helvetica.afm` /
 * `Helvetica-Bold.afm` — os mesmos que o `@react-pdf` usa para desenhar a
 * Helvetica — e o teste confere cada valor contra as larguras MEDIDAS no PDF
 * de referência do Mercos (pdf.js), campo a campo.
 *
 * ═══ O QUE ELA NÃO É ═════════════════════════════════════════════════════
 *
 * Não é o texto DESENHADO: é a soma das larguras nominais dos glifos, sem os
 * pares de kerning. Medido no nosso próprio PDF (sonda de 19/10/2026, pdf.js
 * lendo o arquivo que geramos): num nome de 68 caracteres a soma nominal fica
 * **8,4pt maior** que o desenhado (388,7 contra 380,3) — o "LT" de "LTDA"
 * sozinho vale 1,3pt.
 *
 * O erro tem DIREÇÃO, e é ela que torna a tabela utilizável: a soma nunca é
 * MENOR que o desenho. Quem quebra a linha por esta tabela quebra no mesmo
 * ponto ou um pouco antes — nunca depois. É exatamente o que se quer, porque
 * a linha que passa da coluna é a que invade a coluna do lado; a que quebra
 * uma palavra antes só desce o resto do bloco uma linha.
 */

/**
 * Larguras do ASCII imprimível (códigos 32..126), na ordem do código.
 * Fonte: `Helvetica.afm` (pdfkit), campo `WX` de cada glifo.
 */
const ASCII_NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778,
  722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/**
 * Larguras do Latin-1 (códigos 160..255) — os acentos que aparecem em nome de
 * empresa brasileira. Os dois códigos que o AFM não define (espaço inquebrável
 * e hífen opcional) ficam com a largura do espaço, que é o que o navegador
 * também faz.
 */
const LATINO_NORMAL = [
  278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 278, 737, 333, 400, 584, 333, 333,
  333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722,
  667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722,
  722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500,
];

/** Idem, em negrito — o rótulo dos campos é negrito na referência. */
const ASCII_NEGRITO = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778,
  722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

const LATINO_NEGRITO = [
  278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 278, 737, 333, 400, 584, 333, 333,
  333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722,
  667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722,
  722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278,
  611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556,
];

const TABELAS = {
  normal: { ascii: ASCII_NORMAL, latino: LATINO_NORMAL },
  negrito: { ascii: ASCII_NEGRITO, latino: LATINO_NEGRITO },
};

/** Largura de um caractere em 1/1000 do tamanho, ou `null` se fora da tabela. */
function milesimos(codigo: number, negrito: boolean): number | null {
  const tabela = negrito ? TABELAS.negrito : TABELAS.normal;
  if (codigo >= 32 && codigo <= 126) return tabela.ascii[codigo - 32] ?? null;
  if (codigo >= 160 && codigo <= 255) return tabela.latino[codigo - 160] ?? null;
  return null;
}

/**
 * Quanto o texto ocupa, em pontos, no tamanho de fonte dado.
 *
 * Caractere fora da tabela (emoji, cirílico, um `\n`) não é chute: conta como a
 * largura do espaço. Errar para baixo numa largura faz a linha quebrar de novo
 * no renderizador e virar uma terceira linha em cima da de baixo; errar para
 * cima só antecipa a quebra em uma palavra.
 */
export function larguraDoTexto(texto: string, tamanho: number, negrito = false): number {
  const doEspaco = milesimos(32, negrito) ?? 278;
  let total = 0;
  for (const caractere of texto) {
    total += milesimos(caractere.codePointAt(0) ?? 0, negrito) ?? doEspaco;
  }
  return (total / 1000) * tamanho;
}

/**
 * Quebra o texto em linhas como o navegador quebra: por espaço, o mais cheio
 * que couber, e da segunda linha em diante com a largura cheia da coluna (a
 * primeira pode ser mais estreita, quando um rótulo em negrito abre o campo).
 *
 * Palavra sozinha maior que a coluna não é cortada — ela fica na linha dela e
 * passa da margem, que é o que o navegador também faz sem `word-break` (e um
 * nome cortado no meio engana mais que um nome comprido).
 */
export function quebrarEmLinhas(
  texto: string,
  coluna: { primeira: number; seguintes: number },
  tamanho: number,
  negrito = false,
): string[] {
  const palavras = texto.trim().split(/\s+/).filter((p) => p !== "");
  if (palavras.length === 0) return [""];

  const larguraDoEspaco = larguraDoTexto(" ", tamanho, negrito);
  const linhas: string[] = [];
  let atual = "";
  let larguraAtual = 0;

  for (const palavra of palavras) {
    const larguraPalavra = larguraDoTexto(palavra, tamanho, negrito);
    const limite = linhas.length === 0 ? coluna.primeira : coluna.seguintes;
    const acrescimo = atual === "" ? larguraPalavra : larguraDoEspaco + larguraPalavra;

    if (atual !== "" && larguraAtual + acrescimo > limite) {
      linhas.push(atual);
      atual = palavra;
      larguraAtual = larguraPalavra;
      continue;
    }
    atual = atual === "" ? palavra : `${atual} ${palavra}`;
    larguraAtual += acrescimo;
  }
  if (atual !== "") linhas.push(atual);

  return linhas;
}
