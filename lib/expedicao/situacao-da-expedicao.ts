/**
 * A FAIXA DE SITUAÇÃO — uma PARTIÇÃO, não quatro contagens independentes.
 *
 * O defeito que este módulo existe para impedir (auditoria 71/72): a célula
 * "Concluídas" mostrava `paradasNaRua` (paradas de cargas EM ROTA), e a célula
 * "Aguardando embarque" contava pedidos que JÁ estavam em uma carga montando —
 * o mesmo pedido aparecia em duas células e o número que o despachante lia
 * estava errado.
 *
 * Regra única: **um pedido pertence a uma situação**. A situação de quem está
 * em uma carga é a da carga (`em_rota` → na rua, `montando` → montando,
 * `concluida` → concluídas). Só quem NÃO está em nenhuma carga ativa entra em
 * "aguardando embarque" — e aí sim o status comercial decide elegibilidade.
 * Carga cancelada não é situação: o pedido volta para a fila se ainda for
 * elegível (não é ilha, não conta duas vezes).
 *
 * Tudo aqui é puro: a query/agregação acontece no servidor (`page.tsx`) e o
 * cliente só renderiza o que vier daqui. O teste `soma das células = total`
 * é o gate dessa regra.
 */

/** As quatro e únicas situações da faixa. */
export type SituacaoDoPedido = "na_rua" | "montando" | "concluidas" | "aguardando";

export interface CargaParaSituacao {
  id: string;
  status: string;
}

export interface ItemParaSituacao {
  shipment_id: string;
  order_id: string;
}

export interface PedidoElegivelParaSituacao {
  id: string;
  total_cents: number | null;
}

export interface SituacaoDaExpedicao {
  /** Número de CARGAS — os rótulos grandes e os filtros da faixa. */
  cargas: { naRua: number; montando: number; concluidas: number };
  /** Número de PEDIDOS em cada situação — os rótulos pequenos e a célula 3. */
  pedidos: { naRua: number; montando: number; concluidas: number; aguardando: number };
  /** Valor dos pedidos que esperam embarque, em centavos. */
  valorAguardandoCents: number;
  /** Soma das quatro células. Igual a `pedidos.*` por construção. */
  totalDePedidos: number;
  /**
   * `order_id → situação`. Exposto para o teste provar que nenhum pedido
   * aparece em duas células — contagem por `Set`, não por soma de listas.
   */
  situacaoPorPedido: Record<string, SituacaoDoPedido>;
}

const SITUACAO_DA_CARGA: Record<string, SituacaoDoPedido> = {
  em_rota: "na_rua",
  montando: "montando",
  concluida: "concluidas",
};

/** O tipo usa snake_case; a view usa camelCase. Uma conversão, não duas. */
const CHAVE_DO_CONTADOR: Record<SituacaoDoPedido, keyof SituacaoDaExpedicao["pedidos"]> = {
  na_rua: "naRua",
  montando: "montando",
  concluidas: "concluidas",
  aguardando: "aguardando",
};

export function calcularSituacaoDaExpedicao({
  cargas,
  itens,
  pedidosElegiveis,
}: {
  cargas: CargaParaSituacao[];
  itens: ItemParaSituacao[];
  pedidosElegiveis: PedidoElegivelParaSituacao[];
}): SituacaoDaExpedicao {
  const statusPorCarga = new Map(cargas.map((c) => [c.id, c.status]));

  const cargasContagem = { naRua: 0, montando: 0, concluidas: 0 };
  for (const carga of cargas) {
    if (carga.status === "em_rota") cargasContagem.naRua += 1;
    else if (carga.status === "montando") cargasContagem.montando += 1;
    else if (carga.status === "concluida") cargasContagem.concluidas += 1;
  }

  const situacaoPorPedido: Record<string, SituacaoDoPedido> = {};
  const emCargaAtiva = new Set<string>();

  // Primeiro as cargas: a situação de um pedido embarcado é a da carga,
  // independentemente do status comercial que ele ainda carrega no cadastro.
  for (const item of itens) {
    const situacao = SITUACAO_DA_CARGA[statusPorCarga.get(item.shipment_id) ?? ""];
    if (!situacao) continue; // cancelada/estado desconhecido → volta para a fila
    emCargaAtiva.add(item.order_id);
    // Um pedido duplicado em duas cargas ativas ainda é UM pedido: a primeira
    // situação conhecida vence, e o mapa garante a contagem única.
    if (!(item.order_id in situacaoPorPedido)) situacaoPorPedido[item.order_id] = situacao;
  }

  let valorAguardandoCents = 0;
  for (const pedido of pedidosElegiveis) {
    if (emCargaAtiva.has(pedido.id)) continue; // já contado na carga — não entra duas vezes
    situacaoPorPedido[pedido.id] = "aguardando";
    valorAguardandoCents += pedido.total_cents ?? 0;
  }

  const pedidos = { naRua: 0, montando: 0, concluidas: 0, aguardando: 0 };
  for (const situacao of Object.values(situacaoPorPedido)) pedidos[CHAVE_DO_CONTADOR[situacao]] += 1;

  return {
    cargas: cargasContagem,
    pedidos,
    valorAguardandoCents,
    totalDePedidos: Object.keys(situacaoPorPedido).length,
    situacaoPorPedido,
  };
}
