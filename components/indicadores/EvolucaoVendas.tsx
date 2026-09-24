"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ChartBar, DotsThree, Info, Sparkle } from "@/lib/ui/icons";
import { EASE_OUT } from "@/lib/ease";
import { Card } from "@/components/ui/card";
import { comoMoeda } from "@/lib/format/moeda";
import { useT } from "@/hooks/i18n/useT";
import type { DadosIndicadores } from "@/app/app/indicadores/_indicadores";

function brl(cents: number): string {
  return comoMoeda(cents, "BRL");
}

const VERDE = "#00CC62";
const ROXO = "#8b5cf6";
const AMARELO = "#FFB300";
const CINZA = "#94a3b8";
const CINZA_CLARO = "#cbd5e1";

const LETRAS_DIA = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Geometria espelhada do Highcharts do Mercos (685×316, plot generoso). */
const VB_W = 720;
const VB_H = 344;
const PL = 60;
const PT = 12;
const PW = 652;
const PH = 228;

function Barra({ pct, cor }: { pct: number | null; cor: string }) {
  const v = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={Math.round(v)}
    >
      <div className={`${cor} h-full rounded-full`} style={{ width: `${v}%` }} />
    </div>
  );
}

type Serie = DadosIndicadores["serie"][number];

function passoElegante(maximo: number): number {  if (!(maximo > 0)) return 30000;
  const mag = 10 ** Math.floor(Math.log10(maximo / 4));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (maximo / (m * mag) <= 4.5) return m * mag;
  }
  return 10 * mag;
}

/** Dia (1-based) sob o pixel — matemática pura para poder testar. */
export function diaDoPixel(clientX: number, larguraPx: number, diasNoMes: number): number {
  const passo = PW / Math.max(1, diasNoMes - 1);
  const dia = Math.round(((clientX / larguraPx) * VB_W - PL) / passo) + 1;
  return Math.min(diasNoMes, Math.max(1, dia));
}

