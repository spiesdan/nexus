import Link from "next/link";

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
import { identificacaoDaEntrada } from "@/lib/schemas/fiscal-entrada";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Item {
  id: string;
  entrada_id: string;
  numero_item: number;
  codigo: string;
  descricao: string;
  ncm: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number;
  valor_unitario_cents: number;
  valor_total_cents: number;
  icms_cents: number;
  ipi_cents: number;
  fiscal_entradas:
    | {
        chave: string;
        numero: number | null;
        serie: string | null;
        emitente_nome: string;
        dh_emi: string | null;
      }
    | null;
}

/**
 * PRODUTOS DAS NOTAS — o que veio, item a item, na ordem em que chegou.
 *
 * É a lista operacional, não o agregado. "Produtos mais comprados" é relatório
 * (com período) e vive em `/app/fiscal/relatorios`; somar tudo sem recorte é o
 * número que ninguém consegue conferir.
 */
export default async function ProdutosDasNotasPage() {
  const { org } = await contextoFiscal();
  const supabase = await createClient();
  const { data } = await supabase
    .from("fiscal_document_items")
    .select(
      "id, entrada_id, numero_item, codigo, descricao, ncm, cfop, unidade, quantidade, " +
        "valor_unitario_cents, valor_total_cents, icms_cents, ipi_cents, " +
        "fiscal_entradas!inner(chave, numero, serie, emitente_nome, dh_emi)",
    )
    .eq("organization_id", org.orgId)
    .order("created_at", { ascending: false })
    .limit(300);

  const itens = (data ?? []) as unknown as Item[];

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title="Produtos das notas"
        subtitle="Os itens recebidos, com NCM, CFOP, quantidade e impostos — um por linha."
        actions={
          <Link
            href="/app/fiscal/relatorios?tipo=produtos"
            className="text-sm text-accent underline-offset-4 hover:underline"
          >
            Produtos mais comprados →
          </Link>
        }
      />

      {itens.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">
          Nenhum item normalizado ainda. Eles aparecem depois que o XML completo é baixado e a
          sincronização grava os itens.
        </p>
      ) : (
        <div className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Produto</TableHead>
                <TableHead>NCM / CFOP</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Unitário</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">ICMS / IPI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <span className="block max-w-72 truncate font-medium" title={item.descricao}>
                      {item.descricao}
                    </span>
                    <span className="block text-xs text-muted-foreground">{item.codigo}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.ncm ?? "—"} / {item.cfop ?? "—"}
                  </TableCell>
                  <TableCell>
                    {item.fiscal_entradas ? (
                      <Link
                        href={`/app/fiscal/notas/${item.entrada_id}`}
                        className="text-accent underline-offset-4 hover:underline"
                      >
                        {identificacaoDaEntrada(
                          item.fiscal_entradas.numero,
                          item.fiscal_entradas.serie,
                        )}
                      </Link>
                    ) : (
                      "—"
                    )}
                    <span className="block max-w-56 truncate text-xs text-muted-foreground">
                      {item.fiscal_entradas?.emitente_nome ?? ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.quantidade} {item.unidade ?? ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {comoMoeda(item.valor_unitario_cents, "BRL")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {comoMoeda(item.valor_total_cents, "BRL")}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                    {comoMoeda(item.icms_cents, "BRL")} / {comoMoeda(item.ipi_cents, "BRL")}
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
