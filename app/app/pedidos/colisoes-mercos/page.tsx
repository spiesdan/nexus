import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";

import { ColisoesMercosClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * Pedidos do Mercos que não entraram por colisão de número.
 *
 * A porta é o botão ao lado de "Importar pedidos Mercos", em Pedidos — a
 * importação já vive lá, e criar outro item de menu seria inventar caminho.
 */
export default async function ColisoesMercosPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  // Mesma régua da importação: quem não pode importar não resolve colisão.
  const podeImportar =
    user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  if (!podeImportar) redirect("/app/pedidos");

  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <ColisoesMercosClient
      textos={{
        voltar: t("Voltar aos pedidos"),
        importar: t("Importar como novo pedido"),
        abrir: t("Abrir pedido"),
        tentar: t("Tentar novamente"),
      }}
    />
  );
}
