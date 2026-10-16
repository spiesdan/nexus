import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { ControleList } from "./_components/ControleList";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";

export const dynamic = "force-dynamic";

/**
 * Controle de IA (NEXUS §56) — o painel do gestor sobre a operação da IA.
 *
 * Decisões, oportunidades, follow-ups e orçamento, cada cartão com fonte
 * real própria. Manager+ (mesmo posto das fontes).
 */
export default async function ControlePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }
  const idioma = user.idioma;
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <NexusPageHeader
        title={traduzir("Controle de IA", idioma)}
        subtitle={traduzir("O que a IA propôs, decidiu, acompanha e consumiu — tudo com fonte.", idioma)}
      />
      <ControleList />
    </div>
  );
}
