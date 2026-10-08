/**
 * QUEM É O VENDEDOR DO PEDIDO — a regra, num lugar só.
 *
 * Medido na instalação real: dos 10.769 pedidos, **ZERO** tinham
 * `vendedor_user_id`. A coluna existia, o schema aceitava, a API filtrava por
 * ela, e o PDF já tinha o campo `Vendedor` desenhado — e nada gravava nada,
 * porque a coluna só era preenchida se o chamador mandasse no corpo, e a tela
 * "Novo pedido" não manda.
 *
 * Daí o pedido inteiro do dono inútil: filtro por vendedor que não filtra
 * nada, nome que não sai no PDF, e "o Daniel não pode ver os pedidos da Ana"
 * sem dado onde se apoiar.
 *
 * ─── Por que isto é uma função, e não uma linha dentro de `criar-pedido` ─────
 *
 * Porque a parte que importa é a EXCEÇÃO, e exceção escrita dentro de um
 * `insert` de 40 campos não é revisável: ela passa como `?? null` e ninguém vê.
 * A tentação é atribuir sempre ("o pedido é de quem criou"), e aí um pedido que
 * entra pelo WhatsApp ou pela IA fica em nome de quem por acaso apertou o botão.
 *
 * Isso é pior do que não ter dono: campo vazio se vê, nome errado em relatório
 * de comissão não se percebe.
 */

/** Só o que a regra precisa saber — não o pedido inteiro. */
export interface EntradaDaRegraDeVendedor {
  /** Vendedor explícito do chamador. Vence a regra, em qualquer origem. */
  vendedor_user_id?: string | null;
  origem: string;
}

/**
 * `@param userId` quem está criando o pedido agora (o `created_by`). `null`
 * quando não há pessoa — criação por rotina ou job. Aí não há vendedor a
 * inventar, e a regra cai no `null` do mesmo jeito que cai para as origens de
 * sistema.
 * @returns o `vendedor_user_id` a gravar, ou `null` para pedido sem dono.
 */
export function vendedorDoPedido(
  entrada: EntradaDaRegraDeVendedor,
  userId: string | null,
): string | null {
  // Vendedor explícito manda: quem ATRIBUI é a informação, não o palpite. Vale
  // em qualquer origem, inclusive nas de sistema — há caso em que a IA registra
  // o pedido em nome de um vendedor e isso é verdade.
  if (entrada.vendedor_user_id) return entrada.vendedor_user_id;
  // Pedido feito na mão é do vendedor que fez.
  if (entrada.origem === "vendedor") return userId;
  // `ia`, `whatsapp`, `b2b` e o resto são de sistema: sem dono.
  return null;
}
