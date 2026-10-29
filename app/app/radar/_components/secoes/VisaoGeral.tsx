"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { linkWhatsAppRecuperacao } from "@/lib/comercial/inatividade";
import { filtrarLinhas, ROTULO_NIVEL, agregarRadar, type NivelRadar, type ResumoRadar } from "@/lib/comercial/radar-score";
import { comRecorte } from "@/lib/comercial/radar-filtros-url";
import { comoMoeda } from "@/lib/format/moeda";

import { useInativosDoRadar, useLinhasDoRadar, useRadarDados, useVendedoresDoRadar } from "../../_dados";
import { FiltrosDoRadar } from "../FiltrosDoRadar";
import { paraLinha } from "../comum";

const COR_NIVEL: Record<NivelRadar, string> = {
  saudavel: "#33c758",
  atencao: "#ffa600",
  risco: "#ff3e00",
  critico: "#a94a3c",
};

/**
 * A VISÃO GERAL — o painel de decisão, sem as listas de trabalho.
 *
 * Responde "como está a carteira e o que fazer hoje": recorte, KPIs, as três
 * ações de maior impacto, saúde das compras e a distribuição de risco/recompra.
 * Quem contatar de fato vive nas telas vizinhas — clicar num número leva para a
 * lista já recortada, que é o laço entre o diagnóstico e a ação.
 */
