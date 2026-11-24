import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { PaginaDeConfiguracao } from "@/components/nexus-ui/layout/PaginaDeConfiguracao";

import { ROLE_RANK } from "@/lib/auth/types";
import { emailDeSuporte } from "@/lib/branding/saida";
import { traduzir } from "@/lib/i18n/dicionario";

import { BillingClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * A tela de dinheiro entregava o nosso contato ao cliente do revendedor, e ela
 * tem porta de 1ª classe no menu. Mesmo tratamento da tela de conta suspensa:
 * o endereço é o de quem opera a instalação (`SUPPORT_EMAIL`) e, sem ele
 * configurado, nenhum endereço aparece.
 */
export default async function BillingPage() {
  // spec 13 §4: billing é admin-only (viewer/agent/manager = none).
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const suporte = emailDeSuporte();
  const idioma = user.idioma;
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("status")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  const suspensa = (org as { status?: string } | null)?.status === "suspended";
  return (
    <PaginaDeConfiguracao
      titulo="Billing"
      descricao={traduzir("Planos, faturas e cobrança.", idioma)}
    >
      <BillingClient suporte={suporte} suspensa={suspensa} />
    </PaginaDeConfiguracao>
  );
}
