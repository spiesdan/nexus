"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { comoMoeda } from "@/lib/format/moeda";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SalesBrainItem } from "@/hooks/nexus/useSalesBrain";
import type { QueueRow } from "@/app/api/v1/ai/followups/queue/route";
import type { UsagePayload } from "@/lib/ai/usage/aggregate";

interface LinhaAuditoria {
  id: string;
  action: string;
}

function Cartao({
  titulo,
  valor,
  detalhe,
  href,
  hrefLabel,
  loading,
  erro,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  href: string;
  hrefLabel: string;
  loading: boolean;
  erro: boolean;
}) {
  const t = useT();
  return (
    <Card className="hover-raise p-4">
      <h2 className="text-sm font-medium text-muted-foreground">{titulo}</h2>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : erro ? (
        <p className="mt-2 text-sm text-error-fg">{t("Indisponível.")}</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-text">{valor}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>
        </>
      )}
      <Link href={href} className="mt-2 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline">
        {hrefLabel}
      </Link>
    </Card>
  );
}

/**
 * AI Sales Control (§56, parte 1): Decisões, Oportunidades, Follow-ups e
 * Orçamento — cada cartão lê a fonte canônica (auditoria, Brain, fila,
 * uso). Erros/conversas/pedidos da IA entram na parte 2, com fonte própria.
 */
export function ControleList() {
  const t = useT();
  const mes = new Date().toISOString().slice(0, 7);

  const decisoes = useQuery({
    queryKey: ["controle", "decisoes"],
    queryFn: () =>
      apiClient.get<{ data: LinhaAuditoria[] }>(`/api/v1/audit?action=ai.action&limit=100`).then((r) => (Array.isArray(r.data) ? r.data : [])),
  });
  const brain = useQuery({
    queryKey: ["controle", "brain"],
    queryFn: () =>
      apiClient.get<{ data: SalesBrainItem[] }>(`/api/v1/sales-brain?limit=200`).then((r) => (Array.isArray(r.data) ? r.data : [])),
  });
  const followups = useQuery({
    queryKey: ["controle", "followups"],
    queryFn: () =>
      apiClient.get<{ data: QueueRow[] }>(`/api/v1/ai/followups/queue?limit=100`).then((r) => (Array.isArray(r.data) ? r.data : [])),
  });
  const uso = useQuery({
    queryKey: ["controle", "uso", mes],
    queryFn: () =>
      apiClient.get<{ data: UsagePayload }>(`/api/v1/ai/usage?from=${mes}-01&to=${mes}-31`).then((r) => r.data),
  });

  const props = (decisoes.data ?? []).filter((d) => d.action === "ai.action.proposed").length;
  const decididas = (decisoes.data ?? []).filter((d) => d.action !== "ai.action.proposed").length;
  const altas = (brain.data ?? []).filter((b) => b.prioridade === "alta").length;
  const ativos = (followups.data ?? []).filter((f) => f.status === "active" || f.status === "agendada").length;
  const custo = uso.data?.totals.cost_cents ?? 0;

  const resumo = useQuery({
    queryKey: ["controle", "resumo"],
    queryFn: () =>
      apiClient
        .get<{
          data: {
            conversas_automatico: number;
            erros_7d: number;
            ultimo_erro: { codigo: string | null; em: string } | null;
            pedidos_ia_30d: number;
          };
        }>(`/api/v1/ai/controle/resumo`)
        .then((r) => r.data),
  });
  const res = resumo.data;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Cartao
        titulo={t("Decisões pendentes")}
        valor={String(props)}
        detalhe={`${decididas} ${t("decididas nas últimas 100 ações")}`}
        href="/app/ai/decisoes"
        hrefLabel={t("Abrir decisões")}
        loading={decisoes.isLoading}
        erro={decisoes.isError}
      />
      <Cartao
        titulo={t("Oportunidades (IA)")}
        valor={String(brain.data?.length ?? 0)}
        detalhe={`${altas} ${t("em prioridade alta")}`}
        href="/app/inteligencia"
        hrefLabel={t("Abrir inteligência")}
        loading={brain.isLoading}
        erro={brain.isError}
      />
      <Cartao
        titulo={t("Follow-ups ativos")}
        valor={String(ativos)}
        detalhe={t("na fila (100 primeiros)")}
        href="/app/ai/followups"
        hrefLabel={t("Abrir fila")}
        loading={followups.isLoading}
        erro={followups.isError}
      />
      <Cartao
        titulo={t("Custo de IA no mês")}
        valor={comoMoeda(custo, "BRL")}
        detalhe={`${uso.data?.totals.invocations ?? 0} ${t("chamadas")}`}
        href="/app/ai/usage"
        hrefLabel={t("Abrir uso")}
        loading={uso.isLoading}
        erro={uso.isError}
      />
      <Cartao
        titulo={t("Conversas com a IA")}
        valor={String(res?.conversas_automatico ?? 0)}
        detalhe={t("no comando automático agora")}
        href="/app/inbox"
        hrefLabel={t("Abrir inbox")}
        loading={resumo.isLoading}
        erro={resumo.isError}
      />
      <Cartao
        titulo={t("Erros de IA (7d)")}
        valor={String(res?.erros_7d ?? 0)}
        detalhe={res?.ultimo_erro ? `${t("último")}: ${res.ultimo_erro.codigo ?? "—"}` : t("sem erro na semana")}
        href="/app/ai/runs"
        hrefLabel={t("Ver execuções")}
        loading={resumo.isLoading}
        erro={resumo.isError}
      />
      <Cartao
        titulo={t("Pedidos da IA (30d)")}
        valor={String(res?.pedidos_ia_30d ?? 0)}
        detalhe={t("criados pelo agente")}
        href="/app/pedidos"
        hrefLabel={t("Abrir pedidos")}
        loading={resumo.isLoading}
        erro={resumo.isError}
      />
    </div>
  );
}
