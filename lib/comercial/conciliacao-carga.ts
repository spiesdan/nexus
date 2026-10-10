/**
 * FECHAR UMA CARGA NÃO É PAGAR.
 *
 * ─── A regra que este arquivo existe para fixar ──────────────────────────────
 *
 * O pedido original é explícito, e em uma frase que está no cabeçalho da
 * própria regra financeira:
 *
 *   "fechar um romaneio não significa, por si só, que todos os pedidos foram
 *   pagos. A baixa automática deve ocorrer apenas quando houver confirmação do
 *   recebimento conforme os dados e as regras reais do sistema."
 *
 * E a decisão do usuário em 09/10/2026 foi a mesma: **confirmação manual,
 * pedido a pedido**.
 *
 * ─── Por que a regra é pura e fica fora da rota ──────────────────────────────
 *
 * Porque a tentação de fazer a conciliação dentro do handler é exatamente o que
 * produz as duas metades do defeito: dar baixa em tudo porque um cliente pagou,
 * ou não dar baixa em nada porque "fechar romaneio não é pagar" foi lido como
 * "não há o que fazer aqui".
 *
 * As duas estão erradas, e as duas são de um único lugar.
 */
/** O pedido que está no romaneio. */
export interface PedidoDoRomaneio {
  id: string;
  numero: number;
  cliente_nome: string;
  total_cents: number;
  status: string;
}

/** O recebível que o pedido gerou, se gerou. */
export interface RecebivelDoPedido {
  id: string;
  valor_original_cents: number;
  /** Já recebido, somando os pagamentos. */
  valor_recebido_cents: number;
  status: string;
  vencimento: string | null;
}

/** Um item da tela de fechamento: o que a pessoa marcou. */
export interface ConfirmacaoDoRecebimento {
  pedidoId: string;
  /** `null` = a pessoa NÃO marcou este pedido. */
  pago: boolean;
  /** O que ela digitou. Ausente quando `pago` é falso. */
  valorRecebidoCents?: number | null;
  /** `YYYY-MM-DD`. */
  pagoEm?: string | null;
  meioPagamento?: string | null;
  observacao?: string | null;
}

/** O que a conciliação vai fazer, por pedido. */
export type DecisaoDaConciliacao =
  | {
      pedidoId: string;
      numero: number;
      tipo: "baixa";
      recebivelId: string;
      valorCents: number;
      pagoEm: string;
      meioPagamento: string | null;
      observacao: string | null;
      /** Por que este pedido entra — para o log de auditoria. */
      motivo: "confirmado_na_conciliacao";
    }
  | {
      pedidoId: string;
      numero: number;
      tipo: "permanece_em_aberto";
      recebivelId: string | null;
      motivo:
        | "nao_confirmado"
        | "sem_recebivel"
        | "ja_quitado"
        | "valor_invalido"
        | "valor_acima_do_saldo"
        | "parcial";
      /** Quanto falta, quando o motivo diz que falta algo. */
      saldoRestanteCents?: number;
    };

const MEIO_PADRAO = "dinheiro";

/** Todos os motivos que uma decisão pode ter. */
export type MotivoDaDecisao =
  | "confirmado_na_conciliacao"
  | "nao_confirmado"
  | "sem_recebivel"
  | "ja_quitado"
  | "valor_invalido"
  | "valor_acima_do_saldo"
  | "parcial";

/** Valida um item marcado como pago. Devolve o erro, ou `null` se está bem. */
function erroDaConfirmacao(
  c: ConfirmacaoDoRecebimento,
  recebivel: RecebivelDoPedido | null,
): "sem_recebivel" | "ja_quitado" | "valor_invalido" | "valor_acima_do_saldo" | "parcial" | null {
  if (!recebivel) return "sem_recebivel";
  if (recebivel.status === "pago" || recebivel.status === "cancelado") return "ja_quitado";

  const valor = c.valorRecebidoCents ?? null;
  if (valor === null || !Number.isInteger(valor) || valor <= 0) return "valor_invalido";

  const saldo = recebivel.valor_original_cents - recebivel.valor_recebido_cents;
  if (valor > saldo) return "valor_acima_do_saldo";
  // Parcial é uma decisão legítima da conciliação — e o pedido original pede o
  // estado. O que NÃO pode é dar baixa do saldo inteiro com valor parcial, e
  // por isso `parcial` não vira `baixa`: vira `permanece_em_aberto` com o
  // saldo restante explícito.
  if (valor < saldo) return "parcial";
  return null;
}

/**
 * A decisão, pedido a pedido.
 *
 * `confirmacoes` é a lista INTEIRA do que a pessoa marcou — inclusive o que ela
 * deixou sem marcar. Pedido que não está na lista é pedido que ela não escolheu,
 * e a escolha de não marcar é legível.
 */
