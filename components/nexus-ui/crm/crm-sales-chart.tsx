"use client";

/*!
 * UImaxxing™ — © 2026 Yogi Suria. All rights reserved.
 * Free to use, modify and ship in your own products, commercial ones
 * included. Not for republication as a component library, and not as
 * machine-learning training data. See LICENSE.
 * @author Yogi Suria <yogi@jumper.xyz>
 * @license SEE LICENSE IN LICENSE
 * @preserve
 * provenance-mark: uim1-1ea983e5.44807c29
 */
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { toArea } from "@/lib/series";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { CaretLeft, CaretRight, ChartLineUp, Clock, Flag, Info, Wallet } from "@/lib/ui/icons";
import { deslocarMes } from "@/lib/comercial/visao-do-mes";

export interface CrmSalesPoint {
  dia: number;
  vendidoAc: number;
  metaAc: number | null;
  projecao: number | null;
  /** Só o Indicadores preenche (comparação com mês anterior/ano passado). */
  mesAnt?: number | null;
  mesAno?: number | null;
}

/**
 * ADAPT do `rates-chart` (UImaxxing Registry) — seção "Evolução de Vendas"
 * no molde da referência do produto: coluna de KPIs (Meta/Projeção/Previsão
 * com régua e badge), gráfico com eixos, área, marcador de HOJE e projeção
 * tracejada só DEPOIS de hoje, e painel de resumo do mês à direita.
 *
 * Medições que travam o desenho:
 * - `projecao` só existe dos dias futuros (`montarGradeDoMes` devolve null
 *   até hoje) — a linha tracejada nasce exatamente onde a realizada termina;
 * - `metaAc` é tudo-ou-nada (null só quando a loja não tem meta) — sem
 *   fallback para a linha realizada (o card antigo DESENHAVA a meta por cima
 *   do realizado quando meta era null, mentindo a comparação);
 * - a régua de % dos KPIs é a META. Sem meta não existe % para mostrar — a
 *   referência tinha meta R$0 com barras cheias (mock); aqui nada é
 *   inventado: sem meta = barra vazia e "—".
 * - faixas: 1D/1W/1M/Tudo recortam a série REAL (renormalizando o teto).
 *   3M/1A da referência exigiriam série multimes — seletor não é decorativo,
 *   então não existem aqui.
 * - SELETOR DE MÊS: navega por `?mes=AAAA-MM`. Quem NÃO passa `onNavegarMes`
 *   (os Indicadores) continua com o `router.push` de antes — mês e vendedor
 *   mudam agregados, ranking e KPIs que o servidor monta, então ali a navegação
 *   RSC é a fonte. Quem PASSA (a home) gerencia o mês em `useState` e busca em
 *   `GET /api/v1/home/mes`; a URL é atualizada por `history.replaceState`
 *   (`lib/navigation/shallow.ts`), sem refetch do RSC — em produção o clique
 *   antigo custava ~2s (auditoria de 2026-09-30). Nos dois casos o parâmetro
 *   atual é preservado (`vendedor`/`filtro` sobrevivem), o próximo fica travado
 *   no mês corrente da organização (mês futuro = série vazia) e voltar ao mês
 *   corrente apaga o parâmetro, deixando a URL limpa. `ehMesAtual` existe porque
 *   a grade passada chega inteira: sem a trava, o marcador de HOJE e a linha
 *   "Hoje R$ 0" pintariam o último dia do mês de agosto como se fosse hoje.
 *   `carregando` trava as setas enquanto o fetch do mês novo voa.
 * - TOOLTIP: hover por coluna (retângulo invisível por dia) ancora o balão no
 *   ponto e desce a árvore do dia — realizado, acumulado, meta do dia,
 *   projeção (só depois de hoje) e as comparações enquanto o COMPARAR estiver
 *   ligado. Teclado não navega o gráfico de propósito: o svg é `aria-hidden`
 *   e os números que ele conta estão nos KPIs ao lado, em texto selecionável.
 * - o rótulo do mês segue quem lê: `useTagDeIdioma()` (o guarda i18n reprova
 *   "pt-BR" fixo fora da camada de data).
 */
const RANGES = ["1D", "1W", "1M", "Tudo"] as const;
type Range = (typeof RANGES)[number];
const ACTIVE_RANGE: Range = "1M";

