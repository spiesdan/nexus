/**
 * OS PEDIDOS QUE PEDEM NOTA E NÃO TÊM NOTA EMITIDA.
 *
 * ─── O que este arquivo decide, e o que ele se recusa a decidir ───────────────
 *
 * A pergunta é "este pedido ainda é um aviso?". Três coisas dizem que SIM, e uma que diz que NÃO SABEMOS:
 *
 *   1. O pedido declara NF (campo `exige_nf` ou o texto da observação)?
 *   2. Ele não está cancelado?
 *   3. Ele não tem nota EMITIDA?
 *
 * E a quarta, que é a que muda a honestidade da tela:
 *
 *   4. Existe integração fiscal que confirme a emissão?
 *
 * Sem a 4, o estado é **NÃO VERIFICADO** — e a tela tem que dizer isso. Um
 * sistema que mostra "NF pendente" para um pedido cuja nota já saiu na SEFAZ,
 * por não ter como saber, treina o operador a ignorar o Meu Dia. O pedido
 * original diz isso com todas as letras: "sem inventar uma confirmação".
 *
 * ─── Por que `invoices.status` conta e um número digitado não ────────────────
 *
 * A regra é: só conta como emitida o que o SISTEMA registrou. Um `invoices` com
 * `status = 'autorizada'` (ou `cancelada`, que também é um desfecho) é a
 * integração falando. Um número que alguém digitou no campo "nota" do cadastro
 * é o operador falando — e é exatamente a confirmação que o pedido original
 * proíbe.
 */
import { exigeNF, trechoQueIndicaNota } from "@/lib/comercial/pedido-fiscal";

/** O que a integração fiscal sabe dizer. */
export type EstadoFiscal = "nao_pediu" | "pendente" | "emitida" | "nao_verificavel";

export interface PedidoParaConferir {
  id: string;
  numero: number;
  cliente_nome: string;
  status: string;
  created_at: string;
  exige_nf?: boolean | null;
  observacoes?: string | null;
}

export interface NotaParaConferir {
  order_id: string | null;
  status: string;
  /** `YYYY-MM-DD`, quando houver. Vem de `invoices`. */
  data_emissao?: string | null;
  numero?: number | null;
  serie?: string | null;
}

/** Os desfechos que a integração considera "resolvido", mesmo um sendo o contrario do esperado. */
const DESFECHOS_TERMINAIS = new Set(["autorizada", "cancelada"]);

/**
 * O estado fiscal do pedido, a partir do que a integração registrou.
 *
 * `notas` é a lista de `invoices` do pedido — pode ter mais de uma (nota de
 * venda e nota de complementação), e o desfecho que importa é o de qualquer
 * uma delas que tenha chegado ao fim.
 */
export function estadoFiscal(
  pedido: PedidoParaConferir,
  notas: NotaParaConferir[],
  integracaoConfiavel: boolean,
): EstadoFiscal {
  if (!exigeNF(pedido)) return "nao_pediu";
  // Cancelado nunca vira pendência fiscal: o pedido não existe mais para o
  // fisco. E a rotina de semeadura da migration 0261 também pula cancelados.
  if (pedido.status === "cancelado") return "nao_pediu";

  // A CONFIANÇA é verificada ANTES de qualquer leitura de `notas`, e esta ordem
  // é o ponto.
  //
  // A primeira versão olhava `invoices` primeiro e só depois perguntava pela
  // confiança: com o provedor `stub` e um `invoices.status = 'autorizada'`, a
  // função devolvia "emitida" — e o XML nunca saiu da máquina. O teste
  // `provedor stub NAO confirma emissão` reprovou, e com razão.
  //
  // Sem integração que consulte a SEFAZ, um `invoices` é um REGISTRO INTERNO, e
  // registro interno não é autorização.
  if (!integracaoConfiavel) return "nao_verificavel";

  const concluidas = notas.filter((n) => DESFECHOS_TERMINAIS.has(n.status));
  if (concluidas.length > 0) return "emitida";

  return "pendente";
}

/** O que a tela mostra para o operador, por estado. */
export function textoDoEstado(estado: EstadoFiscal): {
  titulo: string;
  tom: "erro" | "aviso" | "neutro";
} {
  switch (estado) {
    case "emitida":
      return { titulo: "Nota emitida", tom: "neutro" };
    case "pendente":
      return { titulo: "Pedido pede nota fiscal e não há nota emitida", tom: "erro" };
    case "nao_verificavel":
      return {
        titulo: "Pedido pede nota fiscal — a emissão não pode ser conferida nesta instalação",
        tom: "aviso",
      };
    case "nao_pediu":
      return { titulo: "Não pede nota fiscal", tom: "neutro" };
  }
}

/**
 * A descrição que nomeia o QUE foi found — campo ou texto.
 *
 * "marcado no cadastro" e "a observação diz '…'" são informação de origens
 * diferentes, e quem recebe o aviso precisa saber qual consultar. O campo é o
 * caso comum depois da 0261; o texto é o que sobrou dos pedidos antigos.
 */
export function descricaoDaIndicacao(pedido: PedidoParaConferir): string {
  if (pedido.exige_nf === true) {
    const trecho = trechoQueIndicaNota(pedido.observacoes);
    return trecho
      ? `Marcado no cadastro. A observação também menciona: ${trecho}`
      : "Marcado no cadastro do pedido.";
  }
  const trecho = trechoQueIndicaNota(pedido.observacoes);
  return trecho ? `A observação do pedido menciona: ${trecho}` : "O pedido pede nota fiscal.";
}

/**
 * A chave do alerta.
 *
 * `nf_pendente:<order_id>` — o id do PEDIDO, e não o da nota: um pedido pode
 * ter duas notas, e o aviso é sobre o pedido. Com o id da nota, a segunda nota
 * criaria um segundo aviso para o mesmo pedido.
 */
export function chaveDoAlerta(pedidoId: string): string {
  return `nf_pendente:${pedidoId}`;
}

/**
 * A instalação consegue confirmar emissão?
 *
 * Hoje a resposta é `true` quando existe `invoices` com histórico — que é o
 * que a rota de emissão escreve. Uma instalação com o provedor `stub` grava
 * `invoices` do mesmo jeito, e nesse caso o sistema sabe que a nota foi gerada
 * mas NÃO que a SEFAZ autorizou.
 *
 * Por isso a função recebe `provedor`: `stub` não autoriza nada, e o estado
 * vira `nao_verificavel` em vez de `emitida`/`pendente`. Sem essa distinção, o
 * Meu Dia anunciaria "nota emitida" para um pedido cujo XML nunca saiu da
 * máquina.
 */
export function integracaoConfiavel(provedor: string | null | undefined): boolean {
  const nome = (provedor ?? "").trim().toLowerCase();
  // Ausente ou vazio NÃO é confiável. A versão anterior tratava "sem nome de
  // provedor" como confiável — que é o pior lado para errar: sem integração
  // declarada, o sistema afirmaria que consultou a SEFAZ.
  if (nome === "") return false;
  return nome !== "stub";
}
