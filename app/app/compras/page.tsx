import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

import { ComprasClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * COMPRAS — pedidos de compra + fornecedores (NEXUS §47).
 *
 * Escrita agent+ (mesmo piso das APIs); leitura viewer+. A porta é o ⌘K e os
 * links da Estoque/sugestão — sem sidebar, seguindo a doutrina da dobra.
 */
export default async function ComprasPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const podeEscrever =
    user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  return <ComprasClient podeEscrever={podeEscrever} />;
}
