/**
 * O QUE O OPERADOR DIGITOU NO RECEBIMENTO — a decisão, sem React.
 *
 * A rota `POST /purchase-orders/[id]/receber` sempre aceitou receber **parte**
 * (`{ itens: [{ item_id, quantidade }] }`, default = o restante), mas a tela só
 * sabia "receber tudo". Quem recebia 3 de 10 não tinha onde escrever 3.
 *
 * Aqui mora a régua do campo: número inteiro, não negativo, nunca acima do
 * restante daquele item. Deixar isso dentro do componente deixaria a regra
 * presa ao JSX — e é justamente o que o teste consegue exercitar sem navegador.
 */

export interface ItemParaReceber {
  id: string;
  /** Quantidade pedida no pedido de compra. */
  quantidade: number;
  /** Já recebido em recebimentos anteriores. */
  recebidoQtd: number;
}

/** Quanto ainda falta receber deste item (nunca negativo). */
export function restanteDoItem(item: ItemParaReceber): number {
  return Math.max(0, item.quantidade - item.recebidoQtd);
}

/**
 * O problema do que está digitado, ou `null` quando está aceitável.
 *
 * `texto` vazio **não** é erro: significa "o padrão", que é o restante — é o
 * que o campo mostra ao abrir. Vírgula vira ponto porque é assim que se digita
 * em pt-BR e o input não deve brigar com o teclado.
 */
export function problemaDaQuantidade(texto: string | undefined, restante: number): string | null {
  if (texto === undefined || texto.trim() === "") return null;
  const n = Number(texto.replace(",", "."));
  if (!Number.isFinite(n)) return "Digite um número inteiro.";
  if (!Number.isInteger(n)) return "Quantidade inteira — o estoque não tem fração.";
  if (n < 0) return "Quantidade não pode ser negativa.";
  if (n > restante) return `O restante é ${restante}.`;
  return null;
}

/** A quantidade efetiva do campo: o valor digitado ou o restante (padrão). */
export function quantidadeDoCampo(texto: string | undefined, restante: number): number {
  if (texto === undefined || texto.trim() === "") return restante;
  const n = Number(texto.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * As linhas que vão no POST: só o que tem quantidade > 0 e válida.
 *
 * Item com 0 fica de fora de propósito — mandar `quantidade: 0` faria a rota
 * recusar o lote inteiro (`min(1)`), e "não chegou nada deste" é uma decisão
 * legítima do operador.
 */
export function linhasParaReceber(
  itens: ItemParaReceber[],
  textos: Record<string, string | undefined>,
): { item_id: string; quantidade: number }[] {
  return itens
    .map((item) => ({
      item_id: item.id,
      quantidade: quantidadeDoCampo(textos[item.id], restanteDoItem(item)),
    }))
    .filter((l) => Number.isInteger(l.quantidade) && l.quantidade > 0);
}
