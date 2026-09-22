import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { CrmPageHeader } from "@/components/uimaxxing/crm/crm-page-header";
import { RadarTabs } from "./_tabs";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  // `t` local em vez do hook: esta página é componente de SERVIDOR, e lá o
  // idioma vem resolvido em `user.idioma` (a cadeia pessoa → organização →
  // padrão vive em `lib/auth/server.ts`), sem reler o `locale` cru.
  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <CrmPageHeader
        eyebrow={t("Sales Intelligence")}
        title={t("Radar Comercial")}
        description={t("Identifique riscos, oportunidades de recompra e clientes que precisam de atenção.")}
      />
      <RadarTabs />
    </div>
  );
}
