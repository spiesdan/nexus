"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowsClockwise, Megaphone, PencilSimple, Trash } from "@phosphor-icons/react";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { resumoDosDias } from "@/components/prospeccao/DiasDaSemana";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";
import {
  FilterActions,
  FilterBar,
  FilterPrimary,
  FilterSearch,
  FilterSelect,
} from "@/components/filters/FilterBar";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import type { FunilDaCampanha } from "@/lib/prospeccao/funil";
import type { ResumoDeEnvio } from "@/lib/prospeccao/resumo-de-envio";
import { lerTemplatesPorCategoria } from "@/lib/prospeccao/templates-por-categoria";

/**
 * Aba CAMPANHAS — uma lista, não um dashboard.
 *
 * O desenho antigo repetia, em cada card, o público, o envio, a barra de
 * progresso, quatro KPIs e o funil. Quem tinha cinco campanhas via vinte
 * números antes de achar o botão "Controlar". A lista agora responde só o que
 * serve para escolher uma campanha: nome, status, recorte, andamento do envio
 * e respostas. O funil e a fila por cidade vivem no CONTROLE da campanha.
 *
 * "Criar campanha" não mora aqui: é ação do cabeçalho da Prospecção, como
 * "Criar pedido" é do cabeçalho de Pedidos.
 */
interface CampanhaDescoberta {
  id: string;
  nome: string;
  objetivo: string | null;
  categorias: string[];
  cidades: { cidade: string; estado?: string }[];
  status: string;
  recorrencia_dias: number | null;
  ultima_execucao_at: string | null;
  /** 0271: `busca` (provider ativo) | `base` (já cadastrado) | `ambas`. */
  fonte_publico?: string | null;
  /** 0274: `prospects` (garimpagem) | `contatos` (recuperação). */
  publico?: string | null;
  prospect_ids?: string[] | null;
  contato_ids?: string[] | null;
  /** 0273 — o relógio da campanha. Não vem na aba de venda automática. */
  janelas?: Array<{ inicio: string; fim: string; dias?: number[] }> | null;
  /** 0273 — as variações da rotação, na ordem. O Disparo nasce com elas. */
  mensagens?: string[] | null;
  /** 0284 — `texto` (rotação) ou `template` (modelo aprovado no oficial). */
  mensagem_tipo?: string | null;
  template_name?: string | null;
  template_language?: string | null;
  /** 0285 — um modelo por categoria. Vazio = bind único legado (0284). */
  templates_por_categoria?: unknown;
  ultimo_erro?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  /** 0273 — a cota do dia, que o Disparo também herda. */
  limite_diario?: number | null;
  agendada_em?: string | null;
  /** O resumo de envio calculado pela listagem (envio real, não funil). */
  envio?: ResumoDeEnvio | null;
  funil?: FunilDaCampanha | null;
}

interface CampanhaVa {
  id: string;
  nome: string;
  objetivo: string | null;
  status: string;
  cidade: string;
  uf: string | null;
  categorias: string[];
  funil?: FunilDaCampanha | null;
}

type CardCampanha =
  { tipo: "descoberta"; campanha: CampanhaDescoberta } | { tipo: "va"; campanha: CampanhaVa };

type ChaveStatus = "ativa" | "pausada" | "concluida" | "rascunho";

/** A campanha sincronamente enviada pode continuar `rascunho` no banco. */
function chaveDaCampanha(card: CardCampanha): ChaveStatus {
  if (card.tipo === "descoberta") {
    const total = card.campanha.envio?.total ?? 0;
    const enviados = card.campanha.envio?.enviados ?? 0;
    if (total > 0 && enviados >= total) return "concluida";
  }
  const status = card.campanha.status;
  if (status === "ativa" || status === "active") return "ativa";
  if (status === "pausada" || status === "paused") return "pausada";
  if (status === "concluida" || status === "completed") return "concluida";
  return "rascunho";
}

function rotuloDoStatus(chave: ChaveStatus, t: (texto: string) => string): string {
  if (chave === "ativa") return t("Ativa");
  if (chave === "pausada") return t("Pausada");
  if (chave === "concluida") return t("Concluída");
  return t("Rascunho");
}

