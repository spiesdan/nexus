import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { PaginaDeConfiguracao } from "@/components/nexus-ui/layout/PaginaDeConfiguracao";
import { createClient } from "@/lib/supabase/server";

import { FormasDePagamentoClient, type MetodoRow } from "./_client";

export const dynamic = "force-dynamic";

/**
 * FORMAS DE PAGAMENTO — configuração do negócio, não da conta de quem logou.
 *
 * A lista antiga misturava meio de pagamento com prazo: `a_vista`,
 * `agendado_30` e `agendado_45` são VENCIMENTOS, não formas. Aqui as duas
 * coisas aparecem em seções distintas, e o `tPag` vem da tabela oficial da
 * NF-e (NT 2020.006). Campo sem código confirmado fica em branco e é mostrado
 * como pendência — nunca chute.
 */
export default async function FormasDePagamentoPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeEditar = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  const supabase = await createClient();
  const { data } = await supabase
    .from("commercial_payment_methods")
    .select("id, tipo, codigo, nome, tpag, dias_prazo, ativo")
    .eq("organization_id", activeOrg.orgId)
    .order("tipo")
    .order("nome");

  return (
    <PaginaDeConfiguracao
      titulo="Formas de pagamento"
      descricao="O meio de pagamento (com o código da NF-e) e o prazo de vencimento são coisas diferentes. Configure os dois por aqui."
    >
      <FormasDePagamentoClient
        metodosIniciais={(data ?? []) as MetodoRow[]}
        podeEditar={podeEditar}
      />
    </PaginaDeConfiguracao>
  );
}