const PLOT_W = 680;
const PLOT_H = 262;
const M = { top: 14, right: 10, bottom: 40, left: 54 };
const IW = PLOT_W - M.left - M.right;
const IH = PLOT_H - M.top - M.bottom;

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function janela(n: number, range: Range): number {
  if (range === "Tudo") return n;
  const dias = { "1D": 1, "1W": 7, "1M": 30 }[range];
  return Math.max(1, Math.min(n, dias));
}

/** Teto "bonito" (1/2/2,5/5 × 10^n) para 0..teto em passos legíveis. */
function tetoEpassos(picoReais: number): { teto: number; passos: number[] } {
  const bruto = Math.max(picoReais, 1) / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= bruto) ?? mag * 10;
  const teto = Math.max(passo, Math.ceil(picoReais / passo) * passo);
  const passos: number[] = [];
  for (let v = 0; v <= teto + passo / 2; v += passo) passos.push(Math.round(v * 100) / 100);
  return { teto, passos };
}

const fmtBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const fmtNum = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

function rotuloDoMes(mes: string, tag: string): string {
  const [ano = "", mm = ""] = mes.split("-");
  const d = new Date(Date.UTC(Number(ano) || 2026, (Number(mm) || 1) - 1, 15));
  return d.toLocaleDateString(tag, { month: "long", year: "numeric", timeZone: "UTC" });
}

function letraDoDia(mes: string, dia: number): string {
  const [ano = "", mm = ""] = mes.split("-");
  return DIAS_SEMANA[new Date(Date.UTC(Number(ano) || 2026, (Number(mm) || 1) - 1, dia)).getUTCDay()] ?? "";
}

function diaExtenso(mes: string, dia: number, tag: string): string {
  const [ano = "", mm = ""] = mes.split("-");
  return new Date(Date.UTC(Number(ano) || 2026, (Number(mm) || 1) - 1, dia)).toLocaleDateString(tag, {
    weekday: "long",
    timeZone: "UTC",
  });
}

interface PropsKpi {
  label: string;
  valor: number;
  pct: number | null;
  cor: string;
  bgCor: string;
  Icone: typeof Wallet;
  info?: boolean;
}

function CartaoKpi({ label, valor, pct, cor, bgCor, Icone, info }: PropsKpi) {
  const largura = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  const sobe = (pct ?? 0) >= 100;
  return (
    <div className="rounded-xl border border-border fill-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", bgCor, cor)}>
            <Icone size={13} />
          </span>
          <span className="truncate text-xs text-fg-muted">{label}</span>
          {info ? <Info size={11} className="shrink-0 text-fg-muted" weight="bold" /> : null}
        </div>
        {pct != null ? (
          <span
            className={cn(
              "shrink-0 text-[10px] font-medium tabular-nums",
              sobe ? "text-[#34d399]" : "text-[#f87171]",
            )}
          >
            {sobe ? "↑" : "↓"} {Math.round(pct)}%
          </span>
        ) : null}
      </div>
      <div className="mt-2.5 truncate text-2xl font-semibold leading-none tabular-nums text-fg xl:text-3xl">
        {fmtBRL.format(valor / 100)}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className={cn("h-full rounded-full", cor.replace("text-", "bg-"))} style={{ width: `${largura}%` }} />
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-fg-muted">
          {pct == null ? "—" : `${Math.round(pct)}%`}
        </span>
      </div>
    </div>
  );
}

function Legenda({
  cor,
  rotulo,
  tracejado,
  ausente,
}: {
  cor: string;
  rotulo: string;
  tracejado?: boolean;
  ausente?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", ausente && "opacity-40")}>
      {tracejado ? (
        <span className={cn("h-0 w-4 border-t-2 border-dashed", cor)} />
      ) : (
        <span className={cn("size-1.5 rounded-full", cor)} />
      )}
      <span className="text-[11px] text-fg-secondary">{rotulo}</span>
    </div>
  );
}

