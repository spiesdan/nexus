/**
 * O nome de quem EMITIU o pedido — o que está por trás do "Emitido por" da
 * tela de Pedidos.
 *
 * ## Por que não é o badge de origem
 *
 * A tela mostrava `ROTULO_DA_ORIGEM[p.origem]`, ou seja, "emitido por
 * **Vendedor**" para todo pedido criado na mão — o mesmo rótulo para
 * qualquer pessoa da equipe. Quem emitiu é `commercial_orders.created_by`,
 * gravado por `criarPedidoComercial` (`created_by: ctx.userId`) em toda criação
 * e duplicação pela UI. `vendedor_user_id` é o DONO do pedido (comissão,
 * metas) e a tela de novo pedido nem o preenche — serve de fallback só
 * quando o criador é desconhecido (importação/IA).
 *
 * ## O nome é cortesia, o id é a verdade
 *
 * Resolução via `nomesDosAtendentes` (GoTrue Admin API, uma chamada por id
 * distinto): sem `SUPABASE_SERVICE_ROLE_KEY` o helper devolve mapa vazio e
 * `emitente_nome` vem `null` — DECLARADO, com log, não um badge mudo. A tela
 * cai no badge de origem e continua dizendo que há uma origem; o UUID nunca
 * aparece na UI.
 *
 * LGPD: só `full_name`, o mesmo mínimo que `/api/v1/team/assignable` expõe.
 */
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";

export interface LinhaComEmitente {
  created_by: string | null;
  vendedor_user_id?: string | null;
}

/**
 * Anexa `emitente_nome` a cada linha. Uma leitura de nomes para a página
 * inteira (ids deduplicados), não uma por linha.
 */
export async function comNomeDoEmitente<T extends LinhaComEmitente>(
  linhas: T[],
): Promise<Array<T & { emitente_nome: string | null }>> {
  if (linhas.length === 0) return [];
  const ids = linhas
    .flatMap((l) => [l.created_by, l.vendedor_user_id ?? null])
    .filter((id): id is string => Boolean(id));
  const nomes = await nomesDosAtendentes(ids);
  const nomeDe = (id: string | null): string | null => (id ? (nomes.get(id) ?? null) : null);
  return linhas.map((l) => ({
    ...l,
    emitente_nome: nomeDe(l.created_by) ?? nomeDe(l.vendedor_user_id ?? null),
  }));
}
