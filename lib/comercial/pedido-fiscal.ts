/**
 * A REGRAS DE LEITURA DO PEDIDO, em um lugar só.
 *
 * ─── Por que este arquivo existe ─────────────────────────────────────────────
 *
 * Duas perguntas que três telas vão fazer, e que não podem ter três respostas:
 *
 *   1. Este pedido precisa de nota fiscal?  (`exigeNF`)
 *   2. Quando este valor vence?            (`vencimentoDoRecebimento`)
 *
 * Cada uma delas tem uma parte que é o CAMPO e uma parte que é o TEXTO. A
 * parte do campo é trivial. A parte do texto é onde as implementações divergem,
 * e é a que produz o erro que o operador vê: o Meu Dia acusando um pedido que
 * não precisa de nota, ou permitindo que um que precisa passe sem aviso.
 *
 * ─── A REGRA DO TEXTO, e por que ela é esta ──────────────────────────────────
 *
 * O pedido original diz: procurar "pedido com nf" e "nf", com variação de
 * caixa e espaços, e **sem** uma correspondência tão ampla que dispare para
 * qualquer ocorrência de "nf".
 *
 * "Qualquer ocorrência" é o problema real: `nfl` (sigla do time, endereço) e
 * `NF` dentro de uma palavra qualquer casam com uma busca ingênua. O padrão
 * abaixo exige **borda de palavra** nos dois lados — `(?<![a-z0-9])` e
 * `(?![a-z0-9])` — e é o mesmo mecanismo que a semeadura da migration 0261 usa
 * no Postgres.
 *
 * O que a regex NÃO tenta ser: um interpretador de português. Ela responde
 * sim/não a "a pessoa escreveu isto falando de nota?", e o campo `exige_nf`
 * responde sim/não a "isto é verdade?". Quem decide é a pessoa, na tela.
 *
 * Duas correções que estes testes forçaram, ambas do mesmo tipo — o padrão
 * estava certo e INCOMPLETO, e "incompleto" aqui é o pior defeito possível:
 *
 *   - "nota fiscal" por extenso não casava. Perdia metade das indicações, em
 *     silêncio, sem nenhum pedido aparecer errado.
 *   - "cafe NF na emin" era o contra-exemplo do meu próprio teste, e estava na
 *     lista de NÃO-disparar. Estava errado: é uma compra que PEDE nota, com a
 *     sigla isolada. Marquei como falso positivo o caso que é verdadeiro —
 *     o teste estava protegendo a regra errada.
 */
import { z } from "zod";

/**
 * As formas de pagamento que o sistema entende.
 *
 * `null` é o caso comum e legítimo: todo pedido anterior a 0261 é `null`, e
 * forçar um dos três quebraria o histórico inteiro. "Prazo livre" é um valor
 * de verdade, não uma ausência.
 */
export const FORMAS_DE_PAGAMENTO = ["a_vista", "agendado_30", "agendado_45"] as const;

export type FormaDePagamento = (typeof FORMAS_DE_PAGAMENTO)[number];

export const FORMA_DE_PAGAMENTO_LABEL: Record<FormaDePagamento, string> = {
  a_vista: "À vista",
  agendado_30: "Agendado — 30 dias",
  agendado_45: "Agendado — 45 dias",
};

/** Dias até o vencimento, por forma. `null` = à vista, que vence na entrega. */
export const DIAS_DE_PRAZO: Record<FormaDePagamento, number | null> = {
  a_vista: null,
  agendado_30: 30,
  agendado_45: 45,
};

/**
 * O dia do 30º para o pedido de 45 dias: o aviso preventivo.
 *
 * `DIAS_DE_PRAZO.agendado_45 - 15` parece arbitrário até se lembrar do motivo:
 * com cadência de rotina diária, o primeiro dia em que o operador ainda tem
 * tempo de resolver com folga é o 30. Quinze dias é o espaço entre "precisa
 * cobrar" e "já venceu demais para resolver".
 */
