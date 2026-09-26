import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
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

  // Base da seção de recuperação (contagem saía da antiga /app/recuperacao):
  // sem pedido anterior a 60 dias não há o que medir, e a seção mostra "sem
  // base" em vez da lista. O seletor de período nasce em 60 dias; a API valida
  // o resto.
  const supabase = await createClient();
  const agoraMs = new Date().getTime();
  const corte = new Date(agoraMs - 60 * 86400000).toISOString();
  const { count } = await supabase
    .from("commercial_orders")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", activeOrg.orgId)
    .neq("status", "cancelado")
    .lt("created_at", corte);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <NexusPageHeader
        title={t("Radar Comercial")}
        subtitle={t("Identifique riscos, oportunidades de recompra e clientes que precisam de atenção.")}
      />
      <RadarTabs temBase={(count ?? 0) > 0} />
    </div>
  );
}
