/**
 * AS CIDADES DE UMA CARGA — para onde ela vai, na ordem da rota.
 *
 * A fila da expedição mostrava placa, motorista e "3/7 paradas", mas não dizia
 * se aquela carga é a de Canoinhas ou a de Mafra — a primeira pergunta que o
 * despachante faz ao olhar a mesa. A cidade sai do MESMO resolvedor do romaneio
 * (`cidadeDaEntrega`: endereço do pedido primeiro, cadastro depois), porque uma
 * segunda regra aqui faria a linha da carga discordar do papel que o motorista
 * leva.
 *
 * Ordem = ordem das paradas (o `sequencia` da carga), sem repetir cidade: o
 * cabeçalho é um resumo da rota, não a lista de paradas.
 */
import type { ContatosDaEntrega, PedidoComEndereco } from "./endereco-da-entrega";
import { cidadeDaEntrega } from "./endereco-da-entrega";

export interface CidadesDaCarga {
  /** Nomes como a operação os lê ("Canoinhas/SC"), na ordem da rota. */
  cidades: string[];
  /** Paradas cujo endereço não resolve cidade — dito, não escondido. */
  semCidade: number;
}

export function cidadesDaCarga(
  /** `order_id` na ordem das paradas. */
  itens: readonly { order_id: string }[],
  pedidos: ReadonlyMap<string, PedidoComEndereco>,
  contatos: ContatosDaEntrega,
): CidadesDaCarga {
  const cidades: string[] = [];
  let semCidade = 0;
  for (const item of itens) {
    const pedido = pedidos.get(item.order_id);
    const cidade = pedido ? cidadeDaEntrega(pedido, contatos) : null;
    if (!cidade) {
      // Pedido que sumiu do banco conta como sem cidade: esconder a parada
      // faria a linha dizer "4 paradas" e listar 3 cidades.
      semCidade += 1;
      continue;
    }
    if (!cidades.includes(cidade)) cidades.push(cidade);
  }
  return { cidades, semCidade };
}
