import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

import { EstoqueClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * ESTOQUE — saldo, movimentações e sugestão de compra (NEXUS §46/§47).
 *
 * Escrita agent+ (mesmo piso das APIs de movements); leitura viewer+. O que
 * existe hoje: saldo cacheado em `catalog_products.quantidade`, razão em
 * `inventory_movements` (entrada/saída/ajuste) e sugestão por cobertura.
 * Reservas, inventário e estoque mínimo por produto pedem schema novo —
 * não estão aqui de propósito, não de omissão.
 */
export default async function EstoquePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const podeEscrever =
    user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  return <EstoqueClient podeEscrever={podeEscrever} />;
}
