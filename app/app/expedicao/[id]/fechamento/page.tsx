import { contextoDaCarga } from "../_contexto";
import { CargaClient } from "../_client";

export const dynamic = "force-dynamic";

/** O FECHAMENTO — conferência do caixa numa folha própria. */
export default async function CargaFechamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contexto = await contextoDaCarga(id);
  return <CargaClient cargaId={id} secao="fechamento" {...contexto} />;
}
