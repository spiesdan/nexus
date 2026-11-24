/**
 * PAGINAÇÃO DO CATÁLOGO — duas passadas, número de página nunca chutado.
 *
 * 1ª passada: diagrama as páginas de produtos (quantas forem, com o índice da
 * seção e a marca de continuação).
 * 2ª passada: calcula quantas páginas o SUMÁRIO ocupa (duas colunas) e só então
 * atribui os números: capa = 1, sumário = 2..1+S, produtos = 2+S..., contracapa
 * no fim. O sumário recebe o número REAL da primeira página de cada seção.
 */
export const PRODUTOS_POR_PAGINA = 4;
export const CATEGORIAS_POR_PAGINA_DE_SUMARIO = 20; // 10 linhas × 2 colunas

export interface SecaoParaDiagramacao<T> {
  chave: string;
  rotulo: string;
  produtos: T[];
}

export interface PaginaDeProdutos<T> {
  secaoChave: string;
  secaoRotulo: string;
  indiceSecao: number;
  primeiraDaSecao: boolean;
  itens: T[];
  numero: number;
}

export interface EntradaDoSumario {
  chave: string;
  rotulo: string;
  pagina: number;
  coluna: 0 | 1;
  linha: number;
}

export interface DiagramacaoDoCatalogo<T = unknown> {
  paginas: PaginaDeProdutos<T>[];
  paginasDeSumario: number;
  sumario: EntradaDoSumario[];
  totalDePaginas: number;
  numeroDaContracapa: number | null;
}

export function diagramarCatalogo<T>(
  secoes: readonly SecaoParaDiagramacao<T>[],
  opcoes: { contracapa: boolean } = { contracapa: false },
): DiagramacaoDoCatalogo<T> {
  const paginas: PaginaDeProdutos<T>[] = [];
  secoes.forEach((secao, indiceSecao) => {
    const itens = secao.produtos;
    if (itens.length === 0) {
      paginas.push({
        secaoChave: secao.chave,
        secaoRotulo: secao.rotulo,
        indiceSecao: indiceSecao + 1,
        primeiraDaSecao: true,
        itens: [],
        numero: 0,
      });
      return;
    }
    for (let inicio = 0, parte = 0; inicio < itens.length; inicio += PRODUTOS_POR_PAGINA, parte += 1) {
      paginas.push({
        secaoChave: secao.chave,
        secaoRotulo: secao.rotulo,
        indiceSecao: indiceSecao + 1,
        primeiraDaSecao: parte === 0,
        itens: itens.slice(inicio, inicio + PRODUTOS_POR_PAGINA),
        numero: 0,
      });
    }
  });

  const paginasDeSumario = Math.max(
    1,
    Math.ceil(secoes.length / CATEGORIAS_POR_PAGINA_DE_SUMARIO),
  );
  const primeiraPaginaDeProdutos = 2 + paginasDeSumario;
  const primeiraDeSecao = new Map<string, number>();
  // A numeração depende do deslocamento do sumário; aplicar ANTES de ler as
  // primeiras páginas de cada seção é o que fazia o sumário mentir.
  paginas.forEach((pagina, indice) => {
    pagina.numero = primeiraPaginaDeProdutos + indice;
    if (pagina.primeiraDaSecao && !primeiraDeSecao.has(pagina.secaoChave)) {
      primeiraDeSecao.set(pagina.secaoChave, pagina.numero);
    }
  });

  const sumario: EntradaDoSumario[] = secoes.map((secao, indice) => ({
    chave: secao.chave,
    rotulo: secao.rotulo,
    pagina: primeiraDeSecao.get(secao.chave) ?? primeiraPaginaDeProdutos,
    coluna: indice < CATEGORIAS_POR_PAGINA_DE_SUMARIO / 2 ||
      (indice % CATEGORIAS_POR_PAGINA_DE_SUMARIO) < CATEGORIAS_POR_PAGINA_DE_SUMARIO / 2
      ? 0
      : 1,
    linha: Math.floor((indice % CATEGORIAS_POR_PAGINA_DE_SUMARIO) / 2),
  }));

  // +1 da capa, que também conta no número impresso.
  const totalDePaginas = 1 + paginasDeSumario + paginas.length + (opcoes.contracapa ? 1 : 0);
  return {
    paginas,
    paginasDeSumario,
    sumario,
    totalDePaginas,
    numeroDaContracapa: opcoes.contracapa ? 2 + paginasDeSumario + paginas.length : null,
  };
}
