"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { EASE_OUT } from "@/lib/ease";
import { comoMoeda } from "@/lib/format/moeda";
import { useT } from "@/hooks/i18n/useT";
import {
  PriceTargetFan,
  PriceTargetFanCursor,
  PriceTargetFanNow,
  PriceTargetFanPlot,
  PriceTargetFanSvg,
  usePriceTargetFan,
} from "@/components/charts/price-target-fan";
import { H, PAD, W } from "@/components/charts/price-target-fan/utils";
import type { DadosIndicadores } from "@/app/app/indicadores/_indicadores";

function brl(cents: number): string {
  return comoMoeda(cents, "BRL");
}

/** BRL compacto para rótulos do gráfico: 10154000c → "R$ 101,5k". */
function brlCurto(cents: number): string {
  const reais = cents / 100;
  if (Math.abs(reais) >= 1000) {
    return `R$ ${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  }
  return brl(cents);
}

const VERDE = "#22c55e";
const ROXO = "#8b5cf6";
const AMARELO = "#eab308";
const CINZA = "#94a3b8";
const CINZA_CLARO = "#cbd5e1";

const LETRAS_DIA = ["D", "S", "T", "Q", "Q", "S", "S"];

interface PontoFan {
  iso: string;
  dia: number;
  vendasDia: number;
  vendaAc: number;
}

interface AlvoFan {
  key: string;
  price: number;
  color: string;
  dica: string;
}

function montarFan(dados: DadosIndicadores, comparar: boolean): {
  history: { date: string; price: number }[];
  current: number;
  targets: [AlvoFan, AlvoFan, AlvoFan];
  dias: Map<string, PontoFan>;
  daysInMonth: number;
  ano: number;
  mesNum: number;
} | null {
  const [ano, mesNum] = dados.mes.split("-").map(Number);
  if (!ano || !mesNum) return null;
  const daysInMonth = new Date(ano, mesNum, 0).getDate();
  const agora = new Date();
  const ehMesAtual = ano === agora.getFullYear() && mesNum === agora.getMonth() + 1;
  const ultimoDia = ehMesAtual ? agora.getDate() : daysInMonth;
  const iso = (d: number) => `${dados.mes}-${String(d).padStart(2, "0")}`;

  const pontos: PontoFan[] = [];
  for (const s of dados.serie) {
    if (s.dia < 1 || s.dia > ultimoDia || s.vendaAc <= 0) continue;
    pontos.push({ iso: iso(s.dia), dia: s.dia, vendasDia: s.vendas, vendaAc: s.vendaAc });
  }
  if (pontos.length === 0) return null;

  const history = pontos.map((p) => ({ date: p.iso, price: p.vendaAc / 100 }));
  const current = history[history.length - 1]?.price ?? 0;
  if (!(current > 0)) return null;
  if (!(dados.previsaoMes > 0)) return null;

  let fimMesAnt: number | null = null;
  for (const s of dados.serie) {
    if (s.mesAnt != null && s.mesAnt > 0) fimMesAnt = s.mesAnt;
  }
  // Sem modo Comparar, o terceiro alvo vira um ponto sobre o hoje (em vez de
  // esticar a escala com o fechamento do mês passado). Sem meta, o Objetivo
  // também ancora no hoje — nunca espelha a Previsão (duplicava a curva).
  const mesAntCents = comparar ? (fimMesAnt ?? current * 100) : current * 100;
  const objetivoCents = dados.objetivo ?? current * 100;

  const targets: [AlvoFan, AlvoFan, AlvoFan] = [
    { key: "Previsão", price: dados.previsaoMes / 100, color: AMARELO, dica: "Previsão de fechamento" },
    {
      key: "Objetivo",
      price: objetivoCents / 100,
      color: ROXO,
      dica: dados.objetivo != null ? "Meta do mês" : "Sem meta definida",
    },
    { key: "Mês anterior", price: mesAntCents / 100, color: CINZA, dica: "Fechamento do mês anterior" },
  ];
  if (targets.some((t) => !(t.price > 0))) return null;

  return {
    history,
    current,
    targets,
    dias: new Map(pontos.map((p) => [p.iso, p])),
    daysInMonth,
    ano,
    mesNum,
  };
}

/** Decide se o fan consegue desenhar este mês (exige acumulado positivo). */
export function usarFanEvolucao(dados: DadosIndicadores, comparar = false): boolean {
  return montarFan(dados, comparar) !== null;
}

/** Grade horizontal + eixo de valores no estilo do fan, com BRL compacto. */
function EvolucaoGrade({
  comparar,
  serie,
  diasNoHistorico,
}: {
  comparar: boolean;
  serie: DadosIndicadores["serie"];
  diasNoHistorico: number[];
}) {
  const { gridVals, y, geo } = usePriceTargetFan();
  const linhas = useMemo(() => {
    // hx() indexa o HISTÓRICO (só dias com acumulado); a série tem todos os
    // dias — sem o mapa, dia 24+ cairia em índice inexistente e virava NaN.
    const indice = new Map(diasNoHistorico.map((dia, i) => [dia, i]));
    const monta = (chave: "mesAnt" | "mesAno") => {
      const pts: string[] = [];
      for (const s of serie) {
        const v = s[chave];
        const i = indice.get(s.dia);
        if (v == null || v <= 0 || i === undefined) continue;
        const x = geo.hx(i);
        const yy = y(v / 100);
        pts.push(`${pts.length === 0 ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)}`);
      }
      return pts.join(" ");
    };
    return { mesAnt: monta("mesAnt"), mesAno: monta("mesAno") };
    // geo/y mudam com os dados; série é estável por render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparar, serie]);
  return (
    <g>
      {gridVals.out.map((v) => (
        <g key={v}>
          <line x1={PAD.l} y1={y(v)} x2={geo.endX} y2={y(v)} stroke="var(--border)" strokeDasharray="2 5" />
          <text
            x={PAD.l - 8}
            y={y(v) + 3}
            textAnchor="end"
            fontSize={9}
            fill="var(--muted-foreground)"
            className="font-mono tabular-nums"
          >
            {`${Math.round(v / 1000)}k`}
          </text>
        </g>
      ))}
      {comparar && linhas.mesAno ? (
        <path d={linhas.mesAno} fill="none" stroke={CINZA_CLARO} strokeWidth={1.4} strokeDasharray="2 3" />
      ) : null}
      {comparar && linhas.mesAnt ? (
        <path d={linhas.mesAnt} fill="none" stroke={CINZA} strokeWidth={1.4} strokeDasharray="6 3" />
      ) : null}
    </g>
  );
}

/**
 * Histórico acumulado em verde (identidade do Mercos) com o draw-in do fan.
 * Cópia de `PriceTargetFanHistory` trocando só o stroke.
 */
function EvolucaoHistorico() {
  const { hist, history, scrub, setScrub, setActive, tooltipId, geo, reduce, drawn } =
    usePriceTargetFan();
  const ultimo = hist.length - 1;
  return (
    <g>
      {hist.length ? (
        <g
          role="slider"
          tabIndex={0}
          aria-label="Vendas acumuladas no mês"
          aria-valuemin={0}
          aria-valuemax={ultimo}
          aria-valuenow={scrub ?? ultimo}
          aria-valuetext={`Dia ${history[scrub ?? ultimo]?.date}: ${history[scrub ?? ultimo]?.price}`}
          aria-describedby={scrub !== null ? tooltipId : undefined}
          onFocus={() => setScrub(ultimo)}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => {
            const index = scrub ?? ultimo;
            if (event.key === "Escape") {
              event.preventDefault();
              setActive(null);
            } else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              setScrub(
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? ultimo
                    : Math.max(0, Math.min(ultimo, index + (event.key === "ArrowRight" ? 1 : -1))),
              );
            }
          }}
        >
          <motion.path
            d={geo.line}
            fill="none"
            stroke={VERDE}
            strokeWidth={1.8}
            strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={drawn ?? { duration: 0.9, ease: EASE_OUT }}
          />
        </g>
      ) : null}
    </g>
  );
}

/**
 * Leque de projeções com rótulos em BRL compacto.
 * Cópia de `PriceTargetFanTargets` trocando só o texto do rótulo.
 */
function EvolucaoAlvos() {
  const { geo, hotT, setHotT, setActive, tooltipId, clipId, reduce, drawn } = usePriceTargetFan();
  // Rótulos com respiro mínimo: alvos próximos (ex. sem meta) empilham em vez
  // de colar um sobre o outro. O ponto continua no valor exato.
  const rotuloY = useMemo(() => {
    const ordem = geo.proj.map((p, i) => [p.ty, i] as const).sort((a, b) => a[0] - b[0]);
    const colocado: number[] = new Array(geo.proj.length).fill(0);
    let anterior = Number.NEGATIVE_INFINITY;
    for (const [yy, i] of ordem) {
      const final = Math.max(yy, anterior + 14);
      colocado[i] = final;
      anterior = final;
    }
    return colocado;
  }, [geo]);
  return (
    <g>
      <g clipPath={`url(#${clipId})`}>
        {geo.proj.map((p, i) => {
          const on = hotT === i;
          const dim = hotT !== null && !on;
          return (
            <motion.g
              key={p.key}
              role="button"
              tabIndex={0}
              aria-label={`${p.key} ${brl(Math.round(p.price * 100))}`}
              className="outline-hidden"
              aria-pressed={on}
              aria-describedby={on ? tooltipId : undefined}
              initial={{ opacity: 1 }}
              animate={{ opacity: dim ? 0.3 : 1 }}
              transition={drawn ?? { duration: 0.25, ease: EASE_OUT }}
              onFocus={() => setHotT(i)}
              onBlur={() => setHotT(null)}
              onPointerDown={(e) => {
                if (e.pointerType === "touch") {
                  e.preventDefault();
                  setHotT(on ? null : i);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setActive(null);
                }
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setHotT(on ? null : i);
                }
              }}
            >
              <path d={p.d} fill="none" stroke="transparent" strokeWidth={16} />
              <path
                d={p.d}
                fill="none"
                stroke={p.color}
                strokeWidth={on ? 2.2 : 1.4}
                strokeOpacity={on ? 1 : 0.75}
                strokeDasharray="2 4"
                strokeLinecap="round"
              />
              {on && (
                <motion.path
                  d={p.d}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  initial={{ pathLength: reduce ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={drawn ?? { duration: 0.35, ease: EASE_OUT }}
                />
              )}
              <motion.circle
                cx={geo.endX}
                cy={p.ty}
                fill="var(--background)"
                stroke={p.color}
                strokeWidth={1.6}
                r={3.2}
                animate={{ r: on ? 4.5 : 3.2 }}
                transition={drawn ?? { duration: 0.25, ease: EASE_OUT }}
              />
              <text
                x={geo.endX + 10}
                y={(rotuloY[i] ?? p.ty) + 4}
                fontSize={10}
                fontWeight={600}
                fill={p.color}
                className="font-mono tabular-nums"
              >
                {brlCurto(Math.round(p.price * 100))}
              </text>
            </motion.g>
          );
        })}
      </g>
    </g>
  );
}

/** Eixo de dias 1..31 com a letra do dia da semana, como no Mercos. */
function EvolucaoEixoDias({
  daysInMonth,
  ano,
  mesNum,
  diasNoHistorico,
}: {
  daysInMonth: number;
  ano: number;
  mesNum: number;
  diasNoHistorico: number[];
}) {
  const { geo, fadeId } = usePriceTargetFan();
  const porDia = new Map(diasNoHistorico.map((dia, i) => [dia, i]));
  const xParaDia = (dia: number) => {
    const i = porDia.get(dia);
    if (i !== undefined) return geo.hx(i);
    const ultimo = diasNoHistorico[diasNoHistorico.length - 1] ?? 1;
    if (dia <= ultimo) return PAD.l;
    const fracao = (dia - ultimo) / Math.max(1, daysInMonth - ultimo);
    return geo.nowX + (geo.endX - geo.nowX) * fracao;
  };
  const dias: number[] = [];
  // Eixo respirável: ~12 rótulos em vez de 31 colados. Dia 1, hoje e o último
  // dia sempre aparecem; o hoje vai em destaque.
  const passo = Math.max(1, Math.ceil(daysInMonth / 12));
  const marcados = new Set<number>();
  for (let d = 1; d <= daysInMonth; d += passo) marcados.add(d);
  const hoje = diasNoHistorico[diasNoHistorico.length - 1] ?? 1;
  marcados.add(hoje);
  marcados.add(daysInMonth);
  for (let d = 1; d <= daysInMonth; d++) dias.push(d);
  const visivel = (d: number) => marcados.has(d);
  return (
    <g>
      <line
        x1={geo.nowX}
        y1={PAD.t}
        x2={geo.nowX}
        y2={H - PAD.b}
        stroke={`url(#${fadeId})`}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      {dias.map((d) =>
        visivel(d) ? (
          <g key={d}>
            <text
              x={xParaDia(d)}
              y={H - 16}
              textAnchor="middle"
              fontSize={d === hoje ? 9 : 8}
              fontWeight={d === hoje ? 700 : 400}
              fill={d === hoje ? "var(--foreground)" : "var(--muted-foreground)"}
              className="font-mono tabular-nums"
            >
              {d}
            </text>
            <text
              x={xParaDia(d)}
              y={H - 6}
              textAnchor="middle"
              fontSize={8}
              fill="var(--muted-foreground)"
              opacity={0.55}
              className="font-mono"
            >
              {LETRAS_DIA[new Date(ano, mesNum - 1, d).getDay()]}
            </text>
          </g>
        ) : null,
      )}
    </g>
  );
}

/** Cartão do Mercos ("Dia 15 / Vendido no dia / Vendas no mês") no vidro do fan. */
function EvolucaoTooltip({
  dias,
  alvos,
}: {
  dias: Map<string, PontoFan>;
  alvos: AlvoFan[];
}) {
  const { scrub, hotT, geo, y, hist, history } = usePriceTargetFan();
  if (hotT !== null) {
    const p = geo.proj[hotT];
    if (!p) return null;
    const alvo = alvos[hotT];
    const esquerda = ((geo.endX / W) * 100).toFixed(2);
    const topo = ((p.ty / H) * 100).toFixed(2);
    return (
      <div
        className="pointer-events-none absolute z-10 w-44 -translate-x-1/2 rounded-lg border p-2.5 text-xs shadow-xl"
        style={{
          left: `min(86%, max(14%, ${esquerda}%))`,
          top: topo,
          transform: "translate(-50%, calc(-100% - 12px))",
          background: "rgb(11 11 13 / 0.92)",
          borderColor: "rgb(255 255 255 / 0.1)",
          backdropFilter: "blur(12px)",
        }}
      >
        <p className="font-semibold text-foreground">{p.key}</p>
        <p className="mt-0.5 font-mono tabular-nums text-foreground">{brl(Math.round(p.price * 100))}</p>
        {alvo ? <p className="mt-0.5 text-muted-foreground">{alvo.dica}</p> : null}
      </div>
    );
  }
  if (scrub === null) return null;
  const ponto = dias.get(history[scrub]?.date ?? "");
  if (!ponto) return null;
  const esquerda = ((geo.hx(scrub) / W) * 100).toFixed(2);
  const topo = ((y(hist[scrub] ?? 0) / H) * 100).toFixed(2);
  return (
    <div
      className="pointer-events-none absolute z-10 w-52 rounded-lg border p-2.5 text-xs shadow-xl"
      style={{
        left: `min(80%, max(20%, ${esquerda}%))`,
        top: topo,
        transform: "translate(-50%, calc(-100% - 12px))",
        background: "rgb(11 11 13 / 0.92)",
        borderColor: "rgb(255 255 255 / 0.1)",
        backdropFilter: "blur(12px)",
      }}
    >
      <p className="font-semibold text-foreground">Dia {ponto.dia}:</p>
      <p className="mt-1 text-muted-foreground">
        Vendido no dia: <span className="font-mono tabular-nums text-foreground">{brl(ponto.vendasDia)}</span>
      </p>
      <p className="mt-0.5 font-medium" style={{ color: VERDE }}>
        Vendas no mês: <span className="font-mono tabular-nums">{brl(ponto.vendaAc)}</span>
      </p>
    </div>
  );
}

function Legenda({ temObjetivo, temProjecao, comparar }: { temObjetivo: boolean; temProjecao: boolean; comparar: boolean }) {
  const t = useT();
  const itens: { cor: string; tracejado?: boolean; rotulo: string }[] = [
    { cor: VERDE, rotulo: t("Vendas no mês") },
  ];
  if (temObjetivo) itens.push({ cor: ROXO, tracejado: true, rotulo: t("Objetivo") });
  if (temProjecao) itens.push({ cor: AMARELO, tracejado: true, rotulo: t("Previsão de vendas") });
  if (comparar) {
    itens.push({ cor: CINZA, tracejado: true, rotulo: t("Mês passado") });
    itens.push({ cor: CINZA_CLARO, tracejado: true, rotulo: t("Ano passado") });
  }
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {itens.map((item) => (
        <span key={item.rotulo} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0 w-6 rounded-full"
            style={{
              borderTop: `2px ${item.tracejado ? "dashed" : "solid"} ${item.cor}`,
            }}
          />
          {item.rotulo}
        </span>
      ))}
    </div>
  );
}

