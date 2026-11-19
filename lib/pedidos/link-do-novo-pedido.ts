/**
 * "GERAR PEDIDO" A PARTIR DE UM CLIENTE — um destino, um lugar.
 *
 * O defeito relatado pelo dono: clicar em "Gerar pedido" no perfil do cliente
 * caía em `/app/pedidos/novo` sem o cliente. A causa estava em três pontos da
 * mesma tela (`_acoes.tsx`, `_inteligencia360.tsx` ×2), cada um com o literal
 * `/app/pedidos/novo` copiado — o id do contato simplesmente não viajava.
 *
 * Aqui o destino é calculado uma vez. Quem adicionar um quarto botão importa
 * esta função em vez de recriar a URL (e o teste cobre o contrato).
 */
export function linkDoNovoPedido(contatoId?: string | null): string {
  const base = "/app/pedidos/novo";
  if (!contatoId) return base;
  return `${base}?contato=${encodeURIComponent(contatoId)}`;
}
