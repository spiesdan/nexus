import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

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
      <div>
        <h1 className="text-xl font-bold">Laboratório do agente</h1>
        <p className="text-sm text-muted-foreground">
          Seis clientes simulados testam a campanha antes dela falar com gente de verdade. Cada
          rodada gasta IA de verdade e demora alguns minutos.
        </p>
      </div>
      <LaboratorioClient />
    </main>
  );
}