export const DIAS_DO_AVISO_PREVENTIVO_45 = 30;

/**
 * Pedido declara NF?
 *
 * O CAMPO vence o TEXTO, sempre. Um pedido marcado na tela e depois de ter a
 * observação apagada continua pedindo NF; e um pedido sem marcação mas com "com
 * nf" escrito na observação também — porque quem escreveu queria isso e não
 * houve como marcar.
 */
export function exigeNF(pedido: {
  exige_nf?: boolean | null;
  observacoes?: string | null;
}): boolean {
  if (pedido.exige_nf === true) return true;
  return observaPedidoComNota(pedido.observacoes);
}

/**
 * O texto da observação diz que este pedido é com nota?
 *
 * NFD antes de casar: o `/i` do JavaScript não dobra acento, e "nota fiscal"
 * escrito sem acento tem que funcionar igual. A mesma normalização que
 * `seletoresPara` usa no OSM, pelo mesmo motivo.
 */
export function observaPedidoComNota(observacoes: string | null | undefined): boolean {
  if (!observacoes) return false;
  const plano = observacoes.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return PEDIDO_COM_NOTA.test(plano);
}

/**
 * Borda de palavra nos DOIS lados.
 *
 * A classe inclui `_` de propósito: `\w` também inclui, e `campos.nf_pedido` é
 * um identificador interno, não um pedido com nota. `\b` puro resolveria a
 * palavra mas aceitaria o `_`, que é letra para `\w` e não é letra para quem
 * escreve português.
 *
 * E o segundo ramo do padrão — `nota fiscal` — é por extenso. Medido: a PRIMEIRA
 * versão deste arquivo só tinha a sigla, e o teste de "o pedido pede nota
 * fiscal" reprovou em "nota fiscal", "nota fiscal, por favor" e "precisa de
 * nota". Quem escreve pedido no mundo real escreve as duas formas, e uma regra
 * que só lê a sigla perde metade dos casos sem nenhum sinal visível.
 */
export const PEDIDO_COM_NOTA = /(?<![a-z0-9_])(?:n[.]{0,2}\s?f|nota\s+fiscal)(?![a-z0-9_])/i;

/**
 * O pedaço da observação que comprova a marcação — para o alerta do Meu Dia
 * mostrar **por que** ele disparou, e não só que disparou.
 *
 * Um alerta que diz "este pedido precisa de NF" e não diz "achei 'pedido com
 * nf' na observação" obriga o operador a abrir o pedido e procurar de novo.
 * `null` quando a marcação veio do CAMPO, que é o caso comum agora — e aí a
 * frase que a tela mostra é "marcado no cadastro".
 */
export function trechoQueIndicaNota(observacoes: string | null | undefined): string | null {
  if (!observacoes) return null;
  const plano = observacoes.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const achado = plano.match(PEDIDO_COM_NOTA);
  if (!achado || achado.index === undefined) return null;
  // Volta ao original (com acento) para mostrar o texto que a pessoa escreveu.
  const inicio = Math.max(0, achado.index - 28);
  const fim = Math.min(observacoes.length, achado.index + achado[0].length + 28);
  return `…${observacoes.slice(inicio, fim).trim()}…`;
}

/**
 * ─── O VENCIMENTO ────────────────────────────────────────────────────────────
 */

/** O que a função precisa saber para calcular. O mínimo, e nada mais. */
export interface BaseParaVencimento {
  forma_pagamento?: FormaDePagamento | null;
  /** `YYYY-MM-DD`. `null` enquanto a nota não foi emitida. */
  dataEmissaoNf?: string | null;
}

export type ResultadoDoVencimento =
  | { situacao: "a_vista"; vencimento: null }
  | { situacao: "prazo"; vencimento: string }
  /**
   * A decisão de 09/10/2026: prazo SEM nota emitida fica sem data, marcado
   * como dependente. A alternativa — calcular da data do pedido — produziria
   * um vencimento errado que ninguém perceberia que está errado, e que o
   * financeiro trataria como vencido no dia errado.
   */
  | { situacao: "aguardando_nf"; vencimento: null }
  /** Forma desconhecida (texto livre antigo): sem regra, sem data inventada. */
  | { situacao: "indefinido"; vencimento: null };

