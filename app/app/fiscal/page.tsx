import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { NexusKpi, NexusKpiGrid } from "@/components/nexus-ui/kpi/nexus-kpi";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { comoMoeda } from "@/lib/format/moeda";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { contextoFiscal } from "@/lib/fiscal/pagina";
import { resumoDoPeriodo, type LinhaDeEntrada } from "@/lib/fiscal/relatorios";
import { COLUNAS_DA_ENTRADA } from "@/lib/schemas/fiscal-entrada";
import { createClient } from "@/lib/supabase/server";

import { BotaoSincronizar } from "./_components/BotaoSincronizar";
import { TabelaDeEntradas } from "./_components/TabelaDeEntradas";

export const dynamic = "force-dynamic";

function inicioDoMes(agora = new Date()): string {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString();
}

/**
 * O relógio fora do corpo do componente.
 *
 * `Date.now()` no render é impuro e o lint (react-hooks/purity) reprova — com
 * razão: o valor mudaria entre duas renderizações do mesmo estado. Aqui o
 * instante é lido uma vez, numa função comum, e usado como dado.
 */
function agoraMs(): number {
  return Date.now();
}

/**
 * VISÃO GERAL — o estado do recebimento fiscal em uma tela.
 *
 * Responde, sem clique: quanto entrou no mês, quanto disso é imposto, quantas
 * notas esperam conferência, e se a sincronização está andando (ou travada por
 * 656). É a porta do módulo — não uma landing page: os números vêm do banco e
 * o botão de sincronizar fica aqui.
 */
