/**
 * PERSISTÊNCIA DO DESTINO — o snapshot nasce quando o pedido entra na carga.
 *
 * Chamado pelos dois caminhos que criam `shipment_orders` (carga nova e
 * "adicionar pedidos" a uma carga existente). O mesmo pedido pode ser embarcado
 * em cargas diferentes ao longo do tempo; o destino é reaproveitado pela chave
 * (`organization_id`, `chave`) e NUNCA é sobrescrito — `on conflict do nothing`
 * é a garantia de que o histórico não anda para trás quando o cadastro muda.
 *
 * Se o endereço mudar, a chave muda, nasce outro destino, e a parada antiga
 * continua apontando para o destino antigo — que é o que o prompt §2 pede.
 */
import { type SnapshotDoDestino, snapshotDoDestino, type ContatoParaDestino } from "./destinos";

type ClienteMinimo = {
  from: (tabela: string) => {
    select: (colunas: string) => {
      eq: (coluna: string, valor: unknown) => {
        in: (coluna: string, valores: unknown[]) => PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
    upsert: (
      linhas: unknown,
      opcoes?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};

interface PedidoParaDestino {
  id: string;
  numero: number;
  cliente_nome: string;
  contact_id: string | null;
  endereco_entrega: string | null;
}

/**
 * Garante um destino para cada pedido e devolve `order_id → destination_id`.
 *
 * Falha de escrita é devolvida como erro (nunca engolida): quem chama decide
 * se aborta a carga — e aborta, porque carga sem destino é mapa mentiroso.
 */
export async function garantirDestinosDosPedidos(
  supabase: unknown,
  orgId: string,
  orderIds: string[],
): Promise<{ destinos: Map<string, string>; erro: string | null }> {
  const sb = supabase as ClienteMinimo;
  const destinos = new Map<string, string>();
  if (orderIds.length === 0) return { destinos, erro: null };

  const { data: pedidos, error: erroPedidos } = await sb
    .from("commercial_orders")
    .select("id, numero, cliente_nome, contact_id, endereco_entrega")
    .eq("organization_id", orgId)
    .in("id", orderIds);
  if (erroPedidos || !pedidos) {
    return { destinos, erro: "Não foi possível ler os pedidos para montar o destino." };
  }
  const lista = pedidos as unknown as PedidoParaDestino[];

  const idsContatos = [...new Set(lista.map((p) => p.contact_id).filter(Boolean))] as string[];
  const porContato = new Map<string, ContatoParaDestino>();
  if (idsContatos.length > 0) {
    const { data: contatos } = await sb
      .from("contacts")
      .select(
        "id, logradouro, numero_end, complemento, bairro, cidade, uf, cep, latitude, longitude, geo_fonte",
      )
      .eq("organization_id", orgId)
      .in("id", idsContatos);
    for (const c of (contatos ?? []) as unknown as ContatoParaDestino[]) porContato.set(c.id, c);
  }

  const snapshots = new Map<string, SnapshotDoDestino>();
  for (const p of lista) {
    snapshots.set(
      p.id,
      snapshotDoDestino(p.contact_id ? (porContato.get(p.contact_id) ?? null) : null, p.cliente_nome, p.endereco_entrega),
    );
  }

  // Uma linha por CHAVE, não por pedido: dois pedidos ao mesmo endereço são o
  // mesmo destino (uma parada só) — mesma regra de `agruparParadas`.
  const porChave = new Map<string, SnapshotDoDestino>();
  for (const s of snapshots.values()) if (!porChave.has(s.chave)) porChave.set(s.chave, s);

  const { error: erroUpsert } = await sb.from("shipment_destinations").upsert(
    [...porChave.values()].map((s) => ({
      organization_id: orgId,
      contact_id: s.contact_id,
      chave: s.chave,
      endereco: s.endereco,
      numero: s.numero,
      complemento: s.complemento,
      bairro: s.bairro,
      cidade: s.cidade,
      uf: s.uf,
      cep: s.cep,
      latitude: s.latitude,
      longitude: s.longitude,
      geo_status: s.geo_status,
      geo_fonte: s.geo_fonte,
      geo_em: s.latitude != null ? new Date().toISOString() : null,
    })),
    { onConflict: "organization_id,chave", ignoreDuplicates: true },
  );
  if (erroUpsert) return { destinos, erro: "Não foi possível gravar os destinos da carga." };

  // Reler: `ignoreDuplicates` não devolve a linha que já existia.
  const { data: gravados, error: erroLeitura } = await sb
    .from("shipment_destinations")
    .select("id, chave")
    .eq("organization_id", orgId)
    .in("chave", [...porChave.keys()]);
  if (erroLeitura || !gravados) return { destinos, erro: "Não foi possível reler os destinos da carga." };

  const idPorChave = new Map(
    (gravados as unknown as { id: string; chave: string }[]).map((d) => [d.chave, d.id]),
  );
  for (const [orderId, s] of snapshots) {
    const id = idPorChave.get(s.chave);
    if (id) destinos.set(orderId, id);
  }
  return { destinos, erro: null };
}
