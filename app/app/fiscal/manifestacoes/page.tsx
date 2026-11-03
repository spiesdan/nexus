import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { contextoFiscal } from "@/lib/fiscal/pagina";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { ROTULO_DA_MANIFESTACAO, identificacaoDaEntrada } from "@/lib/schemas/fiscal-entrada";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Linha {
  id: string;
  entrada_id: string;
  evento: string;
  justificativa: string | null;
  protocolo: string | null;
  cstat: string | null;
  resultado: string;
  mensagem: string | null;
  created_at: string;
  fiscal_entradas:
    | {
        chave: string;
        numero: number | null;
        serie: string | null;
        emitente_nome: string;
      }
    | null;
}

/**
 * MANIFESTAÇÃO DO DESTINATÁRIO — o histórico de tudo que foi declarado.
 *
 * Uma linha por TENTATIVA, inclusive as recusadas pela SEFAZ. É o rastro que a
 * nota não mostra: `fiscal_entradas.manifestacao` guarda só o último estado.
 * Quem manifesta continua sendo o detalhe da nota, onde o XML e os itens estão
 * à vista.
 */
export default async function ManifestacoesPage() {
  const { org, user } = await contextoFiscal();
  const tagIdioma = tagDeIdioma(user.idioma);
  const supabase = await createClient();
  const { data } = await supabase
    .from("fiscal_manifestations")
    .select(
      "id, entrada_id, evento, justificativa, protocolo, cstat, resultado, mensagem, created_at, " +
        "fiscal_entradas(chave, numero, serie, emitente_nome)",
    )
    .eq("organization_id", org.orgId)
    .order("created_at", { ascending: false })
    .limit(300);

  const linhas = (data ?? []) as unknown as Linha[];

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title="Manifestação do destinatário"
        subtitle="Ciência, confirmação, desconhecimento e não realizada — com protocolo e retorno da SEFAZ."
      />

      {linhas.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">
          Nenhuma manifestação enviada ainda. Abra uma nota em Pendentes de Conferência e declare a
          ciência para liberar o XML completo.
        </p>
      ) : (
        <div className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Nota</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Retorno</TableHead>
                <TableHead>Quando</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    {m.fiscal_entradas ? (
                      <Link
                        href={`/app/fiscal/notas/${m.entrada_id}`}
                        className="text-accent underline-offset-4 hover:underline"
                      >
                        {identificacaoDaEntrada(
                          m.fiscal_entradas.numero,
                          m.fiscal_entradas.serie,
                        )}{" "}
                        · {m.fiscal_entradas.emitente_nome}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{ROTULO_DA_MANIFESTACAO[m.evento] ?? m.evento}</TableCell>
                  <TableCell>
                    <Badge variant={m.resultado === "sucesso" ? "success" : "error"}>
                      {m.resultado}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-80 text-xs text-muted-foreground">
                    {m.mensagem ?? "—"}
                    {m.cstat ? ` · cStat ${m.cstat}` : ""}
                    {m.protocolo ? ` · protocolo ${m.protocolo}` : ""}
                    {m.justificativa ? ` · justificativa: ${m.justificativa}` : ""}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(m.created_at).toLocaleString(tagIdioma)}
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
