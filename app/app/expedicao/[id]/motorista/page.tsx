import { contextoDaCarga } from "../_contexto";
import { CargaClient } from "../_client";

export const dynamic = "force-dynamic";

/** O MOTORISTA — a cabine, imersiva, sem a navegação da ficha em volta. */
export default async function CargaMotoristaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contexto = await contextoDaCarga(id);
  return <CargaClient cargaId={id} secao="motorista" {...contexto} />;
}
