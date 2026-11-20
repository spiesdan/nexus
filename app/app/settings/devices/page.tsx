import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";import { PaginaDeConfiguracao } from "@/components/nexus-ui/layout/PaginaDeConfiguracao";

import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { DevicesClient, type AparelhoOffline } from "./_components/DevicesClient";

export const dynamic = "force-dynamic";

/**
 * DISPOSITIVOS OFFLINE — pareamento do app de vendas.
 *
 * Admin-only, como `api_tokens`: emitir um bearer que cria pedido em nome de
 * alguém é ato de administração. A lista lê pela sessão do usuário (RLS
 * admin-only), então a tela não pode mostrar aparelho de outro tenant nem por
 * bug de query.
 */
export default async function DevicesPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("offline_devices")
    .select(
      "id, user_id, nome, token_prefix, scopes, last_seen_at, expires_at, revoked_at, created_at",
    )
    .eq("organization_id", activeOrg.orgId)
    .order("created_at", { ascending: false });

  return (
    <PaginaDeConfiguracao
      titulo="Dispositivos offline"
      descricao={
        <>
          Aparelhos que enviam pedidos capturados sem internet. O código de pareamento aparece{" "}
          <strong>uma única vez</strong>; a fila do celular nunca é apagada ao desconectar.
        </>
      }
    >
      <DevicesClient inicial={(data ?? []) as unknown as AparelhoOffline[]} />
    </PaginaDeConfiguracao>
  );
}
