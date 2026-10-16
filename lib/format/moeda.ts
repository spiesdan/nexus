/**
 * FORMATAÇÃO COMERCIAL CANÔNICA — um só lugar.
 *
 * `comoMoeda` e `numeroDoPedido` viviam copiados em `pedidos/_client.tsx` e
 * `products/_client.tsx`, e outras dez telas importavam de dentro da página de
 * pedidos (`@/app/app/pedidos/_client`) — acoplando a tela inteira a quem só
 * queria formatar um número. Mesmo comportamento = mesmo módulo.
 */

/** O valor como quem vende lê. */
export function comoMoeda(cents: number, moeda: string): string {
  const v = (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  return moeda === "BRL" ? `R$ ${v}` : `${moeda} ${v}`;
}

/** O número do pedido como aparece na tela e no PDF. */
export function numeroDoPedido(numero: number): string {
  return `PED-${String(numero).padStart(4, "0")}`;
}

/**
 * Parser BR de valor digitado → centavos. Um só lugar (a regra vivia copiada
 * em cada tela que tinha input monetário, cada uma com um `replace` diferente).
 *
 * Aceita `5.000,00`, `5000,00`, `5000`, `R$ 5.000,00` e, por tolerância,
 * `5000.00` (sem vírgula, ponto = decimal). Sem vírgula e com ponto ambíguo
 * (`1.000`) assume-se decimal EN — quem digita mil redondo em BR escreve
 * `1.000,00` ou `1000`. Retorna `null` quando não é número.
 */
export function centavosDeBr(texto: string): number | null {
  const limpo = texto.trim().replace(/^R\$\s?/, "").replace(/\s/g, "");
  if (!limpo) return null;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null;
  const cents = Math.round(Number(normalizado) * 100);
  return Number.isFinite(cents) ? cents : null;
}
