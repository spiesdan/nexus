import { contextoDaCarga } from "../_contexto";
import { CargaClient } from "../_client";

export const dynamic = "force-dynamic";

/** A ROTA — mapa, ordem de entrega e planejamento, sem a ficha em volta. */
export default async function CargaRotaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contexto = await contextoDaCarga(id);
  return <CargaClient cargaId={id} secao="rota" {...contexto} />;
}