function varianteDoStatus(chave: ChaveStatus): "success" | "warning" | "neutral" | "outline" {
  if (chave === "ativa") return "success";
  if (chave === "pausada") return "warning";
  if (chave === "concluida") return "success";
  return "outline";
}

/** `2026-10-19` → `19/10` (é assim que o dono fala: "do dia 19/10 ao 23/10"). */
function diaCurto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

/**
 * A agenda da campanha em uma linha — `null` quando ela não está agendada (a
 * aba mistura descoberta e venda automática, e a segunda não tem relógio).
 */
function agendaDaCampanha(c: CampanhaDescoberta, t: (texto: string) => string): string | null {
  if (!c.agendada_em) return null;
  const janelas = (c.janelas ?? []).filter((j) => j?.inicio && j?.fim);
  if (janelas.length === 0) return null;
  const dias = [...new Set(janelas.flatMap((j) => j.dias ?? []))].sort((a, b) => a - b);
  return [
    dias.length > 0 && dias.length < 7 ? t(resumoDosDias(dias)) : null,
    janelas.map((j) => t(`das ${j.inicio} às ${j.fim}`)).join(` ${t("e")} `),
    c.data_inicio && c.data_fim
      ? t(`de ${diaCurto(c.data_inicio)} a ${diaCurto(c.data_fim)}`)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function ObjetivoInline({
  valor,
  rota,
  salvo,
}: {
  valor: string | null;
  rota: string;
  salvo: (novo: string | null) => void;
}) {
  const t = useT();
  const [editando, setEditando] = React.useState(false);
  const [texto, setTexto] = React.useState(valor ?? "");

  async function salvar() {
    const novo = texto.trim();
    try {
      await apiClient.patch(rota, { objetivo: novo === "" ? null : novo });
      salvo(novo === "" ? null : novo);
      setEditando(false);
    } catch (e) {
      showApiError(e);
    }
  }

  if (!editando) {
    if (!valor) {
      return (
        <button
          type="button"
          className="inline-flex text-muted-foreground hover:text-foreground"
          onClick={() => {
            setTexto("");
            setEditando(true);
          }}
          title={t("Adicionar objetivo")}
          aria-label={t("Adicionar objetivo")}
        >
          <PencilSimple size={12} aria-hidden />
        </button>
      );
    }
    return (
      <button
        type="button"
        className="flex max-w-full items-start gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
        onClick={() => {
          setTexto(valor);
          setEditando(true);
        }}
      >
        <span className="truncate">{valor}</span>
        <PencilSimple size={12} className="mt-0.5 shrink-0" aria-hidden />
        <span className="sr-only">{t("Editar objetivo")}</span>
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        autoFocus
        value={texto}
        maxLength={300}
        placeholder={t("Objetivo desta campanha…")}
        aria-label={t("Objetivo")}
        className="h-8 max-w-md text-sm"
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void salvar();
          if (e.key === "Escape") setEditando(false);
        }}
      />
      <Button size="sm" onClick={() => void salvar()}>
        {t("Salvar")}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
        {t("Cancelar")}
      </Button>
    </div>
  );
}

function BarraDeEnvio({ resumo }: { resumo: ResumoDeEnvio | null | undefined }) {
  const t = useT();
  if (!resumo || resumo.total === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("Público ainda não preparado.")}{" "}
        <span className="text-foreground">{t("Abra o controle para ver as empresas.")}</span>
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">{t(`${resumo.enviados} de ${resumo.total} enviadas`)}</span>
        <span className="text-muted-foreground">{resumo.percentual}%</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={resumo.percentual}
        aria-label={t("Progresso do envio")}
      >
        <div
          className="h-full rounded-full bg-success transition-[width] duration-500"
          style={{ width: `${resumo.percentual}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {resumo.pendentes > 0 ? t(`${resumo.pendentes} pendentes`) : t("Todas enviadas")}
        {resumo.sem_confirmacao > 0 ? ` · ${t(`${resumo.sem_confirmacao} sem comprovante`)}` : ""}
      </p>
    </div>
  );
}

export function CampanhasTab({ podeOperar }: { podeOperar: boolean }) {
  const t = useT();
  const router = useRouter();
  const [descobertas, setDescobertas] = React.useState<CampanhaDescoberta[] | null>(null);
  const [vas, setVas] = React.useState<CampanhaVa[] | null>(null);
  const [erro, setErro] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [statusFiltro, setStatusFiltro] = React.useState("todas");
  const [tipoFiltro, setTipoFiltro] = React.useState("todas");
  // Criar campanha saiu daqui: virou página própria (/app/prospeccao/nova).
  // A campanha que espera confirmação de exclusão (o diálogo é único e vive no
  // rodapé; cada linha só aponta para qual delas).
  const [aExcluir, setAExcluir] = React.useState<CampanhaDescoberta | null>(null);
  const [excluindo, setExcluindo] = React.useState(false);

  const recarregar = React.useCallback(async () => {
    try {
      // FASE 15 (§45): o funil vem NAS listas (`com_funil=1`) — eram 2 + N
      // requests para desenhar a aba; agora são as 2 de sempre. O resumo de
      // envio também vem na lista, numa query em lote.
      const [resDesc, resVa] = await Promise.all([
        apiClient.get<{ data: unknown }>("/api/v1/prospecting/campaigns?com_funil=1"),
        apiClient.get<{ data: unknown }>("/api/v1/automatic-sales/campaigns?com_funil=1"),
      ]);
      const listaDesc = ((resDesc as { data?: unknown } | null)?.data ??
        []) as CampanhaDescoberta[];
      const listaVa = ((resVa as { data?: unknown } | null)?.data ?? []) as CampanhaVa[];
      setDescobertas(Array.isArray(listaDesc) ? listaDesc : []);
      setVas(Array.isArray(listaVa) ? listaVa : []);
      setErro(false);
    } catch (e) {
      setErro(true);
      showApiError(e);
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  async function excluir() {
    if (!aExcluir) return;
    const alvo = aExcluir;
    setExcluindo(true);
    try {
      await apiClient.delete(`/api/v1/prospecting/campaigns/${alvo.id}`);
      toast.success(t("Campanha excluída."));
      setAExcluir(null);
      await recarregar();
    } catch (e) {
      showApiError(e);
    } finally {
      setExcluindo(false);
    }
  }

  const cards: CardCampanha[] = [
    ...(descobertas ?? []).map((campanha) => ({ tipo: "descoberta" as const, campanha })),
    ...(vas ?? []).map((campanha) => ({ tipo: "va" as const, campanha })),
  ];
  const carregando = descobertas === null || vas === null;

  const cardsFiltrados = cards.filter((card) => {
    if (tipoFiltro !== "todas" && card.tipo !== tipoFiltro) return false;
    const chave = chaveDaCampanha(card);
    if (statusFiltro !== "todas" && statusFiltro !== `${chave}s`) return false;

    const termo = busca.trim().toLowerCase();
    if (!termo) return true;
    const partes =
      card.tipo === "descoberta"
        ? [
            card.campanha.nome,
            card.campanha.objetivo ?? "",
            ...(card.campanha.categorias ?? []),
            ...(card.campanha.cidades ?? []).map((c) =>
              [c.cidade, c.estado].filter(Boolean).join(" "),
            ),
          ]
        : [
            card.campanha.nome,
            card.campanha.objetivo ?? "",
            ...(card.campanha.categorias ?? []),
            [card.campanha.cidade, card.campanha.uf].filter(Boolean).join(" "),
          ];
    return partes.some((v) => String(v).toLowerCase().includes(termo));
  });

  const opcoesStatus = [
    { value: "todas", label: t("Todos os status") },
    { value: "ativas", label: t("Ativas") },
    { value: "rascunhos", label: t("Rascunhos") },
    { value: "pausadas", label: t("Pausadas") },
    { value: "concluidas", label: t("Concluídas") },
  ];
  const opcoesTipo = [
    { value: "todas", label: t("Todos os tipos") },
    { value: "descoberta", label: t("Descoberta") },
    { value: "va", label: t("Venda automática") },
  ];

  function limparFiltros() {
    setBusca("");
    setStatusFiltro("todas");
    setTipoFiltro("todas");
  }

  return (
    <div className="space-y-3">
      <FilterBar>
        <FilterPrimary>
          <FilterSearch
            id="campanhas-busca"
            label={t("Buscar campanha")}
            value={busca}
            onChange={setBusca}
            placeholder={t("Nome, cidade, categoria ou objetivo…")}
          />
          <FilterSelect
            id="campanhas-status"
            label={t("Status")}
            value={statusFiltro}
            onChange={setStatusFiltro}
            options={opcoesStatus}
          />
          <FilterSelect
            id="campanhas-tipo"
            label={t("Tipo")}
            value={tipoFiltro}
            onChange={setTipoFiltro}
            options={opcoesTipo}
          />
        </FilterPrimary>
        <FilterActions>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {cardsFiltrados.length === cards.length
              ? cards.length === 1
                ? t("1 campanha")
                : t(`${cards.length} campanhas`)
              : t(`${cardsFiltrados.length} de ${cards.length} campanhas`)}
          </span>
          {(busca || statusFiltro !== "todas" || tipoFiltro !== "todas") && (
            <Button type="button" size="sm" variant="ghost" onClick={limparFiltros}>
              {t("Limpar filtros")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => void recarregar()}
          >
            <ArrowsClockwise size={14} aria-hidden />
            {t("Atualizar")}
          </Button>
        </FilterActions>
      </FilterBar>

      {erro && cards.length === 0 ? (
        <NexusErrorState onRetry={() => void recarregar()} />
      ) : carregando ? (
        <div className="space-y-2" aria-live="polite">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : cards.length === 0 ? (
        <NexusEmptyState
          icon={Megaphone}
          headline={t("Nenhuma campanha ainda.")}
          subcopy={t("Comece por um recorte de cidades e categorias da sua base.")}
          primary={
            podeOperar
              ? {
                  label: t("Criar primeira campanha"),
                  onClick: () => router.push("/app/prospeccao/nova"),
                }
              : undefined
          }
        />
      ) : cardsFiltrados.length === 0 ? (
        <Card className="space-y-2 p-8 text-center text-sm text-muted-foreground">
          <p>{t("Nenhuma campanha com esse filtro.")}</p>
          <Button type="button" size="sm" variant="outline" onClick={limparFiltros}>
            {t("Limpar filtros")}
          </Button>
        </Card>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {cardsFiltrados.map((card) => {
            const id = card.campanha.id;
            const chave = chaveDaCampanha(card);
            const status = rotuloDoStatus(chave, t);
            const funil = card.campanha.funil ?? null;
            const respostas = funil?.responderam ?? null;
            const recuperacao = card.tipo === "descoberta" && card.campanha.publico === "contatos";
            const contatoIds = card.tipo === "descoberta" ? (card.campanha.contato_ids ?? []) : [];
            const rotaPatch =
              card.tipo === "descoberta"
                ? `/api/v1/prospecting/campaigns/${id}`
                : `/api/v1/automatic-sales/campaigns/${id}`;
            const regiao =
              card.tipo === "descoberta"
                ? (card.campanha.cidades ?? [])
                    .map((c) => (c.estado ? `${c.cidade}/${c.estado}` : c.cidade))
                    .join(", ")
                : `${card.campanha.cidade}${card.campanha.uf ? `/${card.campanha.uf}` : ""}`;
            const categorias = (card.campanha.categorias ?? []).join(", ");
            const envio = card.tipo === "descoberta" ? (card.campanha.envio ?? null) : null;
            const agenda = card.tipo === "descoberta" ? agendaDaCampanha(card.campanha, t) : null;
            const bindsDoCard =
              card.tipo === "descoberta" && card.campanha.mensagem_tipo === "template"
                ? lerTemplatesPorCategoria(card.campanha.templates_por_categoria)
                : [];
            const atualizarObjetivo = (novo: string | null) => {
              if (card.tipo === "descoberta") {
                setDescobertas((lista) =>
                  (lista ?? []).map((c) => (c.id === id ? { ...c, objetivo: novo } : c)),
                );
              } else {
                setVas((lista) =>
                  (lista ?? []).map((c) => (c.id === id ? { ...c, objetivo: novo } : c)),
                );
              }
            };
            const href =
              card.tipo === "descoberta"
                ? `/app/prospeccao/campanhas/${id}`
                : "/app/venda-automatica";

            return (
              <li key={`${card.tipo}-${id}`} className="p-3 sm:p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(11rem,0.9fr)_auto] lg:items-center">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={href} className="truncate text-sm font-semibold hover:underline">
                        {card.campanha.nome}
                      </Link>
                      <Badge variant="neutral" className="h-5 px-2 text-xs font-normal">
                        {card.tipo === "descoberta" ? t("Descoberta") : t("Venda automática")}
                      </Badge>
                      <Badge
                        variant={varianteDoStatus(chave)}
                        className="h-5 px-2 text-xs font-normal"
                      >
                        {status}
                      </Badge>
                      {card.tipo === "descoberta" &&
                        card.campanha.mensagem_tipo === "template" && (
                          <Badge
                            variant="info"
                            className="h-5 px-2 text-xs font-normal"
                            title={t("O conteúdo é um modelo aprovado no canal oficial.")}
                          >
                            {t("Modelo")}
                            {bindsDoCard.length > 1
                              ? ` · ${bindsDoCard.length} ${t("categorias")}`
                              : card.campanha.template_name
                                ? ` · ${card.campanha.template_name}`
                                : ""}
                          </Badge>
                        )}
                      {card.tipo === "descoberta" && card.campanha.ultimo_erro && (
                        <Badge
                          variant="warning"
                          className="h-5 px-2 text-xs font-normal"
                          title={card.campanha.ultimo_erro}
                        >
                          {t("Com erro")}
                        </Badge>
                      )}
                      {recuperacao && (
                        <Badge
                          variant="outline"
                          className="h-5 px-2 text-xs font-normal"
                          title={t(
                            "Audiência: clientes que já compraram e pararam — recuperação, não prospecção.",
                          )}
                        >
                          {t("Recuperação")} · {contatoIds.length}
                        </Badge>
                      )}
                    </div>

                    <p className="truncate text-xs text-muted-foreground">
                      {recuperacao
                        ? `${t("Público")}: ${contatoIds.length} ${t("clientes que pararam de comprar")}`
                        : `${t("Região")}: ${regiao || "—"} · ${t("Categorias")}: ${
                            categorias || "—"
                          }`}
                    </p>

                    {agenda && (
                      <p className="truncate text-xs text-muted-foreground">
                        {t("Agenda")}: {agenda}
                      </p>
                    )}

                    <ObjetivoInline
                      valor={card.campanha.objetivo}
                      rota={rotaPatch}
                      salvo={atualizarObjetivo}
                    />
                  </div>

                  <div className="min-w-0">
                    {card.tipo === "descoberta" ? (
                      <BarraDeEnvio resumo={envio} />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        <span className="text-sm font-medium text-foreground">
                          {funil?.contatados ?? 0}
                        </span>{" "}
                        {t("contatados")}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 lg:justify-end">
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{respostas ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{t("respostas")}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={href}>
                          {card.tipo === "descoberta" ? t("Controlar") : t("Abrir")}
                          <ArrowRight size={14} aria-hidden />
                        </Link>
                      </Button>
                      {card.tipo === "descoberta" && podeOperar && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t("Excluir campanha")}
                          title={t("Excluir campanha")}
                          onClick={() => setAExcluir(card.campanha)}
                        >
                          <Trash size={16} aria-hidden />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog
        open={aExcluir !== null}
        onOpenChange={(aberto) => {
          if (!aberto && !excluindo) setAExcluir(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Excluir campanha?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {aExcluir
                ? t(
                    `A campanha "${aExcluir.nome}" e o histórico de envios dela serão apagados. As empresas que receberam por ela voltam a ficar disponíveis para outras campanhas. As buscas continuam salvas, mas deixam de pertencer a esta campanha. Não dá para desfazer.`,
                  )
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={excluindo}
              onClick={(evento) => {
                // O AlertDialogAction fecha por padrão; segurar aberto enquanto
                // a chamada roda evita "fechei e não sei se apagou".
                evento.preventDefault();
                void excluir();
              }}
            >
              {excluindo ? t("Excluindo…") : t("Excluir")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
