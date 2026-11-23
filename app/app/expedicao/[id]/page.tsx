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
  // `?aba=rota` mentia: abria o mesmo workbench com o breadcrumb dizendo
  // "Rota". O deep link agora leva à visão de operação de verdade, que é onde
  // o mapa e a ordem vivem. Motorista/fechamento seguem como subtelas próprias.
  if (aba === "rota") redirect(`/app/expedicao/${id}/rota`);
  if (aba === "fechamento" || aba === "motorista") {
    redirect(`/app/expedicao/${id}/${aba}`);
  }

  const contexto = await contextoDaCarga(id);
  return <CargaClient cargaId={id} secao="paradas" {...contexto} />;
}
