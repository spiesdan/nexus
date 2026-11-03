import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { contextoFiscal } from "@/lib/fiscal/pagina";
import { COLUNAS_DA_ENTRADA, type EntradaFiscal } from "@/lib/schemas/fiscal-entrada";
import { createClient } from "@/lib/supabase/server";

import { TabelaDeEntradas } from "../_components/TabelaDeEntradas";

export const dynamic = "force-dynamic";

/**
 * RESUMOS DE NOTAS — o que a SEFAZ entregou sem o XML completo.
 *
 * `resumo` é o documento da distribuição DF-e que traz chave, emitente e valor,
 * mas não os itens. Ele serve para saber que a nota existe; para importar, é
 * preciso manifestar e sincronizar de novo. Esta tela é onde o operador
 * enxerga o que está nesse limbo.
 */
export default async function ResumosPage() {
  const { org } = await contextoFiscal();
  const supabase = await createClient();
  const { data } = await supabase
    .from("fiscal_entradas")
    .select(COLUNAS_DA_ENTRADA)
    .eq("organization_id", org.orgId)
    .or("tipo_documento.eq.resumo,xml.is.null")
    .order("dh_emi", { ascending: false, nullsFirst: false })
    .limit(500);

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title="Resumos de notas"
        subtitle="Notas conhecidas pela chave, mas ainda sem XML completo. Manifeste para liberar os itens."
      />
      <TabelaDeEntradas inicial={(data ?? []) as unknown as EntradaFiscal[]} modo="resumos" />
    </div>
  );
}
