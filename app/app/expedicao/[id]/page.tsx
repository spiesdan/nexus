import { redirect } from "next/navigation";

import { contextoDaCarga } from "./_contexto";
import { CargaClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * A CARGA — a raiz da ficha mostra as PARADAS.
 *
 * Rota, fechamento e motorista são subtelas com endereço próprio. Os deep
 * links antigos (`?aba=rota`, `?aba=fechamento`, `?aba=motorista`) continuam
 * valendo e são redirecionados aqui, no servidor, antes de a tela piscar.
 */
export default async function CargaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba } = await searchParams;
  if (aba === "rota" || aba === "fechamento" || aba === "motorista") {
    redirect(`/app/expedicao/${id}/${aba}`);
  }

  const contexto = await contextoDaCarga(id);
  return <CargaClient cargaId={id} secao="paradas" {...contexto} />;
}