export function VisaoGeralDoRadar() {
  const t = useT();
  const router = useRouter();
  const { filtros, mudar } = useRadarDados();
  const { linhas, falhou, recarregar } = useLinhasDoRadar();
  const vendedores = useVendedoresDoRadar();
  const { inativos } = useInativosDoRadar();
  const [metricaSaude, setMetricaSaude] = React.useState<"compras" | "clientes">("compras");

  const hoje = new Date().toISOString().slice(0, 10);
  const linhasRadar = React.useMemo(() => (linhas ?? []).map(paraLinha), [linhas]);
  const filtradas = React.useMemo(
    () => filtrarLinhas(linhasRadar, filtros),
    [linhasRadar, filtros],
  );
  const resumo: ResumoRadar | null = React.useMemo(
    () => (linhas === null ? null : agregarRadar(filtradas, hoje)),
    [filtradas, linhas, hoje],
  );
  const serieMista = React.useMemo(() => {
    const clientesPorSemana = new Map<string, Set<string>>();
    for (const l of filtradas) {
      for (const u of l.ultimos) {
        if (u.dia > hoje) continue;
        const d = new Date(`${u.dia}T12:00:00Z`);
        const dow = (d.getUTCDay() + 6) % 7;
        d.setUTCDate(d.getUTCDate() - dow);
        const s = d.toISOString().slice(0, 10);
        const set = clientesPorSemana.get(s) ?? new Set<string>();
        set.add(l.contact_id);
        clientesPorSemana.set(s, set);
      }
    }
    return (resumo?.serie ?? []).map((s) => ({
      ...s,
      clientes: clientesPorSemana.get(s.semana)?.size ?? 0,
    }));
  }, [resumo, filtradas, hoje]);

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
      <div className="space-y-4" aria-live="polite">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const r = resumo ?? agregarRadar([], hoje);
  const donut = [
    { nome: t("No prazo"), valor: r.recompra.noPrazo, cor: "#33c758", situacao: "" },
    {
      nome: t("Atrasados"),
      valor: r.recompra.atrasados,
      cor: "#ffa600",
      situacao: "recompra_atrasada",
    },
    {
      nome: t("Muito atrasados"),
      valor: r.recompra.muitoAtrasados,
      cor: "#ff3e00",
      situacao: "em_risco",
    },
    {
      nome: t("Compra única"),
      valor: r.recompra.primeiraCompra,
      cor: "#999999",
      situacao: "primeira_compra",
    },
  ].filter((d) => d.valor > 0);
  const totalDonut = donut.reduce((s, d) => s + d.valor, 0) || 1;

  const barrasRisco = (Object.keys(COR_NIVEL) as NivelRadar[]).map((n) => ({
    nivel: n,
    rotulo: ROTULO_NIVEL[n],
    qtd: r.distrib[n],
    cor: COR_NIVEL[n],
  }));
  const maxBarra = Math.max(1, ...barrasRisco.map((b) => b.qtd));

  const top = r.ranking.slice(0, 3);

  /** O laço diagnóstico → ação: o número leva para a lista já recortada. */
  function paraOportunidades(query?: string) {
    router.push(comRecorte(`/app/radar/oportunidades${query ? `?${query}` : ""}`, filtros));
  }

  return (
    <div className="space-y-6">
      <FiltrosDoRadar linhas={linhasRadar} vendedores={vendedores} onAtualizar={recarregar} />

      {/* KPIs — clicar em risco/oportunidades leva à lista filtrada. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="hover-raise p-3">
          <p className="text-xs text-muted-foreground">{t("Clientes monitorados")}</p>
          <p className="mt-1 text-2xl font-semibold text-text tabular-nums">
            {r.monitorados.toLocaleString("pt-BR")}
          </p>
          {r.semCompraValida > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              +{r.semCompraValida.toLocaleString("pt-BR")} {t("sem compra válida (prospecção)")}
            </p>
          )}
        </Card>
        <button
          type="button"
          className="text-left"
          onClick={() => paraOportunidades("situacao=em_risco")}
          aria-label={t("Ver clientes em risco")}
        >
          <Card className="hover-raise h-full p-3 transition-colors hover:border-border-strong">
            <p className="text-xs text-muted-foreground">{t("Em risco")}</p>
            <p className="mt-1 text-2xl font-semibold text-text tabular-nums">
              {r.emRisco.toLocaleString("pt-BR")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {r.riscoPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% {t("da carteira")}
            </p>
          </Card>
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => paraOportunidades("situacao=recompra_atrasada")}
          aria-label={t("Ver oportunidades de recompra")}
        >
          <Card className="hover-raise h-full p-3 transition-colors hover:border-border-strong">
            <p className="text-xs text-muted-foreground">{t("Oportunidades de recompra")}</p>
            <p className="mt-1 text-2xl font-semibold text-text tabular-nums">
              {r.oportunidades.toLocaleString("pt-BR")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {comoMoeda(r.potencialCents, "BRL")} {t("estimados")}
            </p>
          </Card>
        </button>
        <Card className="hover-raise p-3">
          <p className="text-xs text-muted-foreground">{t("Receita em risco")}</p>
          <p className="mt-1 text-2xl font-semibold text-text tabular-nums">
            {comoMoeda(r.receitaRiscoCents, "BRL")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("ticket médio dos atrasados")}</p>
        </Card>
      </div>

      {/* Ações recomendadas hoje — as 3 prioridades por impacto. */}
      {top.length > 0 && (
        <Card className="hover-raise space-y-2 p-4">
          <h2 className="text-base font-medium text-text">{t("Ações recomendadas hoje")}</h2>
          <ul className="space-y-2">
            {top.map((l, i) => (
              <li key={l.contact_id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-medium text-accent-foreground">
                  {i + 1}
                </span>
                <Link
                  href={`/app/contacts/${l.contact_id}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {l.nome}
                </Link>
                <span className="text-muted-foreground">
                  +{l.atraso_dias}d · {comoMoeda(l.ticket_medio_cents, "BRL")}
                </span>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" asChild>
            <Link href={comRecorte("/app/radar/oportunidades", filtros)}>{t("Ver todas")}</Link>
          </Button>
        </Card>
      )}

      {/* Saúde da carteira — eventos de compra reais por semana (até 4/cliente). */}
      <Card className="hover-raise p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-medium text-text">{t("Saúde da carteira")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("Eventos de compra por semana — 12 últimas semanas.")}
            </p>
          </div>
          <div className="flex gap-1.5">
            {(["compras", "clientes"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={metricaSaude === m}
                onClick={() => setMetricaSaude(m)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${metricaSaude === m ? "border-transparent bg-accent text-accent-foreground" : "hover:border-accent"}`}
              >
                {m === "compras" ? t("Compras") : t("Clientes")}
              </button>
            ))}
          </div>
        </div>
        {r.serie.every((s) => s.compras === 0) ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("Sem eventos de compra nas últimas 12 semanas.")}
          </p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serieMista} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="rotulo"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  interval={2}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v) => [v, metricaSaude === "compras" ? t("compras") : t("clientes")]}
                  labelFormatter={(l) => `${t("Semana de")} ${l}`}
                />
                <Bar dataKey={metricaSaude} fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Recompra — clicar numa fatia leva à lista filtrada. */}
        <Card className="hover-raise p-4">
          <h2 className="text-base font-medium text-text">{t("Recompra")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("Clique numa fatia para ver a lista.")}
          </p>
          {totalDonut === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("Sem dados de ciclo.")}
            </p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donut}
                    dataKey="valor"
                    nameKey="nome"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                    onClick={(d) => {
                      const situacao = (d as unknown as { situacao?: string })?.situacao ?? "";
                      if (situacao) paraOportunidades(`situacao=${situacao}`);
                      else paraOportunidades();
                    }}
                    className="cursor-pointer outline-hidden"
                  >
                    {donut.map((d) => (
                      <Cell key={d.nome} fill={d.cor} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v, nome) => [
                      `${v} (${((Number(v) / totalDonut) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%)`,
                      nome,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Risco — distribuição por nível; clicar recorta e abre a lista. */}
        <Card className="hover-raise p-4">
          <h2 className="text-base font-medium text-text">{t("Risco de carteira")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("Pelo comportamento de cada cliente, não por dia fixo.")}
          </p>
          <ul className="mt-3 space-y-2">
            {barrasRisco.map((b) => (
              <li key={b.nivel} className="text-sm">
                <div className="flex justify-between gap-2">
                  <button
                    type="button"
                    className="font-medium underline-offset-4 hover:underline"
                    onClick={() => {
                      mudar({ niveis: [b.nivel] });
                      router.push(
                        comRecorte("/app/radar/oportunidades", { ...filtros, niveis: [b.nivel] }),
                      );
                    }}
                  >
                    {b.rotulo}
                  </button>
                  <span className="text-muted-foreground tabular-nums">{b.qtd}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(b.qtd / maxBarra) * 100}%`, background: b.cor }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Inativos — atalho para a tela de recuperação, que é onde a lista completa vive. */}
      <Card className="hover-raise space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium text-text">{t("Maiores chances de recuperação")}</h2>
          <Button size="sm" variant="outline" asChild>
            <Link href="/app/radar/recuperacao">{t("Abrir recuperação")}</Link>
          </Button>
        </div>
        {inativos === null ? (
          <Skeleton className="h-10 w-full" />
        ) : inativos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("Ninguém inativo há 90 dias. Boas vendas!")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {inativos.map((c) => {
              const zap = linkWhatsAppRecuperacao(c.telefone, c.nome, c.dias_sem_compra);
              return (
                <li key={c.contact_id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <Link
                    href={`/app/contacts/${c.contact_id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {c.nome}
                  </Link>
                  <span className="text-muted-foreground tabular-nums">
                    {c.dias_sem_compra}d · {comoMoeda(c.total_historico_cents, "BRL")}
                  </span>
                  <span className="ml-auto flex gap-2">
                    {zap && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={zap} target="_blank" rel="noopener noreferrer">
                          WhatsApp
                        </a>
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
