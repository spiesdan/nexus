"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import {
  chaveDeBusca,
} from "@/lib/expedicao/buscar-embarcavel";
import { comoMoeda } from "@/lib/format/moeda";
import {
  numeroDaCarga,
  ROTULO_DA_CARGA,
  type Carga,
  type StatusDaCarga,
} from "@/lib/schemas/expedicao";
import { chaveDoDia } from "@/lib/tempo/dia";
import {
  ArrowRight,
  CaretDown,
  CheckCircle,
  FileText,
  MagnifyingGlass,
  MapPin,
  Package,
  Truck,
  Warning,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Textos {
  titulo: string;
  subtitulo: string;
  nova: string;
  cargas: string;
  vazias: string;
  embarcaveis: string;
  verRomaneio: string;
}

/** Quantas paradas a carga tem, quantas já tiveram desfecho e para onde ela vai. */
export interface ProgressoDaCarga {
  total: number;
  entregues: number;
  devolvidos: number;
  /**
   * Cidades da rota, na ordem das paradas e sem repetir. É a primeira coisa
   * que a operação pergunta ("essa é a carga de Canoinhas ou a de Mafra?") e
   * era a única que a linha não respondia.
   */
  cidades: string[];
  /** Paradas cujo endereço não resolve cidade — dito, não escondido. */
  semCidade: number;
}

type FiltroDeCargas = "todas" | "em_rota" | "montando" | "concluidas" | "canceladas";

const PONTO_DA_CARGA: Record<StatusDaCarga, string> = {
  montando: "bg-warning",
  em_rota: "bg-info",
  concluida: "bg-success",
  cancelada: "bg-error",
};

/** Carga em rota primeiro, montagem depois: é a ordem em que a operação olha. */
const ORDEM_DO_STATUS: Record<StatusDaCarga, number> = {
  em_rota: 0,
  montando: 1,
  concluida: 2,
  cancelada: 3,
};

/** `2026-10-26` → `26/10/2026`. */
function diaCompleto(chave: string): string {
  if (!chave || chave.length < 10) return "—";
  return `${chave.slice(8, 10)}/${chave.slice(5, 7)}/${chave.slice(0, 4)}`;
}

/**
 * A BARRA DE PARADAS — o desfecho de cada uma em um traço.
 *
 * Entregue e devolvido são desfechos diferentes e a barra não pode pintar os
 * dois de verde: devolução é exceção, e é justamente ela que precisa saltar.
 * O que ainda não teve desfecho fica no fundo neutro.
 */
function BarraDeParadas({ progresso }: { progresso: ProgressoDaCarga }) {
  const { total, entregues, devolvidos } = progresso;
  const pctEntregue = total > 0 ? (entregues / total) * 100 : 0;
  const pctDevolvido = total > 0 ? (devolvidos / total) * 100 : 0;
  return (
    <span
      aria-hidden
      className="flex h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted"
    >
      <span className="h-full bg-success" style={{ width: `${pctEntregue}%` }} />
      <span className="h-full bg-error" style={{ width: `${pctDevolvido}%` }} />
    </span>
  );
}

/**
 * A EXPEDIÇÃO — uma mesa de despacho, não um painel de indicadores.
 *
 * A tela responde a duas perguntas na ordem em que a operação as faz:
 *
 *   1. o que está na rua e o que está na doca (a faixa de situação, que também
 *      filtra — não é enfeite de dashboard);
 *   2. qual carga precisa de mim agora (a fila, agrupada por estado, com a
 *      exceção marcada na própria linha).
 *
 * Montar a próxima carga é uma TELA (`/app/expedicao/nova`), não uma coluna ao
 * lado da fila: decidir o que sai e escolher os pedidos são tarefas diferentes,
 * e empilhar as duas na mesma dobra deixava as duas apertadas.
 */
export function ExpedicaoClient({
  inicial,
  fila,
  progresso = {},
  podeCriar,
  motorista = false,
  avisosNaFila = 0,
  textos,
}: {
  inicial: Carga[];
  /**
   * O que espera embarque: número e valor. A lista de pedidos em si vive na
   * subtela `/app/expedicao/nova` — aqui só o suficiente para a faixa.
   */
  fila: { total: number; valor: number };
  /**
   * `shipment_id` → paradas/entregues. Vem do servidor porque a lista de cargas
   * não carrega os itens: sem isto a linha da carga diz "em rota" e não diz se
   * falta uma entrega ou vinte.
   */
  progresso?: Record<string, ProgressoDaCarga>;
  podeCriar: boolean;
  /** Entregador: o cartão da carga abre a cabine (mapa), não a ficha. */
  motorista?: boolean;
  /**
   * Avisos de "saiu para entrega" esperando o número de expedição voltar
   * (migration 0299). Zero é o normal; acima de zero, a tela avisa — o
   * despachante não pode achar que o cliente foi avisado quando não foi.
   */
  avisosNaFila?: number;
  textos: Textos;
}) {
  const t = useT();
  const router = useRouter();
  const confirmar = useConfirmar();

  // ── Fila de cargas ────────────────────────────────────────────────────────
  const [filtroCargas, setFiltroCargas] = React.useState<FiltroDeCargas>("todas");
  const [buscaCarga, setBuscaCarga] = React.useState("");
  const [historicoAberto, setHistoricoAberto] = React.useState(false);
  const [gruposAbertos, setGruposAbertos] = React.useState<Record<string, boolean>>({});
  const [concluindoId, setConcluindoId] = React.useState<string | null>(null);

  // ── Situação ──────────────────────────────────────────────────────────────
  const porStatus = React.useMemo(
    () => ({
      emRota: inicial.filter((c) => c.status === "em_rota"),
      montando: inicial.filter((c) => c.status === "montando"),
      concluidas: inicial.filter((c) => c.status === "concluida"),
      canceladas: inicial.filter((c) => c.status === "cancelada"),
    }),
    [inicial],
  );

  const paradasPendentes = React.useMemo(
    () =>
      porStatus.emRota.reduce((soma, c) => {
        const p = progresso[c.id];
        return soma + Math.max(0, (p?.total ?? 0) - (p?.entregues ?? 0) - (p?.devolvidos ?? 0));
      }, 0),
    [porStatus.emRota, progresso],
  );
  const paradasNaRua = porStatus.emRota.reduce((s, c) => s + (progresso[c.id]?.total ?? 0), 0);
  const pedidosNaDoca = porStatus.montando.reduce((s, c) => s + (progresso[c.id]?.total ?? 0), 0);

  const contagem = React.useMemo(
    () => ({
      todas: inicial.length,
      em_rota: porStatus.emRota.length,
      montando: porStatus.montando.length,
      concluidas: porStatus.concluidas.length,
      canceladas: porStatus.canceladas.length,
    }),
    [inicial.length, porStatus],
  );

  // ── Fila ──────────────────────────────────────────────────────────────────
  const cargasFiltradas = React.useMemo(() => {
    const termo = chaveDeBusca(buscaCarga);
    return [...inicial]
      .filter((c) => {
        if (filtroCargas === "todas") return true;
        if (filtroCargas === "em_rota") return c.status === "em_rota";
        if (filtroCargas === "montando") return c.status === "montando";
        if (filtroCargas === "concluidas") return c.status === "concluida";
        return c.status === "cancelada";
      })
      .filter((c) => {
        if (!termo) return true;
        // Cidade entra na busca: "canoinhas" tem de achar a carga que vai
        // para lá, não só o pedido na fila de embarque.
        const cidades = (progresso[c.id]?.cidades ?? []).join(" ");
        return chaveDeBusca(
          `${numeroDaCarga(c.numero)} ${c.placa ?? ""} ${c.veiculo_tipo ?? ""} ${c.motorista_nome ?? ""} ${cidades}`,
        ).includes(termo);
      })
      .sort((a, b) => {
        const porStatus =
          ORDEM_DO_STATUS[a.status as StatusDaCarga] - ORDEM_DO_STATUS[b.status as StatusDaCarga];
        return porStatus !== 0 ? porStatus : (b.created_at ?? "").localeCompare(a.created_at ?? "");
      });
  }, [inicial, filtroCargas, buscaCarga, progresso]);

  const emRotaFiltradas = cargasFiltradas.filter((c) => c.status === "em_rota");
  const montandoFiltradas = cargasFiltradas.filter((c) => c.status === "montando");
  const historicoFiltrado = cargasFiltradas.filter(
    (c) => c.status === "concluida" || c.status === "cancelada",
  );

  const buscandoCarga = chaveDeBusca(buscaCarga) !== "";
  const filtroDeCargaAtivo = filtroCargas !== "todas";
  const historicoVisivel =
    historicoAberto ||
    filtroDeCargaAtivo ||
    buscandoCarga ||
    (emRotaFiltradas.length === 0 && montandoFiltradas.length === 0);

  function alternarFiltro(chave: FiltroDeCargas) {
    setFiltroCargas((atual) => (atual === chave ? "todas" : chave));
    setGruposAbertos({});
  }

  async function concluirCarga(c: Carga) {
    const ok = await confirmar({
      title: `${numeroDaCarga(c.numero)}: todas as paradas já têm desfecho. Concluir a carga agora?`,
      confirmLabel: t("Concluir"),
      cancelLabel: t("Cancelar"),
    });
    if (!ok) return;
    setConcluindoId(c.id);
    try {
      await apiClient.post(`/api/v1/shipments/${c.id}/rota/finalizar`, {});
      nexusToast.success(t("Carga concluída."));
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setConcluindoId(null);
    }
  }

  const filtrosDeCarga: { chave: FiltroDeCargas; rotulo: string; contagem: number }[] = [
    { chave: "todas", rotulo: t("Todas"), contagem: contagem.todas },
    { chave: "em_rota", rotulo: t("Na rua"), contagem: contagem.em_rota },
    { chave: "montando", rotulo: t("Montando"), contagem: contagem.montando },
    { chave: "concluidas", rotulo: t("Concluídas"), contagem: contagem.concluidas },
  ];

  /* ENTREGADOR (0292): a lista dele é a rua. Sem faixa de indicadores, sem
     filtros, sem doca — cada número que não é a carga dele é ruído no celular
     em movimento. O cartão abre a cabine (mapa), não a ficha da carga. */
  if (motorista) {
    // ── O ENTREGADOR ESCOLHE A CARGA ──────────────────────────────────────
    //
    // Carga liberada pelo escritório nasce `montando` ("pronta para sair") e
    // só vira `em_rota` quando o motorista aperta "Iniciar rota" na cabine.
    // Listar apenas `em_rota` escondia justamente a carga que ele deveria
    // começar — e ele não tinha como escolher entre duas.
    const disponiveis = [...porStatus.emRota, ...porStatus.montando].sort(
      (a, b) => b.numero - a.numero,
    );

    return (
      <div className="min-h-full bg-gradient-to-b from-accent-soft/50 via-background to-background pb-8">
        <header className="px-5 pt-7 pb-4">
          <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {t("Entrega")}
          </p>
          <h1 className="mt-1 text-[28px] leading-none font-semibold tracking-tight text-text">
            {textos.titulo}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {disponiveis.length === 0
              ? t("Nenhuma carga liberada agora.")
              : disponiveis.length === 1
                ? t("1 carga liberada para você")
                : `${disponiveis.length} ${t("cargas liberadas para você")}`}
          </p>
        </header>

        {disponiveis.length === 0 ? (
          <div className="mx-4 rounded-3xl border border-dashed border-border bg-surface/60 px-5 py-10 text-center">
            <Truck className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-medium text-text">{t("Nada na rua agora.")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Quando o escritório liberar uma carga, ela aparece aqui.")}
            </p>
          </div>
        ) : (
          <div className="space-y-3 px-4">
            <div className="space-y-1.5">
              <label
                htmlFor="carga-do-entregador"
                className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
              >
                {t("Qual carga você está entregando?")}
              </label>
              <select
                id="carga-do-entregador"
                className="h-12 w-full rounded-2xl border border-border bg-surface px-3 text-sm text-text shadow-xs"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) router.push(`/app/expedicao/${e.target.value}/motorista`);
                }}
              >
                <option value="" disabled>
                  {t("Escolha a carga…")}
                </option>
                {disponiveis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {numeroDaCarga(c.numero)}
                    {c.placa ? ` · ${c.placa}` : ""}
                    {` · ${ROTULO_DA_CARGA[c.status as StatusDaCarga] ?? c.status}`}
                    {c.motorista_nome ? ` · ${c.motorista_nome}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {disponiveis.map((c) => {
              const pr =
                progresso[c.id] ?? { total: 0, entregues: 0, devolvidos: 0, cidades: [], semCidade: 0 };
              const feitas = pr.entregues + pr.devolvidos;
              const pct = pr.total > 0 ? Math.round((feitas / pr.total) * 100) : 0;
              const naRua = c.status === "em_rota";
              return (
                <Link
                  key={c.id}
                  href={`/app/expedicao/${c.id}/motorista`}
                  className="group block rounded-3xl border border-border bg-surface p-4 shadow-xs transition active:scale-[0.99]"
                  data-testid={`carga-linha-${c.numero}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                        {t("Carga")}
                      </p>
                      <p className="text-[32px] leading-none font-semibold tracking-tight text-text tabular-nums">
                        {String(c.numero).padStart(3, "0")}
                      </p>
                    </div>
                    <Badge variant={naRua ? "success" : "info"} className="mt-0.5 shrink-0">
                      {naRua ? t("Na rua") : t("Pronta para sair")}
                    </Badge>
                  </div>

                  <p className="mt-2 truncate text-sm font-medium text-text">
                    {[c.placa, c.veiculo_tipo, c.motorista_nome].filter(Boolean).join(" · ") ||
                      t("Sem veículo ou motorista definido")}
                  </p>
                  {pr.cidades.length > 0 && (
                    <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      <MapPin size={12} aria-hidden className="shrink-0" />
                      <span className="truncate">{pr.cidades.join(" · ")}</span>
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full transition-[width]", naRua ? "bg-success" : "bg-accent")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {feitas}/{pr.total}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {pr.total - feitas === 1
                        ? t("1 parada pela frente")
                        : `${Math.max(0, pr.total - feitas)} ${t("paradas pela frente")}`}
                    </span>
                    <span className="flex items-center gap-1 text-sm font-medium text-accent">
                      {t("Abrir rota")}
                      <ArrowRight size={15} aria-hidden />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-full space-y-5 p-4 sm:p-6">
      <NexusPageHeader
        title={textos.titulo}
        subtitle={textos.subtitulo}
        actions={
          podeCriar ? (
            <Button asChild>
              <Link href="/app/expedicao/nova">
                <Package size={16} aria-hidden />
                {textos.nova}
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* ── Avisos esperando o número de expedição (migration 0299) ─────────
          O aviso "saiu para entrega" NUNCA sai pelo comercial. Se o número de
          expedição está fora do ar, o fato fica na fila e o cron entrega
          quando ele voltar — mas quem despacha precisa SABER que o cliente
          ainda não foi avisado, senão a tela mente por omissão. */}
      {avisosNaFila > 0 && (
        <div
          role="status"
          data-testid="avisos-de-expedicao-na-fila"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-warning/40 bg-warning-bg px-3.5 py-2.5 text-sm text-warning-fg"
        >
          <span>
            {avisosNaFila === 1
              ? t("1 aviso de saída esperando o número de expedição voltar.")
              : `${avisosNaFila} ${t("avisos de saída esperando o número de expedição voltar.")}`}
          </span>
          <Link
            href="/app/connections"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            {t("Ver conexões")}
          </Link>
        </div>
      )}

      {/* ── A situação da operação ──────────────────────────────────────────
          Uma faixa, não três cartões. Cada número é também o filtro da fila:
          "2 na rua" abre as duas; "8 aguardando embarque" leva à Nova carga. */}
      <div
        className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-surface shadow-xs 2xl:grid-cols-4"
        aria-label={t("Situação da expedição")}
      >
        <button
          type="button"
          onClick={() => alternarFiltro("em_rota")}
          aria-pressed={filtroCargas === "em_rota"}
          className={cn(
            "group relative flex flex-col items-start gap-0.5 border-r border-b border-border px-3.5 py-3 text-left transition-colors sm:border-b-0",
            filtroCargas === "em_rota" ? "bg-info-bg" : "hover:bg-muted/50",
          )}
        >
          <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t("Na rua")}
          </span>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-2xl font-semibold tabular-nums text-text">
              {contagem.em_rota}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {paradasPendentes}{" "}
              {paradasPendentes === 1 ? t("parada em aberto") : t("paradas em aberto")}
            </span>
          </span>
          <span
            aria-hidden
            className={cn(
              "absolute inset-x-0 bottom-0 h-0.5 bg-info transition-opacity",
              filtroCargas === "em_rota" ? "opacity-100" : "opacity-0 group-hover:opacity-40",
            )}
          />
        </button>

        <button
          type="button"
          onClick={() => alternarFiltro("montando")}
          aria-pressed={filtroCargas === "montando"}
          className={cn(
            "group relative flex flex-col items-start gap-0.5 border-b border-border px-3.5 py-3 text-left transition-colors sm:border-r sm:border-b-0",
            filtroCargas === "montando" ? "bg-warning-bg" : "hover:bg-muted/50",
          )}
        >
          <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t("Montando")}
          </span>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-2xl font-semibold tabular-nums text-text">
              {contagem.montando}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {pedidosNaDoca} {pedidosNaDoca === 1 ? t("pedido na doca") : t("pedidos na doca")}
            </span>
          </span>
          <span
            aria-hidden
            className={cn(
              "absolute inset-x-0 bottom-0 h-0.5 bg-warning transition-opacity",
              filtroCargas === "montando" ? "opacity-100" : "opacity-0 group-hover:opacity-40",
            )}
          />
        </button>

        <Link
          href="/app/expedicao/nova"
          className="group relative flex flex-col items-start gap-0.5 border-r border-border px-3.5 py-3 text-left transition-colors hover:bg-accent-soft/60"
        >
          <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {textos.embarcaveis}
          </span>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-2xl font-semibold tabular-nums text-text">
              {fila.total}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {comoMoeda(fila.valor, "BRL")}
            </span>
          </span>
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-0.5 bg-accent opacity-0 transition-opacity group-hover:opacity-60"
          />
        </Link>

        <button
          type="button"
          onClick={() => alternarFiltro("concluidas")}
          aria-pressed={filtroCargas === "concluidas"}
          className={cn(
            "group relative flex flex-col items-start gap-0.5 px-3.5 py-3 text-left transition-colors",
            filtroCargas === "concluidas" ? "bg-success-bg" : "hover:bg-muted/50",
          )}
        >
          <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t("Concluídas")}
          </span>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-2xl font-semibold tabular-nums text-text">
              {contagem.concluidas}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {paradasNaRua > 0
                ? `${paradasNaRua} ${paradasNaRua === 1 ? t("parada na rua") : t("paradas na rua")}`
                : t("histórico")}
            </span>
          </span>
          <span
            aria-hidden
            className={cn(
              "absolute inset-x-0 bottom-0 h-0.5 bg-success transition-opacity",
              filtroCargas === "concluidas" ? "opacity-100" : "opacity-0 group-hover:opacity-40",
            )}
          />
        </button>
      </div>

      {/* ── A fila ──────────────────────────────────────────────────────── */}
        <section className="min-w-0 space-y-3" aria-labelledby="titulo-cargas">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <h2 id="titulo-cargas" className="text-base font-medium text-text">
                {textos.cargas}
              </h2>
              <p className="text-xs text-muted-foreground">
                {contagem.todas === 0
                  ? t("A primeira carga nasce ao lado.")
                  : `${contagem.todas} ${
                      contagem.todas === 1 ? t("carga no total") : t("cargas no total")
                    } · ${t("o que precisa de você vem primeiro")}`}
              </p>
            </div>

            <div className="relative w-full sm:w-60">
              <MagnifyingGlass
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle"
              />
              <Input
                value={buscaCarga}
                onChange={(e) => setBuscaCarga(e.target.value)}
                placeholder={t("Número, placa ou motorista")}
                aria-label={t("Buscar carga")}
                className="h-9 w-full bg-surface pl-9"
              />
            </div>
          </div>

          {(filtroDeCargaAtivo || buscandoCarga) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {filtroDeCargaAtivo && (
                <Badge variant="neutral">
                  {filtrosDeCarga.find((f) => f.chave === filtroCargas)?.rotulo}
                </Badge>
              )}
              {buscandoCarga && <Badge variant="neutral">“{buscaCarga}”</Badge>}
              <button
                type="button"
                onClick={() => {
                  setFiltroCargas("todas");
                  setBuscaCarga("");
                }}
                className="underline underline-offset-4 hover:text-text"
              >
                {t("Limpar filtros")}
              </button>
            </div>
          )}

          {inicial.length === 0 ? (
            <NexusEmptyState
              icon={Truck}
              headline={textos.vazias}
              subcopy={t("Escolha os pedidos em Nova carga e informe o veículo.")}
            />
          ) : cargasFiltradas.length === 0 ? (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <p className="text-muted-foreground">
                {buscandoCarga
                  ? t("Nenhuma carga encontrada com esse termo.")
                  : t("Nenhuma carga neste filtro.")}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFiltroCargas("todas");
                  setBuscaCarga("");
                }}
              >
                {t("Limpar filtros")}
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              <GrupoDaFila
                titulo={t("Na rua")}
                ponto="bg-info"
                cargas={emRotaFiltradas}
                progresso={progresso}
                aberto={gruposAbertos.em_rota ?? false}
                aoAbrir={() => setGruposAbertos((g) => ({ ...g, em_rota: !g.em_rota }))}
                concluindoId={concluindoId}
                aoConcluir={concluirCarga}
                motorista={motorista}
                textos={textos}
              />
              <GrupoDaFila
                titulo={t("Na doca")}
                ponto="bg-warning"
                cargas={montandoFiltradas}
                progresso={progresso}
                aberto={gruposAbertos.montando ?? false}
                aoAbrir={() => setGruposAbertos((g) => ({ ...g, montando: !g.montando }))}
                concluindoId={concluindoId}
                aoConcluir={concluirCarga}
                motorista={motorista}
                textos={textos}
              />

              {!filtroDeCargaAtivo &&
                !buscandoCarga &&
                emRotaFiltradas.length === 0 &&
                montandoFiltradas.length === 0 && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-success-bg text-success-fg">
                      <CheckCircle size={17} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text">
                        {t("Nada na rua nem na doca.")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("A próxima carga nasce em Nova carga.")}
                      </p>
                    </div>
                    {podeCriar && (
                      <Button asChild size="sm" variant="outline">
                        <Link href="/app/expedicao/nova">{textos.nova}</Link>
                      </Button>
                    )}
                  </div>
                )}

              {historicoFiltrado.length > 0 && (
                <section aria-labelledby="titulo-historico">
                  <button
                    type="button"
                    onClick={() => setHistoricoAberto((v) => !v)}
                    aria-expanded={historicoVisivel}
                    className="flex w-full items-center gap-2 rounded-lg py-1 text-left text-xs font-medium text-muted-foreground hover:text-text"
                  >
                    <CaretDown
                      size={14}
                      aria-hidden
                      className={cn("transition-transform", !historicoVisivel && "-rotate-90")}
                    />
                    {t("Histórico")} ({historicoFiltrado.length})
                    <span className="font-normal text-text-subtle">
                      {t("concluídas e canceladas")}
                    </span>
                  </button>
                  {historicoVisivel && (
                    <ul className="mt-1 overflow-hidden rounded-xl border border-border bg-surface">
                      {historicoFiltrado.map((c) => (
                        <LinhaDaCarga
                          key={c.id}
                          carga={c}
                          progresso={
                            progresso[c.id] ?? {
                              total: 0,
                              entregues: 0,
                              devolvidos: 0,
                              cidades: [],
                              semCidade: 0,
                            }
                          }
                          concluindo={concluindoId === c.id}
                          aoConcluir={concluirCarga}
                          motorista={motorista}
                          textos={textos}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {emRotaFiltradas.length === 0 &&
                montandoFiltradas.length === 0 &&
                historicoFiltrado.length === 0 && (
                  <Card className="p-4 text-sm text-muted-foreground">
                    {t("Nenhuma carga encontrada com esse termo.")}
                  </Card>
                )}
            </div>
          )}
        </section>

    </div>
  );
}

/** Um grupo da fila. Lista vazia some — o cabeçalho não é um espaço reservado. */
function GrupoDaFila({
  titulo,
  ponto,
  cargas,
  progresso,
  aberto,
  aoAbrir,
  concluindoId,
  aoConcluir,
  motorista,
  textos,
}: {
  titulo: string;
  ponto: string;
  cargas: Carga[];
  progresso: Record<string, ProgressoDaCarga>;
  aberto: boolean;
  aoAbrir: () => void;
  concluindoId: string | null;
  aoConcluir: (c: Carga) => void;
  motorista: boolean;
  textos: Textos;
}) {
  const t = useT();
  if (cargas.length === 0) return null;
  const visiveis = aberto ? cargas : cargas.slice(0, 5);

  return (
    <section className="space-y-1.5" aria-label={titulo}>
      <div className="flex items-center gap-2 px-1">
        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", ponto)} />
        <h3 className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          {titulo}
        </h3>
        <span className="text-[11px] text-text-subtle tabular-nums">{cargas.length}</span>
      </div>
      <ul className="overflow-hidden rounded-xl border border-border bg-surface">
        {visiveis.map((c) => (
          <LinhaDaCarga
            key={c.id}
            carga={c}
            progresso={
              progresso[c.id] ?? {
                total: 0,
                entregues: 0,
                devolvidos: 0,
                cidades: [],
                semCidade: 0,
              }
            }
            concluindo={concluindoId === c.id}
            aoConcluir={aoConcluir}
            motorista={motorista}
            textos={textos}
          />
        ))}
      </ul>
      {cargas.length > 5 && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={aoAbrir}>
          {aberto ? t("Mostrar menos") : `${t("Ver todas")} (${cargas.length})`}
        </Button>
      )}
    </section>
  );
}

/**
 * UMA CARGA NA FILA — o "ticket" de despacho.
 *
 * A linha inteira é o link (alvo grande no celular), mas o que exige ação
 * (concluir uma carga cujas paradas já têm desfecho) é um botão de verdade,
 * acima do link. Exceção na linha, não escondida na ficha.
 */
function LinhaDaCarga({
  carga,
  progresso,
  concluindo,
  aoConcluir,
  motorista,
  textos,
}: {
  carga: Carga;
  progresso: ProgressoDaCarga;
  concluindo: boolean;
  aoConcluir: (c: Carga) => void;
  motorista: boolean;
  textos: Textos;
}) {
  const t = useT();
  const finalizadas = progresso.entregues + progresso.devolvidos;
  const paradasEmAberto = Math.max(0, progresso.total - finalizadas);
  const prontaParaConcluir =
    carga.status === "em_rota" && progresso.total > 0 && paradasEmAberto === 0;
  const semPedidos = progresso.total === 0;
  const veiculoETripulacao = [carga.placa, carga.veiculo_tipo, carga.motorista_nome]
    .filter(Boolean)
    .join(" · ");
  const criada = chaveDoDia(new Date(carga.created_at));

  return (
    <li
      className="group relative flex items-center gap-3 border-b border-border px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/30"
      data-testid={`carga-linha-${carga.numero}`}
    >
      <Link
        href={`/app/expedicao/${carga.id}${motorista ? "/motorista" : ""}`}
        className="absolute inset-0 z-0"
        aria-label={`${t("Abrir")} ${numeroDaCarga(carga.numero)}`}
      />

      <div className="w-11 shrink-0">
        <p className="text-[9px] font-semibold tracking-[0.14em] text-text-subtle uppercase">
          {t("Carga")}
        </p>
        <p className="text-lg leading-none font-semibold text-text tabular-nums">
          {String(carga.numero).padStart(3, "0")}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 truncate text-sm font-medium text-text">
            {veiculoETripulacao || t("Sem veículo ou motorista definido")}
          </p>
        </div>

        {progresso.cidades.length > 0 && (
          <p
            className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
            title={progresso.cidades.join(" · ")}
          >
            <MapPin size={11} aria-hidden className="shrink-0" />
            <span className="truncate">{progresso.cidades.join(" · ")}</span>
            {progresso.semCidade > 0 && (
              <span className="shrink-0 text-text-subtle">
                · {progresso.semCidade} {t("sem cidade")}
              </span>
            )}
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 rounded-full", PONTO_DA_CARGA[carga.status])}
            />
            {ROTULO_DA_CARGA[carga.status] ?? carga.status}
          </span>
          {progresso.total > 0 ? (
            <>
              <span className="text-border-strong" aria-hidden>
                ·
              </span>
              <BarraDeParadas progresso={progresso} />
              <span className="tabular-nums">
                {finalizadas}/{progresso.total} {t("paradas")}
              </span>
              {progresso.devolvidos > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-error-fg">
                  <Warning size={11} aria-hidden />
                  {progresso.devolvidos}{" "}
                  {progresso.devolvidos === 1 ? t("devolução") : t("devoluções")}
                </span>
              )}
            </>
          ) : (
            <span className="text-warning-fg">{t("Sem pedidos")}</span>
          )}
          <span className="hidden text-text-subtle sm:inline">·</span>
          <span className="hidden text-text-subtle tabular-nums sm:inline">
            {diaCompleto(criada)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {prontaParaConcluir && (
          <Button
            size="sm"
            variant="outline"
            className="relative z-10 h-8 gap-1.5 border-success/40 text-success-fg hover:border-success hover:text-success-fg"
            disabled={concluindo}
            onClick={() => aoConcluir(carga)}
          >
            <CheckCircle size={14} aria-hidden />
            {concluindo ? t("Concluindo…") : t("Concluir")}
          </Button>
        )}
        <Link
          href={`/api/v1/shipments/${carga.id}/romaneio`}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-10 hidden rounded-md p-1.5 text-text-subtle transition-colors hover:bg-muted hover:text-text sm:inline-flex"
          aria-label={`${textos.verRomaneio} — ${numeroDaCarga(carga.numero)}`}
          title={textos.verRomaneio}
        >
          <FileText size={16} aria-hidden />
        </Link>
        <ArrowRight
          aria-hidden
          className="h-4 w-4 text-text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-text"
        />
      </div>

      {prontaParaConcluir && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-success"
        />
      )}
      {semPedidos && carga.status === "montando" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-warning"
        />
      )}
    </li>
  );
}
