import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { CrmPageHeader } from "@/components/uimaxxing/crm/crm-page-header";
import { InteligenciaClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function InteligenciaPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const t = (texto: string) => traduzir(texto, user.idioma);
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <CrmPageHeader
        eyebrow={t("Sales Intelligence")}
        title={t("Inteligência")}
        description={t("Pergunte, analise e aja sobre as vendas com ajuda da IA.")}
      />
      <InteligenciaClient />
    </div>
  );
}
