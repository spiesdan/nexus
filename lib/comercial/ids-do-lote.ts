/**
 * O LOTE DA IMPRESSÃO — do `?ids=` da URL para uma lista de ids válidos.
 *
 * Existe num arquivo próprio (e puro) porque a MESMA regra precisa valer em
 * dois lugares que não podem divergir: a página `/app/pedidos/imprimir`, que
 * redireciona para o PDF, e a rota `/api/v1/commercial-orders/pdf`, que o
 * renderiza. Se cada uma parseasse por sua mão, um dia uma aceitaria o que a
 * outra recusa — e o impresso sairia diferente do que a tela prometeu.
 *
 * Três decisões, todas baratas de justificar:
 *
 * - **Só UUID.** O que vem da query string é entrada de fora; filtrar por
 *   formato deixa o `.in("id", …)` do Postgres receber só o que ele sabe
 *   comparar, sem depender de escape.
 * - **Deduplicar ANTES do teto.** O mesmo pedido duas vezes na lista não pode
 *   consumir duas vagas das 50 — senão "selecionar 50 com um repetido"
 *   viraria 49 impressos.
 * - **Teto de 50.** É o mesmo número que a barra de massa da lista já
 *   enforce: um PDF com 50 páginas é um arquivo; 500 é um arquivo que o
 *   navegador e o render não fecham a tempo.
 */

/** O mesmo teto da barra de massa da lista de pedidos. */
export const MAXIMO_PEDIDOS_NO_LOTE = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `"?ids=a,b,c"` (ou o valor só) → `["a", "b", "c"]`, na ordem escrita.
 *
 * Entrada ausente, vazia ou toda inválida devolve `[]` — nunca lança: quem
 * decide o que fazer com lote vazio é a chamada (redirecionar ou renderizar a
 * tela de impressão), não o parser.
 */
export function idsDoLote(bruto: string | null | undefined): string[] {
  const vistos = new Set<string>();
  const ids: string[] = [];
  for (const pedaco of (bruto ?? "").split(",")) {
    const id = pedaco.trim();
    if (!UUID.test(id) || vistos.has(id)) continue;
    vistos.add(id);
    ids.push(id);
    if (ids.length >= MAXIMO_PEDIDOS_NO_LOTE) break;
  }
  return ids;
}
