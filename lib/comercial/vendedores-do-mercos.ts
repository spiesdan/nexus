/**
 * QUEM VENDEU PELO MERCOS — os nomes que o filtro de vendedor precisa mostrar.
 *
 * O pedido importado grava o emissor em `vendedor_nome` e deixa
 * `vendedor_user_id` nulo quando quem emitiu não é usuário do CRM — "VENDEDOR
 * JB" é o caso real (161 pedidos no primeiro probe, UUID nulo). O filtro da tela
 * de pedidos recorta por esse nome, então a lista dele tem que sair dos PEDIDOS,
 * não do roster da organização: quem não tem usuário nunca está no roster.
 *
 * ## Por que pagina
 *
 * O PostgREST limita a resposta a 1000 linhas por requisição (medido nesta
 * instalação: pedir `limit=20000` devolveu 1000). A organização real tem 11.768
 * pedidos Mercos, e a consulta única ordenada por data devolvia **4** dos 9
 * vendedores — justamente os mais recentes. Quem emitiu no começo da importação
 * (WELERSON, Liane, Anderson…) sumia do filtro, que é exatamente o defeito que
 * este arquivo existe para não repetir.
 *
 * A contagem vem antes para as páginas irem em paralelo: 12 requisições de uma
 * coluna de texto, não 12 idas e voltas em fila. O teto existe para o pior caso
 * (organização grande) não virar uma tempestade de requisições — acima dele os
 * nomes vêm parciais e o chamador DECLARA isso no log, em vez de fingir que a
 * lista está completa.
 *
 * A fonte é injetada (`FonteDeVendedores`) para a regra ser testável sem banco:
 * quem pagina é este arquivo, quem fala com o Supabase é a página.
 */

/** Teto de linhas por resposta do PostgREST nesta instalação — medido. */
export const PAGINA_DE_VENDEDORES = 1000;

/** Trava de segurança: acima disso a lista vem parcial, e o chamador declara. */
export const TETO_DE_PEDIDOS = 20_000;

export interface FonteDeVendedores {
  /** Quantos pedidos candidatos existem (origem Mercos, vendedor sem usuário). */
  contar(): Promise<number>;
  /** Nomes crus de uma fatia fechada da consulta, na ordem canônica. */
  pagina(de: number, ate: number): Promise<Array<string | null>>;
}

export interface VendedoresDoMercos {
  /** Nomes distintos, sem vazios, na ordem em que apareceram. */
  nomes: string[];
  /** `true` quando o teto cortou a varredura — a lista NÃO está completa. */
  truncado: boolean;
  /** Quantas linhas foram efetivamente varridas (para o log). */
  lidos: number;
}

/**
 * Varre os pedidos do Mercos e devolve os nomes distintos de quem emitiu.
 *
 * Nunca lança por causa de uma página vazia: a fonte devolve `null` quando a
 * linha não tem nome e o filtro descarta. Erro de banco vira página vazia do
 * lado do chamador — o filtro perde uma opção, não a tela.
 */
export async function vendedoresDoMercos(
  fonte: FonteDeVendedores,
): Promise<VendedoresDoMercos> {
  const total = await fonte.contar();
  if (!Number.isFinite(total) || total <= 0) {
    return { nomes: [], truncado: false, lidos: 0 };
  }

  const lidos = Math.min(total, TETO_DE_PEDIDOS);
  const paginas = Math.ceil(lidos / PAGINA_DE_VENDEDORES);
  const fatias = await Promise.all(
    Array.from({ length: paginas }, (_, indice) => {
      const de = indice * PAGINA_DE_VENDEDORES;
      return fonte.pagina(de, Math.min(de + PAGINA_DE_VENDEDORES - 1, lidos - 1));
    }),
  );

  const nomes = new Set<string>();
  for (const fatia of fatias) {
    for (const nome of fatia) {
      const limpo = nome?.trim();
      if (limpo) nomes.add(limpo);
    }
  }

  return { nomes: [...nomes], truncado: total > TETO_DE_PEDIDOS, lidos };
}
