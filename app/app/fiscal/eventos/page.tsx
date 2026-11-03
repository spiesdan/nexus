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
import { identificacaoDaEntrada } from "@/lib/schemas/fiscal-entrada";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Evento {
  id: string;
  entrada_id: string | null;
  chave: string;
  nsu: number;
  tipo: string;
  tp_evento: string;
  descricao: string | null;
  protocolo: string | null;
  dh_evento: string | null;
  created_at: string;
  fiscal_entradas:
    | {
        numero: number | null;
        serie: string | null;
        emitente_nome: string;
      }
    | null;
}

const ROTULO_TIPO: Record<string, string> = {
  cancelamento: "Cancelamento",
  carta_correcao: "Carta de correção",
  manifestacao: "Manifestação",
  outro: "Outro",
};

/**
 * CANCELAMENTOS E EVENTOS — o que mudou depois que a nota chegou.
 *
 * Lê `fiscal_document_events`, alimentada pela sincronização. Antes o filtro de
 * documento descartava `procEv`/`resEve` e o cancelamento nunca chegava; esta
 * tela é a prova de que passou a chegar.
 */
export default async function EventosPage() {
  const { org, user } = await contextoFiscal();
  const tagIdioma = tagDeIdioma(user.idioma);
  const supabase = await createClient();
  const { data } = await supabase
    .from("fiscal_document_events")
    .select(
      "id, entrada_id, chave, nsu, tipo, tp_evento, descricao, protocolo, dh_evento, created_at, " +
        "fiscal_entradas(numero, serie, emitente_nome)",
    )
    .eq("organization_id", org.orgId)
    .order("dh_evento", { ascending: false, nullsFirst: false })
    .limit(300);

  const eventos = (data ?? []) as unknown as Evento[];

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title="Cancelamentos e eventos"
        subtitle="Cancelamentos, cartas de correção e manifestações recebidas pela distribuição DF-e."
      />

      {eventos.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">
          Nenhum evento recebido. Cancelamentos e cartas de correção aparecem aqui conforme a
          sincronização os encontra.
        </p>
      ) : (
        <div className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Tipo</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Protocolo / NSU</TableHead>
                <TableHead>Quando</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventos.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell>
                    <Badge
                      variant={
                        ev.tipo === "cancelamento"
                          ? "error"
                          : ev.tipo === "carta_correcao"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {ROTULO_TIPO[ev.tipo] ?? ev.tipo}
                    </Badge>
                    <span className="mt-1 block text-xs text-muted-foreground">{ev.tp_evento}</span>
                  </TableCell>
                  <TableCell>
                    {ev.entrada_id ? (
                      <Link
                        href={`/app/fiscal/notas/${ev.entrada_id}`}
                        className="text-accent underline-offset-4 hover:underline"
                      >
                        {ev.fiscal_entradas
                          ? identificacaoDaEntrada(
                              ev.fiscal_entradas.numero,
                              ev.fiscal_entradas.serie,
                            )
                          : ev.chave.slice(-8)}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {ev.chave.slice(-8)} (nota ainda não baixada)
                      </span>
                    )}
                    <span className="block max-w-56 truncate text-xs text-muted-foreground">
                      {ev.fiscal_entradas?.emitente_nome ?? ""}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-80 text-sm text-muted-foreground">
                    {ev.descricao ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="block">{ev.protocolo ?? "—"}</span>
                    <span className="block">NSU {ev.nsu}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(ev.dh_evento ?? ev.created_at).toLocaleString(tagIdioma)}
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
