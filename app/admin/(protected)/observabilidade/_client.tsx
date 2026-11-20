"use client";

import { useQuery } from "@tanstack/react-query";

import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";

type EstadoSlo = "ok" | "em_risco" | "estourado" | "sem_historico";

interface Slo {
  id: "disponibilidade" | "latencia" | "frescor_sentinel";
  titulo: string;
  formula: string;
  janela: string;
  alvo: string;
  unidade: "%" | "ms";
  valor: number | null;
  estado: EstadoSlo;
  nota: string;
  detalhe?: Record<string, number | string | boolean | null>;
}

interface SerieDaApi {
  amostras: number;
  rotas: number;
  primeira_em: string | null;
  ultima_em: string | null;
}

interface Resposta {
  gerado_em: string;
  serie: SerieDaApi;
  slos: Slo[];
}

const ROTULO_DO_ESTADO: Record<EstadoSlo, string> = {
  ok: "ok",
  em_risco: "em risco",
  estourado: "estourado",
  sem_historico: "sem histórico",
};

const VARIANTE_DO_ESTADO: Record<
  EstadoSlo,
  "success" | "warning" | "error" | "neutral"
> = {
  ok: "success",
  em_risco: "warning",
  estourado: "error",
  sem_historico: "neutral",
};

function valorNaTela(slo: Slo, tag: string): string {
  if (slo.valor === null) return "—";
  if (slo.unidade === "%") return `${slo.valor.toLocaleString(tag)}%`;
  return `${slo.valor.toLocaleString(tag)} ms`;
}

function CartaoDeSlo({ slo }: { slo: Slo }) {
  const t = useT();
  const tag = useTagDeIdioma();
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <CardTitle className="text-base">{t(slo.titulo)}</CardTitle>
        <Badge variant={VARIANTE_DO_ESTADO[slo.estado]}>{t(ROTULO_DO_ESTADO[slo.estado])}</Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            {t("Valor atual")}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
            {valorNaTela(slo, tag)}
          </p>
          {slo.valor === null ? (
            <p className="mt-1 text-sm text-text-muted">{t("sem histórico ainda")}</p>
          ) : null}
        </div>

        <dl className="grid gap-2 text-sm">
          <div className="flex flex-col">
            <dt className="text-xs uppercase tracking-wide text-text-muted">{t("Fórmula")}</dt>
            <dd className="text-text">{slo.formula}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs uppercase tracking-wide text-text-muted">{t("Janela")}</dt>
            <dd className="text-text">{slo.janela}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs uppercase tracking-wide text-text-muted">{t("Alvo")}</dt>
            <dd className="text-text">{slo.alvo}</dd>
          </div>
        </dl>

        <p className="mt-auto text-xs text-text-muted">{t(slo.nota)}</p>
      </CardContent>
    </Card>
  );
}

function SerieDaApiCartao({ serie }: { serie: SerieDaApi }) {
  const t = useT();
  const tag = useTagDeIdioma();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Série de API (7 dias)")}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-text-muted">
        {serie.amostras === 0 ? (
          <p>
            {t(
              "A série está ligada, mas nenhuma requisição autenticada passou pelas rotas quentes desde o deploy.",
            )}
          </p>
        ) : (
          <p>
            {serie.amostras.toLocaleString(tag)} {t("amostras")} · {serie.rotas}{" "}
            {t("rotas")} · {t("de")}{" "}
            {serie.primeira_em ? new Date(serie.primeira_em).toLocaleString(tag) : "—"}{" "}
            {t("até")}{" "}
            {serie.ultima_em ? new Date(serie.ultima_em).toLocaleString(tag) : "—"}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ObservabilidadeClient() {
  const t = useT();
  const tag = useTagDeIdioma();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "observabilidade"],
    queryFn: () =>
      apiClient
        .get<{ data: Resposta }>("/api/v1/admin/observabilidade")
        .then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title={t("Observabilidade")}
        subtitle={t("SLOs da instalação — leitura apenas, atualiza a cada 60 segundos.")}
      />

      {isLoading || !data ? (
        isError ? (
          <NexusErrorState
            description={t("Não foi possível carregar os SLOs da instalação.")}
            onRetry={() => void refetch()}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="space-y-3 pt-6">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        <>
          <SerieDaApiCartao serie={data.serie} />
          <div className="grid gap-4 md:grid-cols-3">
            {data.slos.map((slo) => (
              <CartaoDeSlo key={slo.id} slo={slo} />
            ))}
          </div>
          <p className="text-xs text-text-muted">
            {t("Gerado em")} {new Date(data.gerado_em).toLocaleString(tag)}.
          </p>
        </>
      )}
    </div>
  );
}
