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
import { createClient } from "@/lib/supabase/server";

import { BotaoSincronizar } from "../_components/BotaoSincronizar";

export const dynamic = "force-dynamic";

interface Log {
  id: string;
  origem: string;
  iniciado_em: string;
  finalizado_em: string | null;
  nsu_inicial: number | null;
  nsu_final: number | null;
  max_nsu: number | null;
  docs_encontrados: number;
  docs_importados: number;
  docs_erro: number;
  resultado: string;
  cstat: string | null;
  mensagem: string | null;
  request_id: string | null;
}

const VARIANTE: Record<string, "success" | "error" | "warning" | "neutral" | "info"> = {
  sucesso: "success",
  erro: "error",
  bloqueado: "warning",
  vazio: "neutral",
  em_andamento: "info",
};

/**
 * HISTÓRICO DE SINCRONIZAÇÃO — a prova visível de que nada andou sem persistir.
 *
 * Uma linha por execução, inclusive as que falharam. `nsu_inicial`/`nsu_final`
 * e `docs_importados`/`docs_erro` dizem até onde foi e onde parou; quando a
 * SEFAZ bloqueia (656), `resultado = bloqueado` e a mensagem traz a hora da
 * próxima tentativa. Sem esta tela, o cursor seria uma caixa-preta.
 */
export default async function SincronizacoesPage() {
  const { org, podeOperar, user } = await contextoFiscal();
  const tagIdioma = tagDeIdioma(user.idioma);
  const supabase = await createClient();
  const { data } = await supabase
    .from("fiscal_sync_logs")
    .select(
      "id, origem, iniciado_em, finalizado_em, nsu_inicial, nsu_final, max_nsu, " +
        "docs_encontrados, docs_importados, docs_erro, resultado, cstat, mensagem, request_id",
    )
    .eq("organization_id", org.orgId)
    .order("iniciado_em", { ascending: false })
    .limit(300);

  const logs = (data ?? []) as unknown as Log[];

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title="Histórico de sincronização"
        subtitle="Cada consulta à SEFAZ, inclusive as que falharam — com o NSU de onde saiu e onde parou."
        actions={podeOperar ? <BotaoSincronizar /> : undefined}
      />

      {logs.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">
          Nenhuma sincronização executada ainda. O botão acima faz a primeira; depois disso, o cron
          passa a registrar cada execução aqui.
        </p>
      ) : (
        <div className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Quando</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead className="hidden lg:table-cell">NSU</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Docs</TableHead>
                <TableHead className="hidden lg:table-cell">Mensagem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(log.iniciado_em).toLocaleString(tagIdioma)}
                  </TableCell>
                  <TableCell>{log.origem === "cron" ? "Automática" : "Manual"}</TableCell>
                  <TableCell>
                    <Badge variant={VARIANTE[log.resultado] ?? "neutral"}>{log.resultado}</Badge>
                    {log.cstat && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        cStat {log.cstat}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-xs tabular-nums text-muted-foreground lg:table-cell">
                    <span className="block">
                      {log.nsu_inicial ?? 0} → {log.nsu_final ?? 0}
                    </span>
                    <span className="block">máx. {log.max_nsu ?? 0}</span>
                  </TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums lg:table-cell">
                    <span className="block">{log.docs_importados} importado(s)</span>
                    <span className="block text-muted-foreground">
                      {log.docs_encontrados} encontrado(s) · {log.docs_erro} erro(s)
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-80 text-xs text-muted-foreground lg:table-cell">
                    {log.mensagem ?? "—"}
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
