import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { contextoFiscal } from "@/lib/fiscal/pagina";
import { COLUNAS_DA_ENTRADA, type EntradaFiscal } from "@/lib/schemas/fiscal-entrada";
import { createClient } from "@/lib/supabase/server";

import { TabelaDeEntradas } from "../_components/TabelaDeEntradas";

export const dynamic = "force-dynamic";

/**
 * XML RECEBIDOS — as notas cujo XML completo já está no banco.
 *
 * A SEFAZ só libera o XML depois da manifestação; esta tela é a prova de que a
 * manifestação funcionou. Sem XML, a nota aparece em "Resumos de Notas" e o
 * caminho para destravar é manifestar.
 */
export default async function XmlRecebidosPage() {
  const { org } = await contextoFiscal();
  const supabase = await createClient();
  const { data } = await supabase
    .from("fiscal_entradas")
    .select(COLUNAS_DA_ENTRADA)
    .eq("organization_id", org.orgId)
    .not("xml", "is", null)
    .order("dh_emi", { ascending: false, nullsFirst: false })
    .limit(500);

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title="XML recebidos"
        subtitle="Notas com o XML completo disponível para download e importação."
      />
      <TabelaDeEntradas inicial={(data ?? []) as unknown as EntradaFiscal[]} modo="xml" />
    </div>
  );
}
