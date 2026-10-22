import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

import { ControleDaCampanha } from "./_controle";

export const dynamic = "force-dynamic";

/**
 * A TELA DE CONTROLE DA CAMPANHA — rota própria para sobreviver ao F5.
 *
 * O card da aba Campanhas mostrava um público efêmero e não tinha para onde
 * levar o operador depois do envio. Aqui ficam as três perguntas do dono:
 * para quem já foi, quem falta e quais empresas da região ainda podem entrar.
 */
export default async function CampanhaControlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const { id } = await params;
  return <ControleDaCampanha id={id} />;
}
