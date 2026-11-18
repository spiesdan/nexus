/**
 * MOVIMENTO QUE RESPEITA A PREFERÊNCIA — inclusive o que o CSS não alcança.
 *
 * O produto já reduz animação e transição por CSS (`app/globals.css`, a regra
 * global com `*` e `!important`). Mas **rolagem suave por JavaScript não passa
 * por CSS**: `elemento.scrollIntoView({ behavior: "smooth" })` rola animado
 * mesmo com `prefers-reduced-motion: reduce`, porque a preferência só é
 * consultada pelo `scroll-behavior` do CSS — e a opção passada no JS vence.
 *
 * Medido em 18/11/2026: cinco pontos do produto rolavam suave sem consultar
 * nada — o formulário do pedido ao revelar um campo com erro, o "revisar" do
 * resumo, a parada da expedição, a linha da empresa na prospecção e o bloco de
 * ações fiscais. Para quem tem sensibilidade vestibular, é desconforto; para
 * quem usa o produto oito horas por dia, é a diferença entre um salto e um
 * deslize.
 *
 * A regra que fica: **rolagem programática passa por aqui**. O gate
 * `tests/unit/movimento-respeita-a-preferencia.test.ts` reprova
 * `behavior: "smooth"` fora deste arquivo.
 */

/** `true` quando o sistema pede movimento reduzido. Nunca lança. */
export function prefereMovimentoReduzido(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * `scrollIntoView` com a preferência respeitada: o DESTINO é o mesmo, o
 * percurso é que encurta. Esconder o movimento reduzindo o alcance seria uma
 * versão pior do produto, não uma versão calma dele.
 */
export function rolarPara(
  alvo: Element | null | undefined,
  opcoes: ScrollIntoViewOptions = {},
): void {
  if (!alvo) return;
  alvo.scrollIntoView({
    ...opcoes,
    behavior: prefereMovimentoReduzido() ? "auto" : "smooth",
  });
}

/**
 * Rolagem DENTRO de um contêiner (lista de mensagens, painel), com a mesma
 * regra. `scrollTo` recebe `behavior` do mesmo jeito e também não passa pelo
 * CSS — a preferência precisa ser consultada aqui.
 */
export function rolarDentroDe(
  alvo: HTMLElement | null | undefined,
  opcoes: ScrollToOptions = {},
): void {
  if (!alvo) return;
  alvo.scrollTo({
    ...opcoes,
    behavior: prefereMovimentoReduzido() ? "auto" : "smooth",
  });
}
