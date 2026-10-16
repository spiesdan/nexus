import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { LaboratorioClient } from "./_components/LaboratorioClient";

export const dynamic = "force-dynamic";

/**
 * Laboratório — o agente se prova antes de falar com cliente de verdade.
 *
 * Seis personas simuladas conversam com o gerador real de abordagem em
 * sandbox (nada é enviado), um juiz dá nota 0-100 com achados, e o histórico
 * mostra o delta entre rodadas. A página é fina: inteligência na API.
 */
export default async function LaboratorioPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <NexusPageHeader
        title="Laboratório do agente"
        subtitle="Seis clientes simulados testam a campanha antes dela falar com gente de verdade. Cada rodada gasta IA de verdade e demora alguns minutos."
      />
      <LaboratorioClient />
    </main>
  );
}