export function EvolucaoVendas({
  dados,
  comparar,
  onCompararChange,
}: {
  dados: DadosIndicadores;
  comparar: boolean;
  onCompararChange: (v: boolean) => void;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const partes = dados.mes.split("-");
  const ano = Number(partes[0] ?? 0);
  const mesNum = Number(partes[1] ?? 0);
  const diasNoMes = new Date(ano, mesNum, 0).getDate();
  const agora = new Date();
  const ehMesAtual = ano === agora.getFullYear() && mesNum === agora.getMonth() + 1;
  const hojeNum = ehMesAtual ? agora.getDate() : diasNoMes;

  const [objetivoVis, setObjetivoVis] = React.useState(true);
  const [previsaoVis, setPrevisaoVis] = React.useState(true);
  const [diaAtivo, setDiaAtivo] = React.useState<number | null>(null);
  const [menuAberto, setMenuAberto] = React.useState(false);

  const porDia = React.useMemo(() => new Map(dados.serie.map((s) => [s.dia, s])), [dados.serie]);

  const x = React.useCallback(
    (dia: number) => PL + ((dia - 1) / Math.max(1, diasNoMes - 1)) * PW,
    [diasNoMes],
  );

  const teto = React.useMemo(() => {
    let max = 1;
    for (const s of dados.serie) {
      for (const v of [s.vendaAc, s.metaAc, s.projecao, comparar ? s.mesAnt : null, comparar ? s.mesAno : null]) {
        if (v != null && v / 100 > max) max = v / 100;
      }
    }
    const step = passoElegante(max);
    return { max: Math.ceil(max / step) * step, step };
  }, [dados.serie, comparar]);

  const y = React.useCallback(
    (reais: number) => PT + (1 - reais / teto.max) * PH,
    [teto.max],
  );

  const linha = (pts: { dia: number; reais: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.dia).toFixed(1)},${y(p.reais).toFixed(1)}`).join(" ");

  const historico = React.useMemo(() => {
    const pts: { dia: number; reais: number }[] = [];
    for (let d = 1; d <= Math.min(hojeNum, diasNoMes); d++) {
      pts.push({ dia: d, reais: (porDia.get(d)?.vendaAc ?? 0) / 100 });
    }
    return pts;
  }, [porDia, hojeNum, diasNoMes]);

  const previsao = React.useMemo(() => {
    const pts: { dia: number; reais: number }[] = [];
    const base = porDia.get(hojeNum);
    if (base) pts.push({ dia: hojeNum, reais: base.vendaAc / 100 });
    for (let d = hojeNum + 1; d <= diasNoMes; d++) {
      const v = porDia.get(d)?.projecao;
      if (v != null && v > 0) pts.push({ dia: d, reais: v / 100 });
    }
    return pts;
  }, [porDia, hojeNum, diasNoMes]);

  const objetivo = React.useMemo(() => {
    const pts: { dia: number; reais: number }[] = [];
    for (let d = 1; d <= diasNoMes; d++) {
      const v = porDia.get(d)?.metaAc;
      if (v != null && v > 0) pts.push({ dia: d, reais: v / 100 });
    }
    return pts;
  }, [porDia, diasNoMes]);

  const compara = React.useCallback(
    (chave: "mesAnt" | "mesAno") => {
      const pts: { dia: number; reais: number }[] = [];
      for (let d = 1; d <= diasNoMes; d++) {
        const v = porDia.get(d)?.[chave];
        if (v != null && v > 0) pts.push({ dia: d, reais: v / 100 });
      }
      return pts;
    },
    [porDia, diasNoMes],
  );
  const mesAntPts = compara("mesAnt");
  const mesAnoPts = compara("mesAno");

  const gradeY = React.useMemo(() => {
    const linhas: number[] = [];
    for (let v = 0; v <= teto.max + 1; v += teto.step) linhas.push(v);
    return linhas;
  }, [teto]);

  const ativo: Serie | undefined = diaAtivo != null ? porDia.get(diaAtivo) : undefined;
  const futuro = diaAtivo != null && diaAtivo > hojeNum;

  const legenda = [
    { id: "vendas", cor: VERDE, tracejado: false, rotulo: t("Vendas no mês"), apagado: false, acao: undefined as undefined | (() => void) },
    { id: "objetivo", cor: ROXO, tracejado: false, rotulo: t("Objetivo"), apagado: !objetivoVis, acao: () => setObjetivoVis((v) => !v) },
    { id: "previsao", cor: AMARELO, tracejado: true, rotulo: t("Previsão de vendas"), apagado: !previsaoVis, acao: () => setPrevisaoVis((v) => !v) },
    { id: "mesant", cor: CINZA, tracejado: true, rotulo: t("Mês passado"), apagado: !comparar, acao: () => onCompararChange(!comparar) },
    { id: "mesano", cor: CINZA_CLARO, tracejado: true, rotulo: t("Ano passado"), apagado: !comparar, acao: () => onCompararChange(!comparar) },
  ];

  const vazio = !dados.serie.some((s) => s.vendaAc > 0);

  return (
    <Card className="overflow-hidden p-0">
      {/* Cabeçalho do card */}
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-semibold tracking-wide">{t("EVOLUÇÃO DE VENDA")}</p>
          <button
            type="button"
            title={t("Acumulado diário de vendas do mês, com previsão de fechamento")}
            aria-label={t("Sobre este indicador")}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <Info size={15} aria-hidden />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <p className="text-xs uppercase text-muted-foreground">{dados.rotuloMes}</p>
          <div className="relative">
            <button
              type="button"
              aria-label={t("Opções do indicador")}
              aria-expanded={menuAberto}
              onClick={() => setMenuAberto((v) => !v)}
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <DotsThree size={16} weight="bold" aria-hidden />
            </button>
            {menuAberto ? (
              <>
                <button
                  type="button"
                  aria-label={t("Fechar opções")}
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setMenuAberto(false)}
                />
                <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border bg-popover p-1 shadow-xl">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={comparar}
                    onClick={() => {
                      onCompararChange(!comparar);
                      setMenuAberto(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <span
                      aria-hidden
                      className={`grid size-4 place-items-center rounded-md border text-[10px] ${comparar ? "border-transparent bg-foreground text-background" : "border-border"}`}
                    >
                      {comparar ? "✓" : ""}
                    </span>
                    {t("Comparar com mês anterior e ano passado")}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <hr className="border-border" />

      {/* Corpo: gráfico + lateral */}
      <div className="grid gap-0 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0 p-4">
          {vazio ? (
            <div className="grid h-64 place-items-center text-sm text-muted-foreground">
              {t("Sem vendas neste mês ainda.")}
            </div>
          ) : (
            <div
              role="slider"
              tabIndex={0}
              aria-label={t("Evolução de vendas por dia")}
              aria-valuemin={1}
              aria-valuemax={diasNoMes}
              aria-valuenow={diaAtivo ?? hojeNum}
              onKeyDown={(e) => {
                if (e.key === "Escape") setDiaAtivo(null);
                else if (e.key === "ArrowLeft") setDiaAtivo((d) => Math.max(1, (d ?? hojeNum) - 1));
                else if (e.key === "ArrowRight")
                  setDiaAtivo((d) => Math.min(diasNoMes, (d ?? hojeNum) + 1));
              }}
              className="relative rounded-xl outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                className="block h-auto w-full"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDiaAtivo(diaDoPixel(e.clientX - rect.left, rect.width, diasNoMes));
                }}
                onMouseLeave={() => setDiaAtivo(null)}
              >
                <defs>
                  <linearGradient id="ev-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={VERDE} stopOpacity={0.14} />
                    <stop offset="1" stopColor={VERDE} stopOpacity={0} />
                  </linearGradient>
                </defs>

                {/* Grade horizontal + eixo de valores */}
                {gradeY.map((v) => (
                  <g key={v}>
                    <line x1={PL} y1={y(v)} x2={PL + PW} y2={y(v)} stroke="var(--border)" strokeWidth={1} opacity={0.7} />
                    <text
                      x={PL - 8}
                      y={y(v) + 4}
                      textAnchor="end"
                      fontSize={11}
                      fill="var(--muted-foreground)"
                      className="font-mono tabular-nums"
                    >
                      {v === 0 ? "0" : v.toLocaleString("pt-BR")}
                    </text>
                  </g>
                ))}

                {/* Área + linha do acumulado */}
                <motion.path
                  d={`${linha(historico)} L${x(historico[historico.length - 1]?.dia ?? 1).toFixed(1)},${y(0).toFixed(1)} L${x(1).toFixed(1)},${y(0).toFixed(1)} Z`}
                  fill="url(#ev-area)"
                  initial={{ opacity: reduce ? 1 : 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, ease: EASE_OUT }}
                />
                <motion.path
                  d={linha(historico)}
                  fill="none"
                  stroke={VERDE}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  initial={{ pathLength: reduce ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.9, ease: EASE_OUT }}
                />
                {historico.map((p, i) => (
                  <motion.circle
                    key={p.dia}
                    cx={x(p.dia)}
                    cy={y(p.reais)}
                    r={diaAtivo === p.dia ? 5 : 3.5}
                    fill={VERDE}
                    initial={{ opacity: reduce ? 1 : 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: reduce ? 0 : Math.min(0.6, i * 0.02) }}
                  />
                ))}

                {/* Comparativos */}
                {comparar && mesAnoPts.length > 1 ? (
                  <path d={linha(mesAnoPts)} fill="none" stroke={CINZA_CLARO} strokeWidth={1.5} strokeDasharray="2 3" />
                ) : null}
                {comparar && mesAntPts.length > 1 ? (
                  <path d={linha(mesAntPts)} fill="none" stroke={CINZA} strokeWidth={1.5} strokeDasharray="6 3" />
                ) : null}

                {/* Objetivo */}
                {objetivoVis && objetivo.length > 1 ? (
                  <path d={linha(objetivo)} fill="none" stroke={ROXO} strokeWidth={1.5} />
                ) : null}

                {/* Previsão */}
                {previsaoVis && previsao.length > 1 ? (
                  <motion.path
                    d={linha(previsao)}
                    fill="none"
                    stroke={AMARELO}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                    initial={{ pathLength: reduce ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.7, ease: EASE_OUT, delay: reduce ? 0 : 0.4 }}
                  />
                ) : null}

                {/* Linha do hoje */}
                <line
                  x1={x(hojeNum)}
                  y1={PT}
                  x2={x(hojeNum)}
                  y2={PT + PH}
                  stroke="var(--foreground)"
                  strokeWidth={1}
                  opacity={0.25}
                />

                {/* Crosshair */}
                {diaAtivo != null ? (
                  <line
                    x1={x(diaAtivo)}
                    y1={PT}
                    x2={x(diaAtivo)}
                    y2={PT + PH}
                    stroke="var(--foreground)"
                    strokeWidth={1}
                    opacity={0.4}
                  />
                ) : null}

                {/* Eixo dos dias */}
                {Array.from({ length: diasNoMes }, (_, i) => i + 1).map((d) => {
                  const fimDeSemana = [0, 6].includes(new Date(ano, mesNum - 1, d).getDay());
                  return (
                    <g key={d}>
                      <text
                        x={x(d)}
                        y={PT + PH + 18}
                        textAnchor="middle"
                        fontSize={11}
                        fill="var(--muted-foreground)"
                        className="font-mono tabular-nums"
                      >
                        {d}
                      </text>
                      <text
                        x={x(d)}
                        y={PT + PH + 32}
                        textAnchor="middle"
                        fontSize={11}
                        fill="var(--muted-foreground)"
                        opacity={fimDeSemana ? 0.45 : 0.8}
                        className="font-mono"
                      >
                        {LETRAS_DIA[new Date(ano, mesNum - 1, d).getDay()]}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Cartão flutuante */}
              {diaAtivo != null && ativo ? (
                <div
                  className="pointer-events-none absolute z-10 w-56 rounded-lg border p-2.5 text-xs shadow-xl"
                  style={{
                    left: `min(78%, max(22%, ${(x(diaAtivo) / VB_W) * 100}%))`,
                    top: `${(y(Math.max(ativo.vendaAc, ativo.projecao ?? 0) / 100) / VB_H) * 100}%`,
                    transform: "translate(-50%, calc(-100% - 12px))",
                    background: "rgb(11 11 13 / 0.94)",
                    borderColor: "rgb(255 255 255 / 0.1)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <p className="font-semibold text-foreground">
                    {t("Dia")} {diaAtivo}:
                  </p>
                  {!futuro ? (
                    <div className="mt-1 space-y-0.5">
                      <p className="flex justify-between gap-2 text-muted-foreground">
                        <span>{t("Vendido no dia")}:</span>
                        <span className="font-mono tabular-nums text-foreground">{brl(ativo.vendas)}</span>
                      </p>
                      <p className="flex justify-between gap-2 font-medium" style={{ color: VERDE }}>
                        <span>{t("Vendas no mês")}:</span>
                        <span className="font-mono tabular-nums">{brl(ativo.vendaAc)}</span>
                      </p>
                      {ativo.metaAc != null && ativo.metaAc > 0 ? (
                        <p className="flex justify-between gap-2" style={{ color: ROXO }}>
                          <span>{t("Objetivo")}:</span>
                          <span className="font-mono tabular-nums">{brl(ativo.metaAc)}</span>
                        </p>
                      ) : null}
                      {comparar && ativo.mesAnt != null && ativo.mesAnt > 0 ? (
                        <p className="flex justify-between gap-2 text-muted-foreground">
                          <span>{t("Mês passado")}:</span>
                          <span className="font-mono tabular-nums">{brl(ativo.mesAnt)}</span>
                        </p>
                      ) : null}
                      {comparar && ativo.mesAno != null && ativo.mesAno > 0 ? (
                        <p className="flex justify-between gap-2 text-muted-foreground">
                          <span>{t("Ano passado")}:</span>
                          <span className="font-mono tabular-nums">{brl(ativo.mesAno)}</span>
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 flex justify-between gap-2 font-medium" style={{ color: AMARELO }}>
                      <span>{t("Previsão de vendas")}:</span>
                      <span className="font-mono tabular-nums">
                        {ativo.projecao != null && ativo.projecao > 0 ? brl(ativo.projecao) : "—"}
                      </span>
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Legenda */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
            {legenda.map((item) =>
              item.acao ? (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.acao}
                  aria-pressed={!item.apagado}
                  className={`inline-flex items-center gap-1.5 rounded-md transition-opacity ${item.apagado ? "opacity-40" : "opacity-100"}`}
                >
                  {item.tracejado ? (
                    <span
                      aria-hidden
                      className="inline-block h-0 w-4"
                      style={{ borderTop: `2px dashed ${item.cor}` }}
                    />
                  ) : (
                    <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: item.cor }} />
                  )}
                  <span className="text-muted-foreground">{item.rotulo}</span>
                </button>
              ) : (
                <span key={item.id} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: item.cor }} />
                  <span className="text-muted-foreground">{item.rotulo}</span>
                </span>
              ),
            )}
          </div>
        </div>

        {/* Lateral */}
        <div className="space-y-5 border-t p-4 lg:border-l lg:border-t-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase text-muted-foreground">{t("Vendido no mês")}</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums">{brl(dados.vendidoMes)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("Hoje")} {brl(dados.vendidoHoje)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onCompararChange(!comparar)}
              aria-pressed={comparar}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${comparar ? "border-transparent bg-foreground text-background" : "border-border text-foreground hover:bg-muted"}`}
            >
              <Sparkle size={14} weight="fill" aria-hidden />
              {t("Comparar")}
            </button>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase text-muted-foreground">{t("Objetivo do mês")}</p>
              <Link href="/app/relatorios" className="text-xs underline underline-offset-4">
                {t("Definir metas")}
              </Link>
            </div>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">{brl(dados.objetivo ?? 0)}</p>
            <div className="mt-1.5">
              <Barra pct={dados.pctObjetivo} cor="bg-violet-500" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {dados.pctObjetivo != null ? `${dados.pctObjetivo.toFixed(1)}%` : "%"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">{t("Necessário vender")}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">
              {dados.necessarioDia != null
                ? `${brl(Math.round(dados.necessarioDia))} ${t("por dia útil")}`
                : t("R$ por dia útil")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {dados.necessarioDia != null
                ? `${dados.diasUteisRestantes} ${t("dias úteis restantes")}`
                : t("Nenhuma meta definida")}
            </p>
          </div>
        </div>
      </div>

      <hr className="border-border" />

      {/* Rodapé */}
      <div className="flex items-center justify-center gap-1.5 py-2.5">
        <ChartBar size={16} aria-hidden className="text-muted-foreground" />
        <Link href="/app/pedidos" className="text-sm underline underline-offset-4">
          {t("Detalhar por vendedor")}
        </Link>
      </div>
    </Card>
  );
}
