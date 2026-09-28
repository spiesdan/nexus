import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { DecisoesList } from "./_components/DecisoesList";

export const dynamic = "force-dynamic";

/**
 * Decisões — o Decision Log com Aprovar/Recusar (NEXUS §37–§38, FASE 10).
 *
 * Propostas do Orchestrator (`ai.action.proposed`) com a trilha de
 * governança; decidir grava `ai.action.approved/rejected` linkada.
 * Manager+ (mesmo posto da leitura de auditoria).
 */
export default async function DecisoesPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }
  const idioma = user.idioma;
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-medium tracking-tight text-text">{traduzir("Decisões da IA", idioma)}</h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "Ações que o vendedor autônomo propôs, com motivo, dados e impacto. Aprovar não executa sozinho — execução vive atrás de política explícita.",
            idioma,
          )}
        </p>
      </header>
      <DecisoesList />
    </div>
  );
}
