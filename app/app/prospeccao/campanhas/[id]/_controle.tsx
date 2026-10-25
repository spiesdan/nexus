"use client";

/**
 * CONTROLE DA CAMPANHA — a tela que responde "para quem foi, quem falta e
 * quais empresas ainda estão na região".
 *
 * O card da aba Campanhas é um resumo; esta rota é o lugar persistente. A
 * divisão é de propósito:
 *
 *   - enviadas: ledger com `message_id` (comprovante);
 *   - faltam: total da lista fechada (ou do público calculado) menos enviadas;
 *   - sem confirmação: linha do ledger sem `message_id` — a reserva existe,
 *     mas o envio não confirmou. Fica separado porque a ação é diferente:
 *     conferir no Inbox antes de reenviar, não sair disparando de novo.
 *
 * O botão de agendar manda só quem ainda NÃO tem linha no ledger. As reservas
 * sem comprovante ficam de fora para não duplicar mensagem; o aviso na tela
 * diz isso com todas as letras.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowsClockwise,
  Buildings,
  CalendarBlank,
  DotsThree,
  PaperPlaneTilt,
  Pause,
  Play,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";
import { resumoDosDias } from "@/components/prospeccao/DiasDaSemana";
import type { ResumoDeEnvio } from "@/lib/prospeccao/resumo-de-envio";
import {
  lerTemplatesPorCategoria,
  type TemplateDaCategoria,
} from "@/lib/prospeccao/templates-por-categoria";
import { DialogoDisparo } from "../../_disparo";

interface Janela {
  inicio: string;
  fim: string;
  dias?: number[];
}

interface CampanhaControle {
  id: string;
  nome: string;
  objetivo: string | null;
  categorias: string[] | null;
  cidades: Array<{ cidade: string; estado?: string }> | null;
  status: string;
  publico: "prospects" | "contatos";
  fonte_publico: string | null;
  prospect_ids: string[] | null;
  contato_ids: string[] | null;
  mensagens: string[] | null;
  /** 0284 — como a campanha fala, e o bind do modelo quando é o caso. */
  mensagem_tipo: string | null;
  template_name: string | null;
  template_language: string | null;
  template_contract_hash: string | null;
  template_values: Record<string, string> | null;
  /** 0285 — um modelo por categoria. Vazio = bind único legado (0284). */
  templates_por_categoria?: unknown;
  espaco_ms: number | null;
  limite_diario: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  janelas: Janela[] | null;
  agendada_em: string | null;
  ultimo_envio_at: string | null;
  ultimo_erro: string | null;
  ultimo_erro_em: string | null;
  created_at: string;
}

interface EmpresaControle {
  id: string;
  nome: string;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  categoria: string | null;
  status_comercial: string | null;
  enviado: boolean;
  sem_confirmacao: boolean;
  enviado_em: string | null;
  mensagem_indice: number | null;
  conversa_id: string | null;
  /** O que o canal confirmou depois do envio. `null` = não consultado. */
  entrega: "enviada" | "entregue" | "lida" | "falhou" | null;
  entregue_em: string | null;
  lida_em: string | null;
}

interface CidadeResumo {
  cidade: string;
  total: number;
  enviados: number;
  pendentes: number;
  sem_confirmacao: number;
}

interface PublicoPreview {
  total: number;
  truncado: boolean;
  resumo: string;
  varridas: number;
  completa: boolean;
  ja_clientes: number;
  duplicadas: number;
  para_revisar: number;
  em_campanha: number;
  categoria_a_revisar: number;
}

interface RespostaControle {
  campanha: CampanhaControle;
  tipo: "prospects" | "contatos";
  resumo: ResumoDeEnvio;
  por_cidade: CidadeResumo[];
  empresas: EmpresaControle[];
  previa_base: boolean;
  publico: PublicoPreview | null;
  audiencia_ids: string[];
}

type Filtro = "todas" | "enviadas" | "pendentes" | "sem_confirmacao" | "falhas";

