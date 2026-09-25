import { notFound, redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

import { CompraDetalheClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * DETALHE DA COMPRA — itens, transições de status e recebimento no estoque.
 * Escrita agent+ (o mesmo piso das APIs); leitura viewer+.
 */
export default async function CompraDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeEscrever =
    user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;

  const { id } = await params;
  const supabase = await createClient();
  const { data: pedido } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("organization_id", activeOrg.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!pedido) notFound();

  return <CompraDetalheClient id={id} podeEscrever={podeEscrever} />;
}