export function EvolucaoVendasFan({
  dados,
  comparar,
}: {
  dados: DadosIndicadores;
  comparar: boolean;
}) {
  const fan = useMemo(() => montarFan(dados, comparar), [dados, comparar]);
  const diasNoHistorico = useMemo(
    () => (fan ? fan.history.map((p) => Number(p.date.slice(-2))) : []),
    [fan],
  );
  if (!fan) return null;
  const temObjetivo = dados.serie.some((s) => s.metaAc != null);
  const temProjecao = dados.serie.some((s) => s.projecao != null);
  return (
    <div>
      <PriceTargetFan
        current={fan.current}
        history={fan.history}
        targets={fan.targets.map((t) => ({ key: t.key, price: t.price, analysts: 0, color: t.color })) as [
          { key: string; price: number; analysts: number; color: string },
          { key: string; price: number; analysts: number; color: string },
          { key: string; price: number; analysts: number; color: string },
        ]}
        label="Evolução de venda"
        className="w-full [--ink-l:0.5] dark:[--ink-l:1]"
      >
        <PriceTargetFanPlot>
          <PriceTargetFanSvg>
            <EvolucaoGrade comparar={comparar} serie={dados.serie} diasNoHistorico={diasNoHistorico} />
            <EvolucaoHistorico />
            <EvolucaoAlvos />
            <PriceTargetFanNow />
            <EvolucaoEixoDias
              daysInMonth={fan.daysInMonth}
              ano={fan.ano}
              mesNum={fan.mesNum}
              diasNoHistorico={diasNoHistorico}
            />
            <PriceTargetFanCursor />
          </PriceTargetFanSvg>
          <EvolucaoTooltip dias={fan.dias} alvos={fan.targets} />
        </PriceTargetFanPlot>
      </PriceTargetFan>
      <Legenda temObjetivo={temObjetivo} temProjecao={temProjecao} comparar={comparar} />
    </div>
  );
}
