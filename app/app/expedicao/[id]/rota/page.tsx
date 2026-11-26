import { contextoDaCarga } from "../_contexto";
import { CargaClient } from "../_client";

export const dynamic = "force-dynamic";

/**
 * A ROTA — mapa, ordem de entrega e planejamento, sem a ficha em volta.
 *
 * `?geocodificar=1` é o "Resolver" da linha de exceção do despacho (P0-2): a
 * página abre já com o lote de geocodificação disparado uma vez. O componente
 * guarda o disparo em ref — re-render não repete o lote.
 */
export default async function CargaRotaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ geocodificar?: string }>;
}) {
  const { id } = await params;
  const { geocodificar } = await searchParams;
  const contexto = await contextoDaCarga(id);
  return (
    <CargaClient
      cargaId={id}
      secao="rota"
      geocodificarAoAbrir={geocodificar === "1"}
      {...contexto}
    />
  );
}
