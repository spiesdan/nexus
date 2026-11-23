/**
 * A flag da escrita transacional da ordem da rota (0335).
 *
 * O padrão é DESLIGADO, como em `ORDER_STOCK_ATOMIC`: o dono liga depois de
 * `pnpm test:db` verde e observa uma janela. O caminho antigo continua intacto
 * até lá — mudar comportamento de expedição sem observação é trocar risco
 * conhecido por risco novo.
 */
export function rotaOrdemAtomicaLigada(): boolean {
  return process.env.ROTA_ORDEM_ATOMIC === "true";
}

/** Um item por pedido da parada, já com a posição validada pela rota. */
export interface ItemOrdemAtomica {
  id: string;
  sequencia: number;
}
