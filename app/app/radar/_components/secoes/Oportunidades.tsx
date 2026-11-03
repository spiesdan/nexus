"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { EmptyFilterResults } from "@/components/empty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { ROTULO_RECOMPRA } from "@/lib/comercial/radar-compras";
import {
  agregarRadar,
  FILTRO_RADAR_VAZIO,
  filtrarLinhas,
  intervaloTipicoDe,
  ROTULO_NIVEL,
  type NivelRadar,
} from "@/lib/comercial/radar-score";
import { comoMoeda } from "@/lib/format/moeda";

import {
  useCriarTarefaDoRadar,
  useLinhasDoRadar,
  useRadarDados,
  useVendedoresDoRadar,
} from "../../_dados";
import { FiltrosDoRadar } from "../FiltrosDoRadar";
import { RecompraRadarList } from "../RecompraRadarList";
import { paraLinha, zapHref } from "../comum";

const VARIANTE_NIVEL: Record<NivelRadar, "success" | "warning" | "error" | "info"> = {
  saudavel: "success",
  atencao: "warning",
  risco: "error",
  critico: "error",
};

/**
 * AS OPORTUNIDADES — quem chamar hoje, e a lista completa por trás.
 *
 * Duas leituras do mesmo universo: o ranking por score (as cinco conversas com
 * mais retorno potencial) e a lista clássica de recompra, que é onde a operação
 * confere por situação e abre os pedidos. O recorte da visão geral chega aqui
 * pela URL — clicar em "Oportunidades de recompra" abre a lista já na situação
 * certa, em vez de obrigar a pessoa a repetir o clique num select.
 */
export function OportunidadesDoRadar() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { filtros, limpar } = useRadarDados();
  const { linhas, falhou, recarregar } = useLinhasDoRadar();
  const vendedores = useVendedoresDoRadar();
  const { criarTarefa, tarefaEmCurso } = useCriarTarefaDoRadar();
  const [situacao, setSituacao] = React.useState(() => params.get("situacao") ?? "");

  const nomesVendedores = React.useMemo(
    () => new Map(vendedores.map((v) => [v.user_id, v.full_name ?? v.user_id.slice(0, 8)])),
    [vendedores],
  );

  function mudarSituacao(s: string) {
    setSituacao(s);
    // `replaceState` e não `router.push`: escolher um filtro não é navegação, e
    // cada tecla do select refaria a guarda do servidor. A URL continua certa
    // para o F5 e para o link.
    const url = new URL(window.location.href);
    if (s) url.searchParams.set("situacao", s);
    else url.searchParams.delete("situacao");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const linhasRadar = React.useMemo(() => (linhas ?? []).map(paraLinha), [linhas]);
  const filtradas = React.useMemo(
    () => filtrarLinhas(linhasRadar, filtros),
    [linhasRadar, filtros],
  );
  const resumo = React.useMemo(
    () => (linhas === null ? null : agregarRadar(filtradas, hoje)),
    [filtradas, linhas, hoje],
  );

  if (linhas === null) {
    if (falhou) {
      return (
        <Card className="hover-raise p-8 text-center">
          <p className="font-medium">{t("Não consegui ler os pedidos.")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Verifique a conexão e tente de novo.")}
          </p>
          <Button className="mt-4" onClick={recarregar}>
            {t("Tentar novamente")}
          </Button>
        </Card>
      );
    }
    return (
      <div className="space-y-3" aria-live="polite">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </div>
    );
  }

  const r = resumo ?? agregarRadar([], hoje);
  const top = r.ranking.slice(0, 5);
  const semFiltro = JSON.stringify(filtros) === JSON.stringify(FILTRO_RADAR_VAZIO);

  return (
    <div className="space-y-6">
      <FiltrosDoRadar linhas={linhasRadar} vendedores={vendedores} onAtualizar={recarregar} />

      {/* Oportunidades de hoje — ranking por score, com ação. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium text-text">{t("Oportunidades de hoje")}</h2>
          {!semFiltro && (
            <Button size="sm" variant="ghost" onClick={limpar}>
              {t("Limpar filtros")} ({filtradas.length})
            </Button>
          )}
        </div>
        {top.length === 0 ? (
          filtradas.length === 0 && !semFiltro ? (
            <EmptyFilterResults primary={{ label: t("Limpar filtros"), onClick: limpar }} />
          ) : (
            <Card className="hover-raise p-8 text-center">
              <p className="font-medium">{t("Tudo tranquilo por aqui")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Nenhum cliente atrasado no recorte atual.")}
              </p>
            </Card>
          )
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {top.map((l) => {
              const intervalo = intervaloTipicoDe(l);
              const zap = zapHref(l.fone, l.nome, l.atraso_dias, intervalo);
              const vendedor = l.vendedor_user_id
                ? (nomesVendedores.get(l.vendedor_user_id) ?? null)
                : null;
              const onde = [l.cidade && l.uf ? `${l.cidade}/${l.uf}` : l.cidade, vendedor]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={l.contact_id}>
                  <Card className="hover-raise h-full space-y-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/app/contacts/${l.contact_id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {l.nome}
                      </Link>
                      <Badge variant={VARIANTE_NIVEL[l.nivel]}>{ROTULO_NIVEL[l.nivel]}</Badge>
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        score {l.score}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {t("Última compra há")} {l.dias_sem_compra}d
                      {intervalo != null && (
                        <>
                          {" "}
                          · {t("padrão a cada")} ~{Math.round(intervalo)}d
                        </>
                      )}{" "}
                      · +{l.atraso_dias}d
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("Ticket médio")} {comoMoeda(l.ticket_medio_cents, "BRL")} ·{" "}
                      {t("potencial")} {comoMoeda(l.ticket_medio_cents, "BRL")}
                      {onde !== "" && <> · {onde}</>}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/app/contacts/${l.contact_id}`}>{t("Abrir cliente")}</Link>
                      </Button>
                      {zap && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={zap} target="_blank" rel="noopener noreferrer">
                            WhatsApp
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={tarefaEmCurso === l.contact_id}
                        onClick={() => void criarTarefa(l)}
                      >
                        {tarefaEmCurso === l.contact_id ? t("Criando…") : t("Criar tarefa")}
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Todos os alertas — a lista clássica, que a operação já conhece. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium text-text">{t("Todos os alertas de recompra")}</h2>
          {situacao !== "" && (
            <Button size="sm" variant="ghost" onClick={() => mudarSituacao("")}>
              {t("Limpar filtro do gráfico")}:{" "}
              {ROTULO_RECOMPRA[situacao as keyof typeof ROTULO_RECOMPRA] ?? situacao}
            </Button>
          )}
        </div>
        <RecompraRadarList
          situacaoExterna={situacao || undefined}
          onSituacaoExternaChange={mudarSituacao}
        />
      </section>

      {/* Um atalho de volta ao diagnóstico: quem chegou aqui pelo KPI não fica
          sem o caminho de volta ao painel. */}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => router.push("/app/radar")}>
          {t("Voltar para a visão geral")}
        </Button>
      </div>
    </div>
  );
}