export default async function FiscalVisaoGeralPage() {
  const { org, podeOperar, user } = await contextoFiscal();
  const tagIdioma = tagDeIdioma(user.idioma);
  const supabase = await createClient();
  const desde = inicioDoMes();

  const [
    { data: doMes },
    { data: ultimas },
    { count: pendentes },
    { data: config },
    { data: cursor },
    { data: certificado },
    { data: ultimosLogs },
  ] = await Promise.all([
    supabase
      .from("fiscal_entradas")
      .select(COLUNAS_DA_ENTRADA)
      .eq("organization_id", org.orgId)
      .gte("dh_emi", desde)
      .limit(2000),
    supabase
      .from("fiscal_entradas")
      .select(COLUNAS_DA_ENTRADA)
      .eq("organization_id", org.orgId)
      .order("dh_emi", { ascending: false, nullsFirst: false })
      .limit(8),
    supabase
      .from("fiscal_entradas")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.orgId)
      .neq("conferencia_status", "aprovada")
      .neq("status", "ignorada"),
    supabase
      .from("fiscal_settings")
      .select(
        "entrada_ativa, frequencia_minutos, ambiente, ultima_sincronizacao, ultimo_cstat, ultimo_motivo",
      )
      .eq("organization_id", org.orgId)
      .maybeSingle(),
    supabase
      .from("fiscal_entrada_cursor")
      .select("ult_nsu, max_nsu, proxima_tentativa, ultimo_erro, atualizado_em")
      .eq("organization_id", org.orgId)
      .maybeSingle(),
    supabase
      .from("fiscal_certificates")
      .select("titular, validade")
      .eq("organization_id", org.orgId)
      .is("revogado_em", null)
      .maybeSingle(),
    supabase
      .from("fiscal_sync_logs")
      .select("id, origem, resultado, docs_importados, docs_erro, mensagem, iniciado_em")
      .eq("organization_id", org.orgId)
      .order("iniciado_em", { ascending: false })
      .limit(3),
  ]);

  const resumo = resumoDoPeriodo((doMes ?? []) as unknown as LinhaDeEntrada[]);
  const cfg = config as unknown as {
    entrada_ativa: boolean;
    frequencia_minutos: number;
    ambiente: string;
    ultima_sincronizacao: string | null;
    ultimo_cstat: string | null;
    ultimo_motivo: string | null;
  } | null;
  const cur = cursor as unknown as {
    ult_nsu: number;
    max_nsu: number;
    proxima_tentativa: string | null;
    ultimo_erro: string | null;
    atualizado_em: string;
  } | null;
  const cert = certificado as unknown as { titular: string | null; validade: string | null } | null;

  const agora = agoraMs();
  const emBackoff = cur?.proxima_tentativa ? Date.parse(cur.proxima_tentativa) > agora : false;
  const certificadoVencendo =
    cert?.validade !== null && cert?.validade !== undefined
      ? Date.parse(cert.validade) - agora < 30 * 24 * 60 * 60 * 1000
      : false;
  const atrasado = cur?.max_nsu !== undefined && cur.max_nsu > (cur?.ult_nsu ?? 0);

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title="Notas fiscais"
        subtitle="As NF-e que emitiram contra o CNPJ da empresa — recebidas pela SEFAZ, conferidas e importadas."
        actions={podeOperar ? <BotaoSincronizar /> : undefined}
      />

      <NexusKpiGrid>
        <NexusKpi
          label="Notas no mês"
          value={resumo.notas}
          hint={`${resumo.notas_validas} válida(s) · ${resumo.canceladas} cancelada(s)`}
        />
        <NexusKpi
          label="Valor no mês"
          value={comoMoeda(resumo.valor_cents, "BRL")}
          hint="Sem canceladas"
        />
        <NexusKpi
          label="Impostos no mês"
          value={comoMoeda(resumo.impostos_cents, "BRL")}
          hint={`ICMS ${comoMoeda(resumo.icms_cents, "BRL")} · IPI ${comoMoeda(resumo.ipi_cents, "BRL")}`}
        />
        <NexusKpi
          label="Pendentes de conferência"
          value={pendentes ?? 0}
          tone={(pendentes ?? 0) > 0 ? "warning" : "default"}
          hint="Estoque só se move depois de aprovar"
        />
      </NexusKpiGrid>

      {(emBackoff || certificadoVencendo || atrasado || !cfg) && (
        <div className="space-y-2">
          {!cfg && (
            <p className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3 text-sm">
              <strong>Fiscal não configurado.</strong> Preencha o CNPJ, a UF e o certificado A1
              em{" "}
              <Link href="/app/fiscal/configuracoes" className="underline underline-offset-4">
                Configurações Fiscais
              </Link>
              .
            </p>
          )}
          {emBackoff && (
            <p className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3 text-sm">
              <strong>A SEFAZ pediu para aguardar.</strong> A próxima tentativa automática é
              depois de{" "}
              {cur?.proxima_tentativa
                ? new Date(cur.proxima_tentativa).toLocaleString(tagIdioma)
                : "1 hora"}
              . Insistir agora pode bloquear o CNPJ por consumo indevido (656).
            </p>
          )}
          {atrasado && !emBackoff && (
            <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
              <strong>Há notas ainda não baixadas.</strong> A SEFAZ informou NSU máximo{" "}
              {cur?.max_nsu} e o cursor está em {cur?.ult_nsu}. Sincronize para continuar de onde
              parou.
            </p>
          )}
          {certificadoVencendo && (
            <p className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3 text-sm">
              <strong>Certificado A1 vencendo.</strong>{" "}
              {cert?.titular ?? "Titular não identificado"} — validade{" "}
              {cert?.validade ? new Date(cert.validade).toLocaleDateString(tagIdioma) : "desconhecida"}
              . Troque em Configurações Fiscais.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Últimas notas recebidas</h2>
            <Link
              href="/app/fiscal/notas"
              className="text-sm text-accent underline-offset-4 hover:underline"
            >
              Ver todas
            </Link>
          </div>
          <TabelaDeEntradas inicial={((ultimas ?? []) as never[]).slice(0, 8)} />
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-medium">Sincronização</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Automática</dt>
                <dd>{cfg?.entrada_ativa ? "Ligada" : "Desligada"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Frequência</dt>
                <dd>{cfg?.frequencia_minutos ?? 60} min</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Ambiente</dt>
                <dd>{cfg?.ambiente === "producao" ? "Produção" : "Homologação"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Última</dt>
                <dd>
                  {cfg?.ultima_sincronizacao
                    ? new Date(cfg.ultima_sincronizacao).toLocaleString(tagIdioma)
                    : "Nunca"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Cursor / máximo</dt>
                <dd className="tabular-nums">
                  {cur?.ult_nsu ?? 0} / {cur?.max_nsu ?? 0}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-medium">Últimas execuções</h2>
            {(ultimosLogs ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma sincronização ainda.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(ultimosLogs ?? []).map((l) => {
                  const log = l as unknown as {
                    id: string;
                    origem: string;
                    resultado: string;
                    docs_importados: number;
                    docs_erro: number;
                    mensagem: string | null;
                    iniciado_em: string;
                  };
                  return (
                    <li key={log.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate">
                          {log.origem === "cron" ? "Automática" : "Manual"} ·{" "}
                          {log.docs_importados} importada(s)
                          {log.docs_erro > 0 ? ` · ${log.docs_erro} erro(s)` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(log.iniciado_em).toLocaleString(tagIdioma)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          log.resultado === "sucesso"
                            ? "success"
                            : log.resultado === "erro"
                              ? "error"
                              : log.resultado === "bloqueado"
                                ? "warning"
                                : "neutral"
                        }
                        className="text-[10px]"
                      >
                        {log.resultado}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              href="/app/fiscal/sincronizacoes"
              className="mt-3 inline-block text-sm text-accent underline-offset-4 hover:underline"
            >
              Histórico completo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
