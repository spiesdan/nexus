import Link from "next/link";

import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { contextoFiscal } from "@/lib/fiscal/pagina";
import { COLUNAS_DA_ENTRADA, type EntradaFiscal } from "@/lib/schemas/fiscal-entrada";
import { createClient } from "@/lib/supabase/server";

import { TabelaDeEntradas } from "../_components/TabelaDeEntradas";

export const dynamic = "force-dynamic";

/**
 * PENDENTES DE CONFERÊNCIA — a fila de trabalho de quem recebe mercadoria.
 *
 * Só aparece aqui o que ainda não foi aprovado: é a lista que precisa zerar.
 * Aprovar/rejeitar mora no detalhe da nota, onde os itens e os totais estão à
 * vista — decidir sem ver o que chegou seria carimbo, não conferência.
 */
export default async function PendentesPage() {
  const { org, podeGerir } = await contextoFiscal();
  const supabase = await createClient();
  const { data } = await supabase
    .from("fiscal_entradas")
    .select(COLUNAS_DA_ENTRADA)
    .eq("organization_id", org.orgId)
    .neq("conferencia_status", "aprovada")
    .neq("status", "ignorada")
    .order("dh_emi", { ascending: false, nullsFirst: false })
    .limit(500);

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title="Pendentes de conferência"
        subtitle="Notas que chegaram e ainda não foram aprovadas. Estoque e contas a pagar só se movem depois do aceite."
        actions={
          podeGerir ? (
            <Link
              href="/app/fiscal/relatorios?tipo=pendentes"
              className="text-sm text-accent underline-offset-4 hover:underline"
            >
              Ver relatório de pendências
            </Link>
          ) : undefined
        }
      />
      <TabelaDeEntradas inicial={(data ?? []) as unknown as EntradaFiscal[]} modo="pendentes" />
    </div>
  );
}