/**
 * Calcula o vencimento a partir da EMISSÃO DA NOTA, nunca da criação do pedido.
 *
 * A ordem dos testes é o que importa e é deliberada:
 *
 *  1. À vista vence na entrega — não há prazo, e não há o que agendar.
 *  2. Sem nota emitida, um prazo **não tem data**. Isto vem ANTES de qualquer
 *     aritmética, e é o que impede o erro de somar 30 dias numa data que vai
 *     mudar.
 *  3. Forma desconhecida não vira prazo. Texto livre antigo ("30/60/90 dias")
 *     continua existindo em `condicao_pagamento`; inventar 30 dias para ele é
 *     chutar.
 */
export function vencimentoDoRecebimento(base: BaseParaVencimento): ResultadoDoVencimento {
  const forma = base.forma_pagamento ?? null;
  if (forma === "a_vista") return { situacao: "a_vista", vencimento: null };

  const dias = forma === "agendado_30" || forma === "agendado_45" ? DIAS_DE_PRAZO[forma] : null;
  if (dias === null) return { situacao: "indefinido", vencimento: null };

  if (!base.dataEmissaoNf) return { situacao: "aguardando_nf", vencimento: null };

  return { situacao: "prazo", vencimento: somaDias(base.dataEmissaoNf, dias) };
}

/**
 * Soma dias a uma data `YYYY-MM-DD` e devolve `YYYY-MM-DD`.
 *
 * Feito em UTC e à mão, e não com `new Date()`: o constructor de data
 * JavaScript interpreta string sem fuso como **hora local**, e uma máquina em
 * UTC-3 somando 30 dias num dia de virada de mês produz a data errada em
 * parte do mundo. `Date.UTC` não tem fuso, que é o que este cálculo quer.
 *
 * O dia do mês pode estourar (31 + 30 = 61) e o `Date` normaliza — que é o
 * comportamento correto: 31/jan + 30 = 2/mar.
 */
export function somaDias(dataIso: string, dias: number): string {
  const [a, m, d] = dataIso.split("-").map(Number);
  if (!a || !m || !d) return dataIso;
  const ms = Date.UTC(a, m - 1, d) + dias * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Um pedido está a caminho do vencimento? Usado pelas rotinas de alerta.
 *
 * `diasDeAntecedencia` é o quanto antes de vencer o operador quer ser
 * avisado — 5 dias para o vencimento, e o dia 30 para o preventivo do 45.
 */
export function proximoDoVencimento(
  vencimento: string,
  hoje: string,
  diasDeAntecedencia: number,
): boolean {
  const diff = diasEntre(hoje, vencimento);
  return diff >= 0 && diff <= diasDeAntecedencia;
}

/** Dias inteiros de `de` até `ate`. Negativo quando `ate` já passou. */
export function diasEntre(de: string, ate: string): number {
  const ms = Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * O schema da forma de pagamento, para a borda da API.
 *
 * `.optional()` E `.nullable()`, e os dois são necessários: `optional` porque
 * um chamador que não manda o campo (duplicar pedido, ferramenta de MCP, teste)
 * não pode ser obrigado a inventar uma forma de pagamento; `nullable` porque
 * "prazo livre" é um valor real e precisa chegar ao banco como `null`, não como
 * "campo ausente" — são coisas diferentes e o banco trata diferente.
 *
 * Sem os dois, `z.enum(...).nullable()` sozinho faz o TIPO DE ENTRADA exigir a
 * chave, e o erro aparece em `duplicar/route.ts` e `mcp/tools/comercio.ts` —
 * dois chamadores legítimos que não têm o que mandar.
 */
export const FormaDePagamentoSchema = z.enum(FORMAS_DE_PAGAMENTO).nullish();