export function conciliarFechamentoDeCarga(
  pedidos: PedidoDoRomaneio[],
  recebiveisPorPedido: Map<string, RecebivelDoPedido>,
  confirmacoes: ConfirmacaoDoRecebimento[],
  hoje: string,
): DecisaoDaConciliacao[] {
  const porPedido = new Map(confirmacoes.map((c) => [c.pedidoId, c]));
  const decisoes: DecisaoDaConciliacao[] = [];

  for (const pedido of pedidos) {
    const recebivel = recebiveisPorPedido.get(pedido.id) ?? null;
    const confirmacao = porPedido.get(pedido.id);

    if (!confirmacao || !confirmacao.pago) {
      decisoes.push({
        pedidoId: pedido.id,
        numero: pedido.numero,
        tipo: "permanece_em_aberto",
        recebivelId: recebivel?.id ?? null,
        motivo: "nao_confirmado",
        saldoRestanteCents: recebivel
          ? recebivel.valor_original_cents - recebivel.valor_recebido_cents
          : undefined,
      });
      continue;
    }

    const erro = erroDaConfirmacao(confirmacao, recebivel);
    if (erro) {
      // O saldo restante NÃO é sempre "o que está em aberto": num recebimento
      // parcial, o que fica em aberto é o que estava em aberto MENOS o que a
      // pessoa acabou de confirmar. Sem descontar, a tela diz que faltam R$100
      // depois de a pessoa ter pago R$40 — e o operador conclui que a conciliação
      // não funcionou.
      const emAberto = recebivel
        ? recebivel.valor_original_cents - recebivel.valor_recebido_cents
        : 0;
      const restante =
        erro === "parcial" && confirmacao.valorRecebidoCents
          ? emAberto - confirmacao.valorRecebidoCents
          : emAberto;
      decisoes.push({
        pedidoId: pedido.id,
        numero: pedido.numero,
        tipo: "permanece_em_aberto",
        recebivelId: recebivel?.id ?? null,
        motivo: erro,
        saldoRestanteCents: recebivel ? restante : undefined,
      });
      continue;
    }

    decisoes.push({
      pedidoId: pedido.id,
      numero: pedido.numero,
      tipo: "baixa",
      recebivelId: recebivel!.id,
      valorCents: confirmacao.valorRecebidoCents!,
      // Sem a data é HOJE: a pessoa confirmou o recebimento agora, e "quando
      // o pagamento aconteceu" sem ela seria uma informação inventada.
      pagoEm: confirmacao.pagoEm ?? hoje,
      meioPagamento: confirmacao.meioPagamento ?? MEIO_PADRAO,
      observacao: confirmacao.observacao ?? null,
      motivo: "confirmado_na_conciliacao",
    });
  }

  return decisoes;
}

/**
 * A chave de idempotência de uma baixa.
 *
 * `carga:{cargaId}:pedido:{pedidoId}` — e NÃO `carga:{id}`, porque um romaneio
 * agrupa vários pedidos e cada um dá a sua baixa. Uma chave por carga faria a
 * segunda baixa parecer repetida da primeira, e o pedido original proíbe
 * exatamente isso: "se um romaneio agrupar vários pedidos, fazer a conciliação
 * individual de cada pedido".
 */
export function chaveDaBaixa(cargaId: string, pedidoId: string): string {
  return `carga:${cargaId}:pedido:${pedidoId}`;
}

/**
 * O que a pessoa vê depois de fechar: uma linha por pedido, sempre.
 *
 * O pedido original pede "registrar quais pedidos foram processados, quais
 * pagamentos foram confirmados e quais ficaram pendentes". Uma lista só com os
 * processados não responde "o que ficou de fora", e é a informação que impede
 * a pessoa de fechar e esquecer.
 */
export function resumoDaConciliacao(decisoes: DecisaoDaConciliacao[]): {
  processados: number;
  baixados: number;
  emAberto: number;
  totalBaixadoCents: number;
} {
  let baixados = 0;
  let emAberto = 0;
  let totalBaixadoCents = 0;
  for (const d of decisoes) {
    if (d.tipo === "baixa") {
      baixados++;
      totalBaixadoCents += d.valorCents;
    } else {
      emAberto++;
    }
  }
  return { processados: decisoes.length, baixados, emAberto, totalBaixadoCents };
}

/** O texto do motivo, para a tela e para o log de auditoria. */
export function textoDoMotivo(motivo: MotivoDaDecisao): string {
  switch (motivo) {
    case "confirmado_na_conciliacao":
      return "Recebimento confirmado no fechamento da carga.";
    case "nao_confirmado":
      return "Não foi marcado como pago no fechamento.";
    case "sem_recebivel":
      return "O pedido não tem recebível no financeiro.";
    case "ja_quitado":
      return "O recebível já estava quitado.";
    case "valor_invalido":
      return "O valor confirmado não é válido.";
    case "valor_acima_do_saldo":
      return "O valor confirmado é maior que o saldo.";
    case "parcial":
      return "Recebimento parcial: o saldo restante continua em aberto.";
    default:
      return "";
  }
}
