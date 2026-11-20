/**
 * TROCAR A TABELA MUDA PREÇO — E A PESSOA VÊ O QUE MUDA ANTES.
 *
 * O editor reprecificava em silêncio: escolher outra tabela alterava o preço das
 * linhas já lançadas sem mostrar de → para. O dono decidiu que nada muda sem o
 * usuário ver. Esta função é a régua pura: dado o carrinho, o catálogo e a nova
 * tabela, devolve exatamente as linhas que mudariam (e quantas ficam de fora
 * por terem preço manual, que é decisão comercial e não se sobrescreve).
 */
import { precoEfetivo } from "@/lib/schemas/precos";
import { precoParaCentavos } from "@/lib/schemas/produtos";

export interface LinhaParaReprecificar {
  key: string;
  nome: string;
  product_id: string;
  precoTexto: string;
  origemPreco?: "base" | "tabela" | "manual";
}

export interface ProdutoParaReprecificar {
  id: string;
  preco_cents: number;
}

export interface TabelaParaReprecificar {
  desconto_pct: number;
  overrides: Map<string, number | null>;
}

export interface MudancaDePreco {
  key: string;
  nome: string;
  deCents: number;
  paraCents: number;
}

export function mudancasDePreco(
  linhas: readonly LinhaParaReprecificar[],
  produtos: ReadonlyMap<string, ProdutoParaReprecificar>,
  nova: TabelaParaReprecificar | null,
): { mudancas: MudancaDePreco[]; manuais: number } {
  const mudancas: MudancaDePreco[] = [];
  let manuais = 0;

  for (const linha of linhas) {
    if (linha.origemPreco === "manual") {
      manuais += 1;
      continue;
    }
    const produto = produtos.get(linha.product_id);
    if (!produto) continue;
    const deCents = precoParaCentavos(linha.precoTexto) ?? 0;
    const paraCents = nova
      ? precoEfetivo(produto.preco_cents, nova.desconto_pct, nova.overrides.get(produto.id) ?? null)
      : produto.preco_cents;
    if (deCents !== paraCents) {
      mudancas.push({ key: linha.key, nome: linha.nome, deCents, paraCents });
    }
  }

  return { mudancas, manuais };
}
