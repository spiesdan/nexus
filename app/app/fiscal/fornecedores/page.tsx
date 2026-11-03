import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { comoMoeda } from "@/lib/format/moeda";
import { contextoFiscal } from "@/lib/fiscal/pagina";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Fornecedor {
  id: string;
  nome: string;
  cnpj: string | null;
  ie: string | null;
  email: string | null;
  telefone: string | null;
  total_notas: number;
  total_comprado_cents: number;
  ultima_nota_em: string | null;
}

/**
 * FORNECEDORES — os emitentes das notas, como cadastro.
 *
 * Não é tabela nova: é `suppliers`, o mesmo fornecedor do pedido de compra. A
 * sincronização preenche IE e os agregados quando a nota chega. Ordenado pelo
 * valor comprado, que é a pergunta que esta tela responde ("de quem eu mais
 * compro?").
 */
export default async function FornecedoresPage() {
  const { org, user } = await contextoFiscal();
  const tagIdioma = tagDeIdioma(user.idioma);
  const supabase = await createClient();
  const { data } = await supabase
    .from("suppliers")
    .select(
      "id, nome, cnpj, ie, email, telefone, total_notas, total_comprado_cents, ultima_nota_em",
    )
    .eq("organization_id", org.orgId)
    .gt("total_notas", 0)
    .order("total_comprado_cents", { ascending: false })
    .limit(300);

  const linhas = (data ?? []) as unknown as Fornecedor[];

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title="Fornecedores das notas"
        subtitle="Quem emitiu as NF-e contra o CNPJ, com IE, volume comprado e a última nota."
      />

      {linhas.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">
          Nenhum fornecedor com nota ainda. Eles aparecem aqui quando a primeira NF-e for
          sincronizada e o CNPJ do emitente for vinculado ao cadastro.
        </p>
      ) : (
        <div className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Fornecedor</TableHead>
                <TableHead>CNPJ / IE</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="text-right">Notas</TableHead>
                <TableHead className="text-right">Total comprado</TableHead>
                <TableHead>Última nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.nome}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="block">{f.cnpj ?? "—"}</span>
                    <span className="block">IE {f.ie ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="block">{f.email ?? "—"}</span>
                    <span className="block">{f.telefone ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{f.total_notas}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {comoMoeda(f.total_comprado_cents, "BRL")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {f.ultima_nota_em
                      ? new Date(f.ultima_nota_em).toLocaleDateString(tagIdioma)
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
