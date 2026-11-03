import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { contextoFiscal } from "@/lib/fiscal/pagina";
import { COLUNAS_DA_ENTRADA, type EntradaFiscal } from "@/lib/schemas/fiscal-entrada";
import { createClient } from "@/lib/supabase/server";

import { BotaoSincronizar } from "../_components/BotaoSincronizar";
import { TabelaDeEntradas } from "../_components/TabelaDeEntradas";

export const dynamic = "force-dynamic";

/**
 * TODAS AS NOTAS — o inventário completo do que a SEFAZ entregou.
 *
 * A lista é a mesma das outras três subtelas (um componente só, recorte por
 * `modo`); aqui não há recorte: é a tela para achar uma nota específica por
 * emitente, CNPJ, chave ou número.
 */
export default async function NotasDeEntradaPage() {
  const { org, podeOperar } = await contextoFiscal();
  const supabase = await createClient();
  const { data } = await supabase
    .from("fiscal_entradas")
    .select(COLUNAS_DA_ENTRADA)
    .eq("organization_id", org.orgId)
    .order("dh_emi", { ascending: false, nullsFirst: false })
    .limit(500);

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title="Todas as notas"
        subtitle="NF-e emitidas contra o CNPJ da empresa, com situação na SEFAZ e o estágio da conferência."
        actions={podeOperar ? <BotaoSincronizar /> : undefined}
      />
      <TabelaDeEntradas inicial={(data ?? []) as unknown as EntradaFiscal[]} modo="todas" />
    </div>
  );
}
