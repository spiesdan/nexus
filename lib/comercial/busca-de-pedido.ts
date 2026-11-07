/**
 * A BUSCA DO PEDIDO — um termo, três chaves.
 *
 * A tela de Pedidos, a paleta ⌘K e o agente mandam o mesmo `busca` para
 * `GET /api/v1/commercial-orders`, e a rota filtrava só por
 * `cliente_nome`/`cliente_documento`. Digitar o número do pedido — que é o que
 * a pessoa tem na mão (o telefone, o romaneio, o boleto) — devolvia lista
 * vazia sem erro nenhum, como se o pedido não existisse.
 *
 * O número entra nas duas formas que a tela usa: `19405`, que é o que se digita
 * ouvindo no telefone, e `PED-19405`, que é `numeroDoPedido()` e o que aparece
 * na lista. Procurar só um dos dois faz a busca "não funcionar" em metade das
 * vezes — o mesmo raciocínio que `lib/expedicao/buscar-embarcavel.ts` já aplica
 * na fila de embarque.
 *
 * ─── Por que a higienização existe ──────────────────────────────────────────
 *
 * O valor entra cru dentro de `or=(...)` do PostgREST, onde `,` e `()`
 * separam filtros. Um cliente chamado "SILVA, MARIA" quebrava a expressão e a
 * rota respondia 500 em vez de filtrar. Trocar por espaço preserva o que
 * importa (as palavras) e não deixa o texto do usuário virar sintaxe.
 */
export interface BuscaDePedido {
  /** O texto livre, já sem os caracteres que são sintaxe do PostgREST. */
  texto: string;
  /** O número do pedido quando o termo é `19405`, `PED-19405` ou `#19405`. */
  numero: number | null;
}

/** `integer` do Postgres — acima disso não é número de pedido desta loja. */
const MAIOR_NUMERO = 2_147_483_647;

export function lerBuscaDePedido(termo: string): BuscaDePedido {
  const texto = termo
    .replace(/[,()"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // `PED-19405` é como a tela mostra; `#19405` é como se anota no papel.
  const semPrefixo = termo
    .trim()
    .replace(/^ped\s*[-#]?\s*/i, "")
    .replace(/^#\s*/, "");
  const digitos = /^\d{1,10}$/.test(semPrefixo) ? Number(semPrefixo) : null;
  const numero = digitos !== null && digitos > 0 && digitos <= MAIOR_NUMERO ? digitos : null;

  return { texto, numero };
}

/**
 * O `or=` do PostgREST, ou `null` quando não há nada a filtrar.
 *
 * Devolver `null` (e não uma string vazia) impede o chamador de aplicar um
 * filtro que não filtra — `or=` vazio derruba a consulta inteira.
 */
export function filtroOrDeBuscaDePedido(termo: string): string | null {
  const { texto, numero } = lerBuscaDePedido(termo);
  const partes: string[] = [];
  if (texto !== "") {
    partes.push(`cliente_nome.ilike.%${texto}%`, `cliente_documento.ilike.%${texto}%`);
  }
  if (numero !== null) partes.push(`numero.eq.${numero}`);
  return partes.length > 0 ? partes.join(",") : null;
}
