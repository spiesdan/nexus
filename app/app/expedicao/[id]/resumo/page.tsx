import { contextoDaCarga } from "../_contexto";
import { CargaClient } from "../_client";

export const dynamic = "force-dynamic";

/** Resumo — primeira da navegação, sem ser a raiz (que continua Paradas). */
export default async function ResumoCargaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CargaClient cargaId={id} secao="resumo" {...(await contextoDaCarga(id))} />;
}