export function CrmSalesChart({
  pontos,
  metaAc,
  projecao,
  previsaoMes,
  mes,
  diaHoje,
  vendidoMes,
  vendidoHoje,
  objetivo,
  pctObjetivo,
  necessarioDia,
  diasUteisRestantes,
  comparar,
  ehMesAtual,
  mesAtual,
  onNavegarMes,
  carregando,
}: {
  pontos: CrmSalesPoint[];
  metaAc: number;
  projecao: number;
  previsaoMes: number;
  mes: string;
  diaHoje: number;
  vendidoMes: number;
  vendidoHoje: number;
  objetivo: number | null;
  pctObjetivo: number | null;
  necessarioDia: number | null;
  diasUteisRestantes: number;
  comparar?: { ativo: boolean; onToggle: () => void };
  /** A grade chegou inteira porque o mês já fechou — trava o marcador de hoje. */
  ehMesAtual?: boolean;
  /** Mês corrente da organização — trava o "próximo mês" no futuro. */
  mesAtual?: string;
  /**
   * Quem GERENCIA o mês fora daqui (a home: estado local + fetch leve). Sem
   * esta prop o comportamento é o antigo — `router.push(?mes=)`, navegação
   * RSC, que é o que os Indicadores querem.
   */
  onNavegarMes?: (delta: number) => void;
  /** Busca do mês em andamento — trava as setas para não disparar corrida. */
  carregando?: boolean;
}) {
  const t = useT();
  const tag = useTagDeIdioma();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [range, setRange] = useState<Range>(ACTIVE_RANGE);
  const [hover, setHover] = useState<number | null>(null);
  const n = pontos.length;

  const atual = ehMesAtual !== false;
  const proximoBloqueado = mesAtual != null && deslocarMes(mes, 1) > mesAtual;

  const navegarMes = (delta: number) => {
    if (carregando) return;
    // Modo "casa" (home): o pai busca o agregado e faz o replaceState da URL.
    if (onNavegarMes) {
      onNavegarMes(delta);
      return;
    }
    // Modo navegação (Indicadores): `?mes=` muda agregados que o servidor monta.
    const prox = deslocarMes(mes, delta);
    const qs = new URLSearchParams(params.toString());
    if (mesAtual != null && prox === mesAtual) qs.delete("mes");
    else qs.set("mes", prox);
    const busca = qs.toString();
    router.push(busca ? `${pathname}?${busca}` : pathname);
  };

  const janelaN = janela(n, range);
  const visiveis = janelaN >= n ? pontos : pontos.slice(n - janelaN);

  const pico = useMemo(
    () =>
      visiveis.reduce(
        (m, p) =>
          Math.max(m, p.vendidoAc, p.metaAc ?? 0, p.projecao ?? 0, p.mesAnt ?? 0, p.mesAno ?? 0),
        0,
      ) || 1,
    [visiveis],
  );

  const { teto, passos } = useMemo(() => tetoEpassos(pico / 100), [pico]);
  const tetoCents = Math.max(teto * 100, 1);
  const norm = (v: number): number => Math.max(0, Math.min(1, v / tetoCents));

  const idxHoje = visiveis.findIndex((p) => p.dia === diaHoje);

  const serieVendido = useMemo(() => {
    // A realizada para em HOJE (a referência faz igual); se a janela não
    // alcança hoje (faixas só futuras), desenha o que existe.
    const fim = idxHoje >= 0 ? idxHoje + 1 : visiveis.length;
    return visiveis.slice(0, fim).map((v) => norm(v.vendidoAc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis, tetoCents]);

  const serieMeta = useMemo(
    () => (visiveis.some((v) => v.metaAc != null) ? visiveis.map((v) => norm(v.metaAc ?? 0)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visiveis, tetoCents],
  );

  const serieProjecao = useMemo(() => {
    const bruta = visiveis.map((v) => (v.projecao == null ? null : norm(v.projecao)));
    const primeiro = bruta.findIndex((v) => v != null);
    if (primeiro < 0) return null;
    // Liga a cauda à ponta da realizada (o ponto de HOJE) — senão nasce solta.
    if (primeiro > 0) {
      const anterior = visiveis[primeiro - 1];
      bruta[primeiro - 1] = anterior ? norm(anterior.vendidoAc) : null;
    }
    return bruta;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis, tetoCents]);

  // Só desenha mês/ano passado com o COMPARAR ligado (mesma regra do card
  // antigo): fora dele, a régua cinza por cima da realizada era ruído — a
  // referência mostra essas séries como opcional do painel, não como fundo.
  const serieMesAnt = useMemo(
    () =>
      comparar?.ativo && visiveis.some((v) => v.mesAnt != null)
        ? visiveis.map((v) => norm(v.mesAnt ?? 0))
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visiveis, tetoCents, comparar?.ativo],
  );
  const serieMesAno = useMemo(
    () =>
      comparar?.ativo && visiveis.some((v) => v.mesAno != null)
        ? visiveis.map((v) => norm(v.mesAno ?? 0))
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visiveis, tetoCents, comparar?.ativo],
  );

  /** Série contígua (sem null) → polyline; segmentos separados por null. */
  const polylinesDe = (serie: (number | null)[]): string[] => {
    const saida: string[] = [];
    let atual: string[] = [];
    serie.forEach((v, i) => {
      if (v == null) {
        if (atual.length > 0) saida.push(atual.join(" "));
        atual = [];
        return;
      }
      atual.push(
        `${(i * (IW / Math.max(1, serie.length - 1))).toFixed(1)},${(IH * (1 - v)).toFixed(1)}`,
      );
    });
    if (atual.length > 0) saida.push(atual.join(" "));
    return saida.filter((s) => s.includes(","));
  };

  const linhasVendido = polylinesDe(serieVendido);
  const linhaMeta = serieMeta ? polylinesDe(serieMeta)[0] ?? null : null;
  const linhasProjecao = serieProjecao ? polylinesDe(serieProjecao) : [];
  const linhaMesAnt = serieMesAnt ? polylinesDe(serieMesAnt)[0] ?? null : null;
  const linhaMesAno = serieMesAno ? polylinesDe(serieMesAno)[0] ?? null : null;

  const areaVendido = serieVendido.length > 1 ? toArea(serieVendido, { width: IW, height: IH }) : null;
  const passoX = IW / Math.max(1, visiveis.length - 1);
  const xDoIdx = (i: number): number => i * passoX;
  const xHoje = idxHoje >= 0 ? M.left + xDoIdx(idxHoje) : null;

  const pontoHover = hover != null ? visiveis[hover] : null;
  const deltaDe = (valor: number | null | undefined, anterior: number | null | undefined): number | null =>
    valor == null ? null : valor - (anterior ?? 0);

  // A árvore do dia sob o cursor: o que ELE vendeu (delta do acumulado), o que
  // já acumulou, e o que a linha contínua não conta — a meta daquele dia, a
  // projeção de quem ainda vai vir e as comparações só com o COMPARAR ligado.
  const futuro = idxHoje >= 0 && hover != null && hover > idxHoje;
  const linhasTooltip: { rotulo: string; valor: number | null }[] = [];
  if (pontoHover && hover != null) {
    const anterior = hover > 0 ? visiveis[hover - 1] : null;
    if (!futuro) {
      linhasTooltip.push({ rotulo: t("No dia"), valor: deltaDe(pontoHover.vendidoAc, anterior?.vendidoAc) });
    }
    linhasTooltip.push({ rotulo: t("Acumulado"), valor: pontoHover.vendidoAc });
    if (pontoHover.metaAc != null) {
      linhasTooltip.push({ rotulo: t("Meta do dia"), valor: deltaDe(pontoHover.metaAc, anterior?.metaAc) });
    }
    if (futuro && pontoHover.projecao != null) {
      linhasTooltip.push({
        rotulo: t("Projeção do dia"),
        valor: deltaDe(pontoHover.projecao, anterior?.projecao ?? anterior?.vendidoAc),
      });
    }
    if (comparar?.ativo && pontoHover.mesAnt != null) {
      linhasTooltip.push({ rotulo: t("Mês passado"), valor: deltaDe(pontoHover.mesAnt, anterior?.mesAnt) });
    }
    if (comparar?.ativo && pontoHover.mesAno != null) {
      linhasTooltip.push({ rotulo: t("Ano passado"), valor: deltaDe(pontoHover.mesAno, anterior?.mesAno) });
    }
  }

  const pctMeta = (v: number): number | null =>
    objetivo != null && objetivo > 0 ? (v / objetivo) * 100 : null;
  const pctProjecao = pctMeta(projecao);
  const pctPrevisao = pctMeta(previsaoMes);
  const pctVendido = pctObjetivo;

  return (
    <section className="space-y-4" aria-label={t("Evolução de Vendas")}>
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-violet/15 text-accent-violet">
          <ChartLineUp size={18} />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-none text-fg">{t("Evolução de Vendas")}</h3>
          <p className="mt-1.5 truncate text-xs text-fg-muted">
            {t("Acompanhe o desempenho das suas vendas, com gráficos e métricas em tempo real.")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)_290px]">
        {/* KPIs — a referência: régua da meta e badge de variação. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <CartaoKpi
            label={t("Meta do mês")}
            valor={metaAc}
            pct={pctVendido}
            cor="text-emerald-400"
            bgCor="bg-emerald-400/15"
            Icone={Wallet}
            info
          />
          <CartaoKpi
            label={t("Projeção")}
            valor={projecao}
            pct={pctProjecao}
            cor="text-violet-400"
            bgCor="bg-violet-400/15"
            Icone={ChartLineUp}
            info
          />
          <CartaoKpi
            label={t("Previsão")}
            valor={previsaoMes}
            pct={pctPrevisao}
            cor="text-indigo-400"
            bgCor="bg-indigo-400/15"
            Icone={Flag}
            info
          />
        </div>

        {/* Gráfico */}
        <div className="min-w-0 rounded-xl border border-border fill-well p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5" data-testid="seletor-de-mes">
                <button
                  type="button"
                  aria-label={t("Mês anterior")}
                  title={t("Mês anterior")}
                  onClick={() => navegarMes(-1)}
                  disabled={carregando}
                  className="interactive rounded-sm p-1 text-fg-muted hover:bg-white/[0.06] hover:text-fg disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <CaretLeft size={12} weight="bold" />
                </button>
                <span
                  className="min-w-[7.5rem] text-center text-[11px] font-medium text-fg"
                  data-testid="mes-exibido"
                >
                  {rotuloDoMes(mes, tag)}
                </span>
                <button
                  type="button"
                  aria-label={t("Próximo mês")}
                  title={t("Próximo mês")}
                  disabled={proximoBloqueado || carregando}
                  onClick={() => navegarMes(1)}
                  className="interactive rounded-sm p-1 text-fg-muted hover:bg-white/[0.06] hover:text-fg disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <CaretRight size={12} weight="bold" />
                </button>
              </div>
              <span className="text-xs text-fg-secondary">
                {t("Vendas acumuladas")} · {janelaN} {janelaN === 1 ? t("dia") : t("dias")}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    "interactive rounded-sm px-1.5 py-0.5 text-[11px] leading-none hover:bg-white/[0.06]",
                    r === range ? "font-medium text-fg" : "text-fg-muted",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
          <svg
            data-testid="svg-vendas"
            viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
            className="mt-4 h-auto w-full"
            aria-hidden="true"
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="crm-sales-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </linearGradient>
              <clipPath id="crm-sales-plot">
                <rect x={M.left} y={M.top} width={IW} height={IH} />
              </clipPath>
            </defs>

            {/* grade + eixo Y */}
            {passos.map((v) => {
              const y = M.top + IH * (1 - norm(v * 100));
              return (
                <g key={v}>
                  <line
                    x1={M.left}
                    x2={M.left + IW}
                    y1={y}
                    y2={y}
                    stroke="#94a3b8"
                    strokeOpacity={0.15}
                  />
                  <text x={M.left - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
                    {fmtNum.format(v)}
                  </text>
                </g>
              );
            })}

            <g clipPath="url(#crm-sales-plot)">
              {areaVendido ? (
                <g transform={`translate(${M.left},${M.top})`}>
                  <polygon points={areaVendido} fill="url(#crm-sales-fill)" />
                </g>
              ) : null}

              <g
                transform={`translate(${M.left},${M.top})`}
                fill="none"
                stroke="#34d399"
                strokeWidth={1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
              >
                {linhasVendido.map((pts, i) => (
                  <polyline key={i} points={pts} />
                ))}
              </g>

              {/* pontos da realizada (como na referência) */}
              <g transform={`translate(${M.left},${M.top})`} fill="#34d399">
                {serieVendido.map((v, i) =>
                  v == null ? null : <circle key={i} cx={xDoIdx(i)} cy={IH * (1 - v)} r={1.8} />,
                )}
              </g>

              {linhaMesAno ? (
                <g transform={`translate(${M.left},${M.top})`}>
                  <polyline
                    points={linhaMesAno}
                    fill="none"
                    stroke="#cbd5e1"
                    strokeWidth={1.2}
                    strokeDasharray="2 3"
                  />
                </g>
              ) : null}
              {linhaMesAnt ? (
                <g transform={`translate(${M.left},${M.top})`}>
                  <polyline
                    points={linhaMesAnt}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth={1.2}
                    strokeDasharray="6 3"
                  />
                </g>
              ) : null}
              {linhaMeta ? (
                <g transform={`translate(${M.left},${M.top})`}>
                  <polyline
                    points={linhaMeta}
                    fill="none"
                    stroke="#9a7bff"
                    strokeWidth={1.4}
                    strokeDasharray="6 3"
                  />
                </g>
              ) : null}
              <g
                transform={`translate(${M.left},${M.top})`}
                fill="none"
                stroke="#eab308"
                strokeWidth={1.4}
                strokeDasharray="6 3"
                strokeLinejoin="round"
              >
                {linhasProjecao.map((pts, i) => (
                  <polyline key={i} points={pts} />
                ))}
              </g>

              {/* marcador de HOJE — só quando o mês é o corrente; a grade
                  passada chega inteira e o "hoje" dela seria o último dia. */}
              {atual && xHoje != null ? (
                <line
                  x1={xHoje}
                  x2={xHoje}
                  y1={M.top}
                  y2={M.top + IH}
                  stroke="#94a3b8"
                  strokeOpacity={0.5}
                  strokeDasharray="3 3"
                />
              ) : null}

              {/* alvos de hover: um retângulo por coluna do dia */}
              {visiveis.map((p, i) => (
                <rect
                  key={`alvo-${p.dia}`}
                  data-dia={p.dia}
                  x={M.left + xDoIdx(i) - passoX / 2}
                  y={M.top}
                  width={passoX}
                  height={IH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              ))}

              {/* crosshair + ponto do dia sob o cursor */}
              {hover != null && visiveis[hover] ? (
                <g>
                  <line
                    x1={M.left + xDoIdx(hover)}
                    x2={M.left + xDoIdx(hover)}
                    y1={M.top}
                    y2={M.top + IH}
                    stroke="#94a3b8"
                    strokeOpacity={0.7}
                  />
                  {serieVendido[hover] != null ? (
                    <circle
                      cx={M.left + xDoIdx(hover)}
                      cy={M.top + IH * (1 - serieVendido[hover])}
                      r={3.4}
                      fill="#34d399"
                      stroke="var(--color-surface)"
                      strokeWidth={1.5}
                    />
                  ) : null}
                </g>
              ) : null}
            </g>

            {/* eixo X: dia + letra do dia da semana */}
            {visiveis.map((p, i) => (
              <g key={p.dia}>
                <text
                  x={M.left + xDoIdx(i)}
                  y={M.top + IH + 14}
                  textAnchor="middle"
                  fontSize={8.5}
                  fill={p.dia === diaHoje && atual ? "#e4e4e7" : "#94a3b8"}
                >
                  {p.dia}
                </text>
                <text
                  x={M.left + xDoIdx(i)}
                  y={M.top + IH + 26}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#94a3b8"
                  fillOpacity={0.7}
                >
                  {letraDoDia(mes, p.dia)}
                </text>
              </g>
            ))}
          </svg>

          {pontoHover && hover != null ? (
            <div
              data-testid="tooltip-dia"
              className="pointer-events-none absolute z-10 min-w-[10.5rem] -translate-x-1/2 -translate-y-full rounded-lg border border-border fill-panel px-2.5 py-2 shadow-lg"
              style={{
                left: `${Math.min(86, Math.max(14, ((M.left + xDoIdx(hover)) / PLOT_W) * 100))}%`,
                top: `${Math.min(84, Math.max(20, ((M.top + IH * (1 - norm(pontoHover.vendidoAc))) / PLOT_H) * 100))}%`,
              }}
            >
              <p className="mb-1.5 border-b border-border pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                {pontoHover.dia} · {diaExtenso(mes, pontoHover.dia, tag)}
              </p>
              <div className="space-y-1">
                {linhasTooltip.map((linha) => (
                  <div key={linha.rotulo} className="flex items-center justify-between gap-4">
                    <span className="text-[10px] text-fg-muted">{linha.rotulo}</span>
                    <span className="text-[10px] font-medium tabular-nums text-fg">
                      {linha.valor == null ? "—" : fmtBRL.format(linha.valor / 100)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Legenda cor="bg-[#34d399]" rotulo={t("Vendas no mês")} />
            <Legenda
              cor="border-[#9a7bff]"
              tracejado
              rotulo={t("Objetivo")}
              ausente={linhaMeta == null}
            />
            <Legenda
              cor="border-[#eab308]"
              tracejado
              rotulo={t("Previsão de vendas")}
              ausente={linhasProjecao.length === 0}
            />
            <Legenda
              cor="border-[#94a3b8]"
              tracejado
              rotulo={t("Mês passado")}
              ausente={linhaMesAnt == null}
            />
            <Legenda
              cor="border-[#cbd5e1]"
              tracejado
              rotulo={t("Ano passado")}
              ausente={linhaMesAno == null}
            />
          </div>
        </div>

        {/* Resumo do mês (painel direito da referência) */}
        <div className="rounded-xl border border-border fill-panel p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">
            {rotuloDoMes(mes, tag)}
          </p>

          <div className="mt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="flex size-5 items-center justify-center rounded-md bg-emerald-400/15 text-emerald-400">
                  <Wallet size={12} />
                </span>
                <span className="text-[11px] uppercase text-fg-muted">{t("Vendido no mês")}</span>
              </div>
              {comparar ? (
                <button
                  type="button"
                  onClick={comparar.onToggle}
                  className={cn(
                    "interactive flex items-center gap-1 rounded-md border border-accent-violet/60 px-2 py-0.5 text-[11px] leading-none",
                    comparar.ativo ? "bg-accent-violet/20 text-fg" : "text-fg-muted",
                  )}
                >
                  <ChartLineUp size={11} />
                  {t("Comparar")}
                </button>
              ) : null}
            </div>
            <p className="mt-1.5 text-xl font-semibold tabular-nums text-fg">
              {fmtBRL.format(vendidoMes / 100)}
            </p>
            {atual ? (
              <p className="mt-0.5 text-[11px] text-fg-muted">
                {t("Hoje")} {fmtBRL.format(vendidoHoje / 100)}
              </p>
            ) : null}
          </div>

          <div className="my-4 border-t border-border" />

          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="flex size-5 items-center justify-center rounded-md bg-violet-400/15 text-violet-400">
                  <Flag size={12} />
                </span>
                <span className="text-[11px] uppercase text-fg-muted">{t("Objetivo do mês")}</span>
              </div>
              {objetivo == null ? (
                <a
                  href="/app/relatorios"
                  className="text-[11px] text-fg-muted underline underline-offset-2 hover:text-fg"
                >
                  {t("Definir metas")}
                </a>
              ) : null}
            </div>
            <p className="mt-1.5 text-xl font-semibold tabular-nums text-fg">
              {objetivo != null ? fmtBRL.format(objetivo / 100) : "—"}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-accent-violet"
                  style={{
                    width: `${pctVendido == null ? 0 : Math.min(100, Math.max(0, pctVendido))}%`,
                  }}
                />
              </div>
              <span className="shrink-0 text-[10px] tabular-nums text-fg-muted">
                {pctVendido == null ? "—" : `${pctVendido.toFixed(1)}%`}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-fg-muted">
              {pctVendido != null
                ? `${pctVendido.toFixed(1)}% ${t("da meta")}`
                : t("Nenhuma meta definida")}
            </p>
          </div>

          <div className="my-4 border-t border-border" />

          <div>
            <div className="flex items-center gap-1.5">
              <span className="flex size-5 items-center justify-center rounded-md bg-indigo-400/15 text-indigo-400">
                <Clock size={12} />
              </span>
              <span className="text-[11px] uppercase text-fg-muted">{t("Necessário vender")}</span>
            </div>
            <p className="mt-1.5 text-lg font-semibold tabular-nums text-fg">
              {necessarioDia != null
                ? `${fmtBRL.format(Math.round(necessarioDia) / 100)} ${t("por dia útil")}`
                : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-fg-muted">
              {necessarioDia != null
                ? `${diasUteisRestantes} ${t("dias úteis restantes")}`
                : t("Nenhuma meta definida")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