function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function diaCurto(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

function situacaoDaCampanha(
  campanha: CampanhaControle,
  resumo: ResumoDeEnvio,
): { rotulo: string; variant: "success" | "warning" | "neutral" | "info" } {
  if (resumo.total > 0 && resumo.enviados >= resumo.total) {
    return { rotulo: "Concluída", variant: "success" };
  }
  switch (campanha.status) {
    case "ativa":
      return { rotulo: "Ativa", variant: "success" };
    case "pausada":
      return { rotulo: "Pausada", variant: "warning" };
    case "concluida":
      return { rotulo: "Concluída", variant: "success" };
    case "cancelada":
      return { rotulo: "Cancelada", variant: "neutral" };
    case "agendada":
      return { rotulo: "Agendada", variant: "info" };
    default:
      return { rotulo: "Rascunho", variant: "neutral" };
  }
}

function situacaoDaEmpresa(
  empresa: EmpresaControle,
  t: (s: string) => string,
): { rotulo: string; variant: "success" | "warning" | "neutral" | "error" } {
  if (empresa.enviado) {
    // "Enviada" deixou de ser o fim da história: o canal oficial confirma
    // ENTREGA e LEITURA depois do POST. Mostrar o degrau é o que separa
    // "saiu" de "chegou" — e é o que expõe o 131047 sem abrir o Inbox.
    switch (empresa.entrega) {
      case "lida":
        return { rotulo: t("Lida"), variant: "success" };
      case "entregue":
        return { rotulo: t("Entregue"), variant: "success" };
      case "falhou":
        return { rotulo: t("Falhou na entrega"), variant: "error" };
      default:
        return { rotulo: t("Enviada"), variant: "success" };
    }
  }
  if (empresa.sem_confirmacao) {
    return { rotulo: t("Reserva sem comprovante"), variant: "warning" };
  }
  return { rotulo: t("Pendente"), variant: "neutral" };
}

/** A confirmação mais adiantada que o canal já deu, com o instante dela. */
function confirmacaoDaEmpresa(
  empresa: EmpresaControle,
): { rotulo: string; em: string } | null {
  if (empresa.lida_em) return { rotulo: "Lida em", em: empresa.lida_em };
  if (empresa.entregue_em) return { rotulo: "Entregue em", em: empresa.entregue_em };
  return null;
}

function fonteRotulo(fonte: string | null, t: (s: string) => string): string {
  if (fonte === "base") return t("Base de empresas");
  if (fonte === "ambas") return t("Base + busca");
  return t("Busca no Google");
}

function agendamentoResumo(campanha: CampanhaControle, t: (s: string) => string): string {
  const partes: string[] = [];
  if (campanha.agendada_em) partes.push(t(`Agendada em ${formatarData(campanha.agendada_em)}`));
  if (campanha.data_inicio || campanha.data_fim) {
    partes.push(
      campanha.data_inicio && campanha.data_fim
        ? t(`de ${diaCurto(campanha.data_inicio)} a ${diaCurto(campanha.data_fim)}`)
        : campanha.data_inicio
          ? t(`a partir de ${diaCurto(campanha.data_inicio)}`)
          : t(`até ${diaCurto(campanha.data_fim)}`),
    );
  }
  const janelas = (campanha.janelas ?? []).filter(
    (j) => j && typeof j.inicio === "string" && typeof j.fim === "string",
  );
  if (janelas.length > 0) {
    partes.push(janelas.map((j) => `${j.inicio}–${j.fim}`).join(" · "));
    const dias = janelas.find((j) => (j.dias?.length ?? 0) > 0)?.dias;
    if (dias && dias.length > 0) partes.push(t(resumoDosDias(dias)));
  }
  if (campanha.limite_diario) partes.push(t(`até ${campanha.limite_diario}/dia`));
  return partes.length > 0 ? partes.join(" · ") : t("Sem agendamento definido");
}

export function ControleDaCampanha({ id }: { id: string }) {
  const t = useT();
  const tagIdioma = useTagDeIdioma();
  const router = useRouter();
  const [dados, setDados] = React.useState<RespostaControle | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState<string | null>(null);
  const [acao, setAcao] = React.useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = React.useState<Date | null>(null);
  const [filtro, setFiltro] = React.useState<Filtro>("todas");
  const [busca, setBusca] = React.useState("");
  const [cidade, setCidade] = React.useState("todas");
  const [limiteTabela, setLimiteTabela] = React.useState(100);
  const [disparoAberto, setDisparoAberto] = React.useState(false);
  const [excluirAberto, setExcluirAberto] = React.useState(false);
  const [liberarAberto, setLiberarAberto] = React.useState(false);

  const carregar = React.useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true);
      try {
        const resposta = await apiClient.get<{ data?: RespostaControle }>(
          `/api/v1/prospecting/campaigns/${id}/controle`,
        );
        const corpo = resposta?.data;
        if (!corpo) throw new Error(t("Resposta vazia do servidor."));
        setDados(corpo);
        setAtualizadoEm(new Date());
        setErro(null);
      } catch (e) {
        if (!silencioso) {
          setErro(e instanceof Error ? e.message : t("Não foi possível abrir a campanha."));
          showApiError(e);
        }
      } finally {
        if (!silencioso) setCarregando(false);
      }
    },
    [id, t],
  );

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  const status = dados?.campanha.status;
  const pendentes = dados?.resumo.pendentes ?? 0;
  React.useEffect(() => {
    if (status !== "ativa" && status !== "pausada") return;
    if (pendentes <= 0) return;
    const timer = setInterval(() => void carregar(true), 15_000);
    return () => clearInterval(timer);
  }, [status, pendentes, carregar]);

  const empresas = dados?.empresas ?? [];
  const cidades = dados?.por_cidade ?? [];

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return empresas
      .filter((e) => {
        if (filtro === "enviadas" && !e.enviado) return false;
        if (filtro === "pendentes" && e.enviado) return false;
        if (filtro === "sem_confirmacao" && !e.sem_confirmacao) return false;
        if (filtro === "falhas" && e.entrega !== "falhou") return false;
        if (cidade !== "todas" && (e.cidade?.trim() || "Sem cidade") !== cidade) return false;
        if (!termo) return true;
        return [e.nome, e.telefone, e.cidade, e.categoria]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(termo));
      })
      .sort((a, b) => {
        // Quem falta primeiro: é a ação. Dentro do grupo, nome.
        if (a.enviado !== b.enviado) return a.enviado ? 1 : -1;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [empresas, filtro, busca, cidade]);

  const visiveis = filtradas.slice(0, limiteTabela);

  const semReserva = React.useMemo(
    () => empresas.filter((e) => !e.enviado && !e.sem_confirmacao),
    [empresas],
  );
  const semConfirmacao = empresas.filter((e) => e.sem_confirmacao);
  const situacao = dados ? situacaoDaCampanha(dados.campanha, dados.resumo) : null;
  const podePausar = dados?.campanha.status === "ativa" && (dados?.resumo.pendentes ?? 0) > 0;
  const podeRetomar = dados?.campanha.status === "pausada";

  function trocarFiltro(novo: Filtro) {
    setFiltro(novo);
    setLimiteTabela(100);
  }

  function limparFiltros() {
    setBusca("");
    setCidade("todas");
    setFiltro("todas");
    setLimiteTabela(100);
  }

  async function alternarPausa() {
    if (!dados) return;
    setAcao("pausa");
    try {
      await apiClient.patch(`/api/v1/prospecting/campaigns/${id}`, {
        status: podePausar ? "pausada" : "ativa",
      });
      toast.success(podePausar ? t("Campanha pausada.") : t("Campanha retomada."));
      await carregar(true);
    } catch (e) {
      showApiError(e);
    } finally {
      setAcao(null);
    }
  }

  async function excluir() {
    setAcao("excluir");
    try {
      await apiClient.delete(`/api/v1/prospecting/campaigns/${id}`);
      toast.success(t("Campanha excluída."));
      router.push("/app/prospeccao?aba=campanhas");
    } catch (e) {
      showApiError(e);
    } finally {
      setAcao(null);
    }
  }

  async function liberarReservas() {
    setAcao("liberar");
    try {
      const resposta = await apiClient.post<{ data?: { liberadas?: number } }>(
        `/api/v1/prospecting/campaigns/${id}/liberar-reservas`,
        {},
      );
      const liberadas = resposta?.data?.liberadas ?? 0;
      toast.success(t(`${liberadas} reservas liberadas. Agende o envio de novo.`));
      setLiberarAberto(false);
      await carregar(true);
    } catch (e) {
      showApiError(e);
    } finally {
      setAcao(null);
    }
  }

  if (carregando && !dados) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (erro || !dados || !situacao) {
    return (
      <div className="p-4 md:p-6">
        <NexusErrorState
          title={t("Não foi possível abrir a campanha")}
          description={erro ?? t("Tente novamente em instantes.")}
          onRetry={() => void carregar()}
        />
      </div>
    );
  }

  const total = dados.resumo.total;
  const enviados = dados.resumo.enviados;
  const faltam = dados.resumo.pendentes;
  const percentual = dados.resumo.percentual;
  const ehContatos = dados.tipo === "contatos";
  const ehTemplate = dados.campanha.mensagem_tipo === "template";
  /**
   * 0285 — os modelos por categoria. O array vazio é campanha antiga (ou sem
   * recorte): a tela cai no bind único da 0284, do mesmo jeito que o motor.
   */
  const binds: TemplateDaCategoria[] = lerTemplatesPorCategoria(
    dados.campanha.templates_por_categoria,
  );
  const podeDisparar = !ehContatos && semReserva.length > 0;
  const modoInicial =
    semReserva.length > 20 || Boolean(dados.campanha.agendada_em) ? "agendar" : "agora";

  return (
    <div className="space-y-5 p-4 md:p-6">
      <NexusPageHeader
        navigation={
          <Link
            href="/app/prospeccao?aba=campanhas"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} aria-hidden />
            {t("Campanhas")}
          </Link>
        }
        title={dados.campanha.nome}
        subtitle={t("Controle de envio, público e empresas da campanha.")}
        actions={
          <>
            {podeDisparar && (
              <Button type="button" onClick={() => setDisparoAberto(true)}>
                {modoInicial === "agora" ? (
                  <PaperPlaneTilt size={16} aria-hidden />
                ) : (
                  <CalendarBlank size={16} aria-hidden />
                )}
                {modoInicial === "agora"
                  ? t(`Enviar agora (${semReserva.length})`)
                  : t(`Agendar envio (${semReserva.length})`)}
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => void carregar()}
              disabled={carregando}
              aria-label={t("Atualizar")}
              title={t("Atualizar")}
            >
              <ArrowsClockwise size={16} className={carregando ? "animate-spin" : ""} aria-hidden />
            </Button>
            {(podePausar || podeRetomar) && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void alternarPausa()}
                disabled={acao === "pausa"}
              >
                {podePausar ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
                {podePausar ? t("Pausar") : t("Retomar")}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="icon" variant="ghost" aria-label={t("Mais ações")}>
                  <DotsThree size={20} weight="bold" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setExcluirAberto(true)}
                >
                  <Trash size={16} aria-hidden />
                  {t("Excluir campanha")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={situacao.variant}>{situacao.rotulo}</Badge>
        <Badge variant="neutral">{fonteRotulo(dados.campanha.fonte_publico, t)}</Badge>
        {ehContatos && <Badge variant="info">{t("Recuperação")}</Badge>}
      </div>

      {dados.campanha.ultimo_erro && (
        <Card className="flex items-start gap-3 border-destructive/40 bg-destructive/5 p-4 text-sm">
          <WarningCircle size={18} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-destructive">{t("Último erro da campanha")}</p>
            <p className="whitespace-pre-wrap">{dados.campanha.ultimo_erro}</p>
            {dados.campanha.ultimo_erro_em && (
              <p className="text-xs text-muted-foreground">
                {t(`Registrado em ${formatarData(dados.campanha.ultimo_erro_em)}`)}
              </p>
            )}
          </div>
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-2xl font-semibold tabular-nums">{enviados}</span>
              <span className="text-sm text-muted-foreground">{t(`de ${total} enviadas`)}</span>
              {faltam > 0 ? (
                <Badge variant="neutral">{t(`${faltam} pendentes`)}</Badge>
              ) : (
                <Badge variant="success">{t("Todas enviadas")}</Badge>
              )}
              {dados.resumo.sem_confirmacao > 0 && (
                <Badge variant="warning">
                  {t(`${dados.resumo.sem_confirmacao} sem comprovante`)}
                </Badge>
              )}
              {dados.resumo.entregues > 0 && (
                <Badge variant="info">{t(`${dados.resumo.entregues} entregues`)}</Badge>
              )}
              {dados.resumo.lidos > 0 && (
                <Badge variant="success">{t(`${dados.resumo.lidos} lidas`)}</Badge>
              )}
              {dados.resumo.falhas > 0 && (
                <Badge variant="error">
                  {t(`${dados.resumo.falhas} falharam na entrega`)}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {dados.previa_base
                ? dados.resumo.enviados > 0
                  ? t("Público calculado agora + envios já realizados.")
                  : t("Público calculado agora, ainda sem reserva.")
                : t(`${total} empresas na lista da campanha.`)}
            </p>
          </div>
          <div className="space-y-0.5 text-xs text-muted-foreground sm:text-right">
            <p>
              {dados.resumo.ultimo_envio_at
                ? t(`Último envio em ${formatarData(dados.resumo.ultimo_envio_at)}`)
                : t("Nenhum envio confirmado ainda")}
            </p>
            {atualizadoEm && (
              <p>
                {t(
                  `Atualizado às ${atualizadoEm.toLocaleTimeString(tagIdioma, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`,
                )}
              </p>
            )}
          </div>
        </div>
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentual}
          aria-label={t("Progresso do envio")}
        >
          <div
            className="h-full rounded-full bg-success transition-[width] duration-500"
            style={{ width: `${percentual}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{percentual}%</span>
          <span>{fonteRotulo(dados.campanha.fonte_publico, t)}</span>
        </div>
        {!ehContatos && !podeDisparar && faltam > 0 && (
          <p className="rounded-lg border border-warning/40 bg-warning-bg p-2 text-xs text-warning-fg">
            {t(
              "Só há reservas sem comprovante. Confira o Inbox antes de liberar e agendar de novo.",
            )}
          </p>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <aside className="min-w-0 space-y-3 xl:order-2">
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t("Mensagens e agenda")}</h2>
              <Badge variant="neutral">
                {ehTemplate
                  ? binds.length > 1
                    ? t(`${binds.length} modelos`)
                    : t("Modelo")
                  : (dados.campanha.mensagens ?? []).length}
              </Badge>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("Agenda")}
              </p>
              <p className="mt-1 text-sm">{agendamentoResumo(dados.campanha, t)}</p>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {ehTemplate ? t("Modelo aprovado") : t("Mensagens")}
              </p>
              {ehTemplate ? (
                binds.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "Cada categoria usa o próprio modelo aprovado. O texto e os parâmetros são interpolados por empresa.",
                      )}
                    </p>
                    <ul className="space-y-1.5">
                      {binds.map((bind) => (
                        <li
                          key={bind.categoria}
                          className="rounded-lg border bg-muted/20 p-2.5 text-sm"
                        >
                          <p className="font-medium">{bind.categoria}</p>
                          <p className="text-xs text-muted-foreground">
                            {bind.name}
                            {bind.language ? ` (${bind.language})` : ""}
                            {Object.keys(bind.values).length > 0
                              ? ` · ${Object.keys(bind.values).length} ${t("parâmetros")}`
                              : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm font-medium">
                      {dados.campanha.template_name ?? "—"}
                      {dados.campanha.template_language
                        ? ` (${dados.campanha.template_language})`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "O texto e os parâmetros vêm do modelo aprovado no canal oficial; os valores abaixo são interpolados por empresa.",
                      )}
                    </p>
                    {Object.entries(dados.campanha.template_values ?? {}).length > 0 && (
                      <dl className="space-y-1 rounded-lg border bg-muted/20 p-2.5 text-sm">
                        {Object.entries(dados.campanha.template_values ?? {}).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <dt className="shrink-0 font-mono text-xs text-muted-foreground">
                              {k}
                            </dt>
                            <dd className="min-w-0 truncate">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )
              ) : (dados.campanha.mensagens ?? []).length === 0 ? (
                <p className="mt-1 text-sm text-warning-fg">
                  {t("Nenhuma mensagem salva. Ao enviar ou agendar, escreva a primeira.")}
                </p>
              ) : (
                <ol className="mt-2 space-y-2">
                  {(dados.campanha.mensagens ?? []).map((m, i) => (
                    <li key={i} className="rounded-lg border bg-muted/20 p-2.5 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">{i + 1}</span>
                      <p className="mt-1 line-clamp-4 whitespace-pre-wrap">{m}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>
        </aside>

        <div className="min-w-0 space-y-4 xl:order-1">
          {ehContatos && (
            <Card className="border-info/40 bg-info-bg p-4 text-sm text-info-fg">
              <p className="font-medium">{t("Esta é uma campanha de recuperação de contatos.")}</p>
              <p className="mt-1 opacity-80">
                {t(
                  "O acompanhamento e o envio são feitos pela Venda Automática. Esta tela mostra o andamento do ledger, mas não reagenda contatos por aqui.",
                )}
              </p>
            </Card>
          )}

          {dados.previa_base && (
            <Card className="border-warning/40 bg-warning-bg p-3 text-xs text-warning-fg">
              <div className="flex items-start gap-2">
                <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
                <div className="space-y-1">
                  <p className="font-medium">
                    {dados.resumo.enviados > 0
                      ? t("Público calculado agora + envios já realizados.")
                      : t("Prévia do público — nada reservado ainda.")}
                  </p>
                  <p className="opacity-90">{dados.publico?.resumo}</p>
                  {dados.resumo.enviados > 0 && (
                    <p className="opacity-90">
                      {t(
                        "A lista desta campanha ainda não foi fechada. Os envios confirmados aparecem abaixo; o restante ainda não foi reservado.",
                      )}
                    </p>
                  )}
                  {dados.publico?.truncado && (
                    <p className="opacity-90">
                      {t(
                        "A prévia mostra as primeiras 500 empresas. O agendamento usará esta lista.",
                      )}
                    </p>
                  )}
                  <p className="opacity-90">
                    {t(
                      "Ao agendar, as empresas ainda pendentes ficam reservadas para esta campanha e saem do público das outras.",
                    )}
                  </p>
                  {(dados.publico?.ja_clientes ?? 0) +
                    (dados.publico?.duplicadas ?? 0) +
                    (dados.publico?.em_campanha ?? 0) +
                    (dados.publico?.categoria_a_revisar ?? 0) >
                    0 && (
                    <p className="opacity-90">
                      {t("Fora da fila")}: {dados.publico?.ja_clientes ?? 0} {t("clientes")} ·{" "}
                      {dados.publico?.duplicadas ?? 0} {t("duplicadas")} ·{" "}
                      {dados.publico?.em_campanha ?? 0} {t("em outra campanha")} ·{" "}
                      {dados.publico?.categoria_a_revisar ?? 0} {t("categoria a revisar")}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}

          {semConfirmacao.length > 0 && (
            <Card className="border-error/40 bg-error-bg p-3 text-sm text-error-fg">
              <div className="flex items-start gap-2">
                <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
                <div>
                  <p className="font-medium">
                    {t(
                      `${semConfirmacao.length} empresas com reserva, mas sem comprovante de envio.`,
                    )}
                  </p>
                  <p className="mt-1 text-xs opacity-90">
                    {t(
                      "Elas não entram no novo agendamento para não duplicar mensagem. Confira no Inbox se a mensagem saiu; se não saiu, libere as reservas e agende de novo.",
                    )}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 border-error/40 bg-surface text-error-fg hover:bg-error-bg"
                    onClick={() => setLiberarAberto(true)}
                    disabled={acao === "liberar"}
                  >
                    {t("Liberar reservas sem comprovante")}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {cidades.length > 0 && (
            <Card className="space-y-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Buildings size={16} className="text-muted-foreground" aria-hidden />
                  {t("Por cidade")}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {cidades.length === 1 ? t("1 cidade") : t(`${cidades.length} cidades`)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={cidade === "todas"}
                  onClick={() => {
                    setCidade("todas");
                    setLimiteTabela(100);
                  }}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                    cidade === "todas"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {t("Todas")}
                  <span className="tabular-nums opacity-80">{empresas.length}</span>
                </button>
                {cidades.map((c) => {
                  const ativa = cidade === c.cidade;
                  return (
                    <button
                      key={c.cidade}
                      type="button"
                      aria-pressed={ativa}
                      onClick={() => {
                        setCidade(ativa ? "todas" : c.cidade);
                        setLimiteTabela(100);
                      }}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                        ativa
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                      title={
                        c.sem_confirmacao > 0
                          ? t(`${c.sem_confirmacao} sem comprovante nesta cidade`)
                          : undefined
                      }
                    >
                      <span>{c.cidade}</span>
                      <span className="tabular-nums opacity-80">
                        {c.enviados}/{c.total}
                      </span>
                      {c.sem_confirmacao > 0 && (
                        <span className="opacity-80">· {c.sem_confirmacao} sem comprovante</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">{t("Empresas da campanha")}</h2>
                <Badge variant="neutral">{empresas.length}</Badge>
                <div className="ml-auto flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={filtro === "todas"}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      filtro === "todas" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                    onClick={() => trocarFiltro("todas")}
                  >
                    {t("Todas")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={filtro === "pendentes"}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      filtro === "pendentes"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => trocarFiltro("pendentes")}
                  >
                    {t("Pendentes")} {faltam}
                  </button>
                  <button
                    type="button"
                    aria-pressed={filtro === "enviadas"}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      filtro === "enviadas"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => trocarFiltro("enviadas")}
                  >
                    {t("Enviadas")} {enviados}
                  </button>
                  <button
                    type="button"
                    aria-pressed={filtro === "sem_confirmacao"}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      filtro === "sem_confirmacao"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => trocarFiltro("sem_confirmacao")}
                  >
                    {t("Sem comprovante")} {dados.resumo.sem_confirmacao}
                  </button>
                  {dados.resumo.falhas > 0 && (
                    <button
                      type="button"
                      aria-pressed={filtro === "falhas"}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        filtro === "falhas"
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => trocarFiltro("falhas")}
                    >
                      {t("Falhas na entrega")} {dados.resumo.falhas}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setLimiteTabela(100);
                  }}
                  placeholder={t("Buscar por nome, telefone ou categoria…")}
                  className="sm:max-w-xs"
                />
                {(busca || cidade !== "todas" || filtro !== "todas") && (
                  <Button type="button" size="sm" variant="ghost" onClick={limparFiltros}>
                    {t("Limpar filtros")}
                  </Button>
                )}
              </div>
            </div>

            {empresas.length === 0 ? (
              <div className="space-y-2 p-8 text-center text-sm text-muted-foreground">
                <p>
                  {ehContatos
                    ? t("Nenhum contato encontrado para esta campanha.")
                    : dados.campanha.fonte_publico === "busca"
                      ? t("Nenhuma empresa encontrada ainda. A busca pode estar em andamento.")
                      : t("Nenhuma empresa no público desta campanha.")}
                </p>
                <Button size="sm" variant="outline" asChild>
                  <Link
                    href={ehContatos ? "/app/venda-automatica" : "/app/prospeccao?aba=empresas"}
                  >
                    {ehContatos ? t("Abrir Venda Automática") : t("Ver empresas da base")}
                  </Link>
                </Button>
              </div>
            ) : filtradas.length === 0 ? (
              <div className="space-y-2 p-8 text-center text-sm text-muted-foreground">
                <p>{t("Nenhuma empresa com esse filtro.")}</p>
                <Button type="button" size="sm" variant="outline" onClick={limparFiltros}>
                  {t("Limpar filtros")}
                </Button>
              </div>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="px-4 py-2">{t("Empresa")}</TableHead>
                        <TableHead className="px-4 py-2">{t("Cidade")}</TableHead>
                        <TableHead className="px-4 py-2">{t("Situação")}</TableHead>
                        <TableHead className="px-4 py-2">{t("Enviada em")}</TableHead>
                        <TableHead className="px-4 py-2">{t("Conversa")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visiveis.map((e) => {
                        const situacaoEmpresa = situacaoDaEmpresa(e, t);
                        const confirmacao = confirmacaoDaEmpresa(e);
                        return (
                          <TableRow key={e.id}>
                            <TableCell className="max-w-[320px] px-4 py-2">
                              <p className="truncate font-medium text-foreground">{e.nome}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {[e.categoria, e.telefone].filter(Boolean).join(" · ") ||
                                  t("Sem detalhes")}
                                {e.mensagem_indice !== null
                                  ? ` · ${t(`Mensagem ${e.mensagem_indice + 1}`)}`
                                  : ""}
                              </p>
                            </TableCell>
                            <TableCell className="px-4 py-2 whitespace-nowrap">
                              {e.cidade ? `${e.cidade}${e.estado ? `/${e.estado}` : ""}` : "—"}
                            </TableCell>
                            <TableCell className="px-4 py-2 whitespace-nowrap">
                              <Badge variant={situacaoEmpresa.variant}>
                                {situacaoEmpresa.rotulo}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                              <span className="block">{formatarData(e.enviado_em)}</span>
                              {confirmacao && (
                                <span className="block text-xs">
                                  {t(`${confirmacao.rotulo} ${formatarData(confirmacao.em)}`)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-2 whitespace-nowrap">
                              {e.conversa_id ? (
                                <Link
                                  href={`/app/inbox?id=${e.conversa_id}`}
                                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                                >
                                  {t("Abrir Inbox")}
                                </Link>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <ul className="divide-y md:hidden">
                  {visiveis.map((e) => {
                    const situacaoEmpresa = situacaoDaEmpresa(e, t);
                    const confirmacao = confirmacaoDaEmpresa(e);
                    return (
                      <li key={e.id} className="space-y-1.5 p-3">
                        <p className="truncate font-medium">{e.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[e.categoria, e.telefone].filter(Boolean).join(" · ") ||
                            t("Sem detalhes")}
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={situacaoEmpresa.variant}>
                              {situacaoEmpresa.rotulo}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {e.cidade ? `${e.cidade}${e.estado ? `/${e.estado}` : ""}` : "—"}
                              {e.enviado_em ? ` · ${formatarData(e.enviado_em)}` : ""}
                              {confirmacao
                                ? ` · ${t(confirmacao.rotulo)} ${formatarData(confirmacao.em)}`
                                : ""}
                            </span>
                          </div>
                          {e.conversa_id ? (
                            <Link
                              href={`/app/inbox?id=${e.conversa_id}`}
                              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                            >
                              {t("Abrir Inbox")}
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-xs text-muted-foreground">
                  <span>{t(`Mostrando ${visiveis.length} de ${filtradas.length}`)}</span>
                  {visiveis.length < filtradas.length && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setLimiteTabela((n) => n + 100)}
                    >
                      {t("Mostrar mais")}
                    </Button>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      {disparoAberto && (
        <DialogoDisparo
          key={`${id}-${semReserva.length}`}
          ids={semReserva.map((e) => e.id)}
          aberto={disparoAberto}
          onFechar={() => setDisparoAberto(false)}
          onConcluido={() => {
            setDisparoAberto(false);
            void carregar(true);
          }}
          campanhaId={id}
          mensagensIniciais={dados.campanha.mensagens ?? []}
          mensagemTipo={ehTemplate ? "template" : "texto"}
          templateNome={dados.campanha.template_name}
          templateIdioma={dados.campanha.template_language}
          templatesPorCategoria={binds.map((b) => ({
            categoria: b.categoria,
            name: b.name,
            language: b.language,
          }))}
          agendaInicial={dados.campanha}
          modoInicial={modoInicial}
          prospectIdsDaCampanha={dados.audiencia_ids}
        />
      )}

      <AlertDialog open={excluirAberto} onOpenChange={setExcluirAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Excluir campanha?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "O histórico de envios e as reservas desta campanha serão apagados. As empresas voltam a aparecer no público das outras campanhas.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acao === "excluir"}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={acao === "excluir"}
              onClick={(e) => {
                e.preventDefault();
                void excluir();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("Excluir")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={liberarAberto} onOpenChange={setLiberarAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Liberar reservas sem comprovante?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Isto apaga apenas as reservas que não têm comprovante de envio. As mensagens confirmadas ficam intactas. Só faça isso depois de conferir no Inbox que a mensagem não saiu — liberar uma reserva cuja mensagem saiu manda de novo para a pessoa.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acao === "liberar"}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={acao === "liberar"}
              onClick={(e) => {
                e.preventDefault();
                void liberarReservas();
              }}
            >
              {acao === "liberar" ? t("Liberando…") : t("Liberar reservas")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
