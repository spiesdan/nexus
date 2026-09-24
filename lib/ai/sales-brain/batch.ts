import { historicoDeCompra, type PedidoParaRadar } from "@/lib/comercial/radar-compras";
import { ordenarRecomendacoes, recomendar } from "@/lib/ai/sales-brain/recommend";

/**
 * NEXUS Sales Brain — lote sobre pedidos reais.
 *
 * Quem chama (API/worker) carrega `commercial_orders` com `organization_id`
 * explícito e passa aqui. Nada de mock: sem pedidos, sem recomendações.
 */
export function brainDoLote(pedidos: PedidoParaRadar[], hoje: string): ReturnType<typeof recomendar>[] {
  const porContato = new Map<string, PedidoParaRadar[]>();
  for (const p of pedidos) {
    if (!p.contact_id) continue;
    const lista = porContato.get(p.contact_id) ?? [];
    lista.push(p);
    porContato.set(p.contact_id, lista);
  }
  const recs = [...porContato.entries()].map(([contactId, lista]) =>
    recomendar(historicoDeCompra(lista, contactId, hoje)),
  );
  return ordenarRecomendacoes(recs.filter((r) => r !== null));
}
