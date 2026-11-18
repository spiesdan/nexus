"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";
import { ALVOS_DE_GESTOR, TRANSICOES } from "@/lib/sentinel/estado";
import {
  PESO_SEVERIDADE,
  type EstadoOcorrencia,
  type Recomendacao,
  type Severidade,
} from "@/lib/sentinel/tipos";
import {
  ArrowSquareOut,
  CheckCircle,
  CircleNotch,
  Gear,
  Play,
  ShieldCheck,
  Warning,
} from "@/lib/ui/icons";

import type {
  ConfiguracaoSentinelCliente,
  DetalheSentinel,
  ExecucaoSentinel,
  OcorrenciaSentinel,
} from "./_tipos";

const TERMINAIS = new Set<EstadoOcorrencia>(["corrigida", "ignorada", "encerrada"]);

const ROTULO_ESTADO: Record<EstadoOcorrencia, string> = {
  nova: "Nova",
  investigando: "Investigando",
  acao_necessaria: "Ação necessária",
  aprovada: "Aprovada",
  corrigida: "Corrigida",
  ignorada: "Ignorada",
  recorrente: "Recorrente",
  encerrada: "Encerrada",
};

const ROTULO_SEVERIDADE: Record<Severidade, string> = {
  info: "Info",
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

const VARIANTE_SEVERIDADE: Record<
  Severidade,
  "neutral" | "info" | "warning" | "error"
> = {
  info: "neutral",
  baixa: "neutral",
  media: "info",
  alta: "warning",
  critica: "error",
};

const VARIANTE_ESTADO: Record<
  EstadoOcorrencia,
  "default" | "neutral" | "success" | "warning" | "error" | "info"
> = {
  nova: "default",
  investigando: "info",
  acao_necessaria: "warning",
  aprovada: "info",
  corrigida: "success",
  ignorada: "neutral",
  recorrente: "warning",
  encerrada: "neutral",
};

function quando(iso: string | null, tag: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Intl.DateTimeFormat(tag, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(ms));
}

function duracao(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1_000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

/**
 * Ocorrências anteriores à v1.1 têm `{}`; não invente plano na tela.
 *
 * O motor só persiste plano validado, mas a tela lê o banco: uma linha antiga
 * ou editada à mão não pode branquear o detalhe inteiro. Plano incompleto vira
 * "sem plano" (a evidência continua visível), nunca exceção de render.
 */
function planoDe(ocorrencia: OcorrenciaSentinel): Recomendacao | null {
  const bruto = ocorrencia.recomendacao;
  if (!bruto || typeof bruto !== "object") return null;
  const r = bruto as Partial<Recomendacao>;
  if (typeof r.resumo !== "string" || r.resumo.trim().length < 8) return null;
  if (!Array.isArray(r.passos) || r.passos.length === 0) return null;
  if (!r.passos.every((p) => typeof p === "string")) return null;
  if (!Array.isArray(r.campos_pendentes)) return null;
  if (!["baixo", "medio", "alto"].includes(r.risco as string)) return null;
  if (!["reversivel", "parcial", "irreversivel"].includes(r.reversibilidade as string)) {
    return null;
  }
  if (!["alta", "media", "baixa"].includes(r.confianca as string)) return null;
  if (typeof r.exige_aprovacao !== "boolean") return null;
  if (!Array.isArray(r.fonte) || r.fonte.length === 0) return null;
  if (r.limitacao !== null && typeof r.limitacao !== "string") return null;
  return r as Recomendacao;
}

const ROTULO_RISCO: Record<Recomendacao["risco"], string> = {
  baixo: "Risco baixo",
  medio: "Risco médio",
  alto: "Risco alto",
};

const ROTULO_REVERSIBILIDADE: Record<Recomendacao["reversibilidade"], string> = {
  reversivel: "Reversível",
  parcial: "Parcialmente reversível",
  irreversivel: "Irreversível",
};

const VARIANTE_RISCO: Record<
  Recomendacao["risco"],
  "success" | "warning" | "error"
> = {
  baixo: "success",
  medio: "warning",
  alto: "error",
};

export function SentinelClient({
  ocorrencias,
  execucoes,
  configuracao,
  linhaDeConfiguracaoExiste,
  ambienteLigado,
  podeAgir,
  podeGerir,
}: {
  ocorrencias: OcorrenciaSentinel[];
  execucoes: ExecucaoSentinel[];
  configuracao: ConfiguracaoSentinelCliente;
  linhaDeConfiguracaoExiste: boolean;
  ambienteLigado: boolean;
  podeAgir: boolean;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const tagDeIdioma = useTagDeIdioma();
  const [busca, setBusca] = React.useState("");
  const [estadoFiltro, setEstadoFiltro] = React.useState("abertas");
  const [severidadeFiltro, setSeveridadeFiltro] = React.useState("todas");
  const [categoriaFiltro, setCategoriaFiltro] = React.useState("todas");

  const [detalhe, setDetalhe] = React.useState<DetalheSentinel | null>(null);
  const [abrindo, setAbrindo] = React.useState(false);
  const [acao, setAcao] = React.useState<{
    ocorrencia: OcorrenciaSentinel;
    para: EstadoOcorrencia;
  } | null>(null);
  const [motivo, setMotivo] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [rodando, setRodando] = React.useState(false);

  const [configAberta, setConfigAberta] = React.useState(false);
  const [config, setConfig] = React.useState(configuracao);
  const [salvandoConfig, setSalvandoConfig] = React.useState(false);

  const ultima = execucoes[0];
  const configDesligada = !ambienteLigado || !config.ativo;

  const contagem = React.useMemo(() => {
    const abertas = ocorrencias.filter((o) => !TERMINAIS.has(o.estado));
    return {
      abertas: abertas.length,
      criticas: abertas.filter((o) => o.severidade === "critica" || o.severidade === "alta")
        .length,
      acao: abertas.filter((o) => o.estado === "acao_necessaria").length,
      recorrentes: abertas.filter((o) => o.estado === "recorrente").length,
    };
  }, [ocorrencias]);

  const filtradas = React.useMemo(() => {
    const texto = busca.trim().toLowerCase();
    return ocorrencias
      .filter((o) => {
        if (estadoFiltro === "abertas" && TERMINAIS.has(o.estado)) return false;
        if (estadoFiltro === "fechadas" && !TERMINAIS.has(o.estado)) return false;
        if (
          estadoFiltro !== "abertas" &&
          estadoFiltro !== "fechadas" &&
          estadoFiltro !== "todas" &&
          o.estado !== estadoFiltro
        ) {
          return false;
        }
        if (severidadeFiltro !== "todas" && o.severidade !== severidadeFiltro) return false;
        if (categoriaFiltro !== "todas" && o.categoria !== categoriaFiltro) return false;
        if (texto === "") return true;
        const alvo = `${o.titulo} ${o.resumo ?? ""} ${o.regra} ${o.entidade_id}`.toLowerCase();
        return alvo.includes(texto);
      })
      .sort((a, b) => {
        const peso = PESO_SEVERIDADE[b.severidade] - PESO_SEVERIDADE[a.severidade];
        if (peso !== 0) return peso;
        return Date.parse(b.ultima_vista_em) - Date.parse(a.ultima_vista_em);
      });
  }, [ocorrencias, busca, estadoFiltro, severidadeFiltro, categoriaFiltro]);

  async function abrirDetalhe(ocorrencia: OcorrenciaSentinel) {
    setDetalhe(null);
    setAbrindo(true);
    try {
      const resp = await apiClient.get<{ data: DetalheSentinel }>(
        `/api/v1/sentinel/occurrences/${ocorrencia.id}`,
      );
      setDetalhe(resp.data);
    } catch (erro) {
      showApiError(erro);
      setDetalhe({ ocorrencia, eventos: [], regra_descricao: null });
    } finally {
      setAbrindo(false);
    }
  }

  async function executarAgora() {
    setRodando(true);
    try {
      const resp = await apiClient.post<{
        data: {
          status: string;
          achados: number;
          criadas: number;
          encerradas: number;
          truncado: boolean;
        };
      }>("/api/v1/sentinel/scan", {});
      const r = resp.data;
      nexusToast.success(
        r.truncado
          ? `Varredura concluída (truncada): ${r.criadas} nova(s), ${r.encerradas} encerrada(s).`
          : `Varredura concluída: ${r.criadas} nova(s), ${r.encerradas} encerrada(s).`,
      );
      router.refresh();
    } catch (erro) {
      showApiError(erro);
    } finally {
      setRodando(false);
    }
  }

  async function confirmarAcao() {
    if (!acao) return;
    setSalvando(true);
    try {
      await apiClient.patch(`/api/v1/sentinel/occurrences/${acao.ocorrencia.id}`, {
        estado: acao.para,
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      });
      nexusToast.success(`Ocorrência marcada como ${ROTULO_ESTADO[acao.para].toLowerCase()}.`);
      setAcao(null);
      setMotivo("");
      if (detalhe?.ocorrencia.id === acao.ocorrencia.id) {
        await abrirDetalhe({ ...detalhe.ocorrencia, estado: acao.para });
      }
      router.refresh();
    } catch (erro) {
      showApiError(erro);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarConfig() {
    setSalvandoConfig(true);
    try {
      const resp = await apiClient.patch<{
        data: { configuracao: ConfiguracaoSentinelCliente };
      }>("/api/v1/sentinel/settings", {
        ativo: config.ativo,
        intervalo_minutos: config.intervaloMinutos,
        retencao_dias: config.retencaoDias,
        limite_ocorrencias: config.limiteOcorrencias,
        detectores_desativados: config.detectoresDesativados,
      });
      setConfig(resp.data.configuracao);
      setConfigAberta(false);
      nexusToast.success("Configuração do Sentinel salva.");
      router.refresh();
    } catch (erro) {
      showApiError(erro);
    } finally {
      setSalvandoConfig(false);
    }
  }

  const alvosPermitidos = (ocorrencia: OcorrenciaSentinel): EstadoOcorrencia[] =>
    TRANSICOES[ocorrencia.estado].filter(
      (para) => podeGerir || !ALVOS_DE_GESTOR.includes(para),
    );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <NexusPageHeader
        title="Sentinel"
        subtitle="O que está inconsistente na operação, com evidência e causa provável. Observa — não corrige sozinho."
        actions={
          <>
            {podeGerir ? (
              <Button variant="outline" onClick={() => setConfigAberta(true)}>
                <Gear className="size-4" aria-hidden />
                Configurações
              </Button>
            ) : null}
            {podeGerir ? (
              <Button onClick={executarAgora} disabled={rodando || configDesligada}>
                {rodando ? (
                  <CircleNotch className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Play className="size-4" aria-hidden />
                )}
                {rodando ? "Varrendo…" : "Executar agora"}
              </Button>
            ) : null}
          </>
        }
      />

      {configDesligada ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning-bg bg-warning-bg/40 p-4 text-sm">
          <Warning className="mt-0.5 size-5 shrink-0 text-warning-fg" aria-hidden />
          <div>
            <p className="font-medium text-text">
              {!ambienteLigado
                ? "O Sentinel está desligado nesta instalação."
                : "O Sentinel está desligado para esta organização."}
            </p>
            <p className="text-text-muted">
              {!ambienteLigado
                ? "SENTINEL_ENABLED=false no .env. O histórico continua visível."
                : "Ligue em Configurações › Sentinel para voltar a varrer. O histórico continua visível."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador rotulo="Abertas" valor={contagem.abertas} detalhe="não encerradas" />
        <Indicador
          rotulo="Alta prioridade"
          valor={contagem.criticas}
          detalhe="críticas e altas"
          tom={contagem.criticas > 0 ? "erro" : undefined}
        />
        <Indicador rotulo="Ação necessária" valor={contagem.acao} detalhe="esperando decisão" />
        <Indicador rotulo="Recorrentes" valor={contagem.recorrentes} detalhe="já aconteceram antes" />
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-5 text-accent" aria-hidden />
              Ocorrências
            </CardTitle>
            <p className="text-xs text-text-muted">
              {ultima
                ? `Última varredura: ${quando(ultima.iniciado_em, tagDeIdioma)} · ${ultima.status} · ${duracao(ultima.duracao_ms)} · ${ultima.achados} achado(s)`
                : "Nenhuma varredura registrada ainda."}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por título, regra ou id…"
              aria-label="Buscar ocorrência"
            />
            <Select value={estadoFiltro} onValueChange={setEstadoFiltro}>
              <SelectTrigger aria-label="Filtrar por estado">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="abertas">Abertas</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="fechadas">Fechadas</SelectItem>
                {(
                  [
                    "nova",
                    "investigando",
                    "acao_necessaria",
                    "aprovada",
                    "recorrente",
                    "corrigida",
                    "ignorada",
                    "encerrada",
                  ] as const
                ).map((e) => (
                  <SelectItem key={e} value={e}>
                    {ROTULO_ESTADO[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severidadeFiltro} onValueChange={setSeveridadeFiltro}>
              <SelectTrigger aria-label="Filtrar por severidade">
                <SelectValue placeholder="Severidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Toda severidade</SelectItem>
                {(["critica", "alta", "media", "baixa", "info"] as const).map((s) => (
                  <SelectItem key={s} value={s}>
                    {ROTULO_SEVERIDADE[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
              <SelectTrigger aria-label="Filtrar por categoria">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Toda categoria</SelectItem>
                <SelectItem value="fiscal">Fiscal</SelectItem>
                <SelectItem value="operacao">Operação</SelectItem>
                <SelectItem value="financeiro">Financeiro</SelectItem>
                <SelectItem value="campanha">Campanha</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {filtradas.length === 0 ? (
            <NexusEmptyState
              icon={CheckCircle}
              headline={ocorrencias.length === 0 ? "Nenhuma ocorrência ainda" : "Nada com esse filtro"}
              subcopy={
                ocorrencias.length === 0
                  ? "Execute uma varredura para conferir notas, pedidos, estoque, recebíveis, filas e campanhas."
                  : "Ajuste os filtros para ver outras ocorrências."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">Severidade</TableHead>
                    <TableHead>Ocorrência</TableHead>
                    <TableHead className="hidden md:table-cell">Categoria</TableHead>
                    <TableHead className="w-[150px]">Estado</TableHead>
                    <TableHead className="hidden lg:table-cell">Última vez</TableHead>
                    <TableHead className="w-[90px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Badge variant={VARIANTE_SEVERIDADE[o.severidade]}>
                          {ROTULO_SEVERIDADE[o.severidade]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => void abrirDetalhe(o)}
                        >
                          <span className="block font-medium text-text hover:underline">
                            {o.titulo}
                          </span>
                          <span className="block text-xs text-text-muted">
                            {o.regra}
                            {o.vezes_vista > 1 ? ` · vista ${o.vezes_vista}×` : ""}
                            {o.recorrencias > 0 ? ` · já ocorreu ${o.recorrencias}×` : ""}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="hidden capitalize text-text-muted md:table-cell">
                        {o.categoria}
                      </TableCell>
                      <TableCell>
                        <Badge variant={VARIANTE_ESTADO[o.estado]}>{ROTULO_ESTADO[o.estado]}</Badge>
                      </TableCell>
                      <TableCell className="hidden text-xs text-text-muted lg:table-cell">
                        {quando(o.ultima_vista_em, tagDeIdioma)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => void abrirDetalhe(o)}>
                          Abrir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={detalhe !== null || abrindo} onOpenChange={(aberto) => !aberto && setDetalhe(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {abrindo || !detalhe ? (
            <div className="flex items-center gap-2 py-8 text-sm text-text-muted">
              <CircleNotch className="size-4 animate-spin" aria-hidden />
              Abrindo ocorrência…
              <DialogTitle className="sr-only">Abrindo ocorrência</DialogTitle>
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={VARIANTE_SEVERIDADE[detalhe.ocorrencia.severidade]}>
                    {ROTULO_SEVERIDADE[detalhe.ocorrencia.severidade]}
                  </Badge>
                  <Badge variant={VARIANTE_ESTADO[detalhe.ocorrencia.estado]}>
                    {ROTULO_ESTADO[detalhe.ocorrencia.estado]}
                  </Badge>
                  <span className="text-xs text-text-muted">{detalhe.ocorrencia.regra}</span>
                </div>
                <DialogTitle className="text-pretty">{detalhe.ocorrencia.titulo}</DialogTitle>
                <DialogDescription className="text-pretty">
                  {detalhe.regra_descricao ?? detalhe.ocorrencia.resumo}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                {detalhe.ocorrencia.resumo ? (
                  <section>
                    <h3 className="mb-1 font-medium text-text">O que foi encontrado</h3>
                    <p className="text-text-muted">{detalhe.ocorrencia.resumo}</p>
                  </section>
                ) : null}

                {detalhe.ocorrencia.causa_provavel ? (
                  <section>
                    <h3 className="mb-1 font-medium text-text">Causa provável</h3>
                    <p className="text-text-muted">{detalhe.ocorrencia.causa_provavel}</p>
                  </section>
                ) : null}

                {(() => {
                  const plano = planoDe(detalhe.ocorrencia);
                  if (!plano) {
                    return (
                      <section>
                        <h3 className="mb-1 font-medium text-text">Plano de correção</h3>
                        <p className="text-text-muted">
                          Sem plano registrado — ocorrência anterior à v1.1 ou regra sem
                          recomendação. A evidência abaixo continua válida.
                        </p>
                      </section>
                    );
                  }
                  return (
                    <section className="rounded-lg border border-border bg-surface-elevated/50 p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-text">Plano de correção (revisável)</h3>
                        <Badge variant={VARIANTE_RISCO[plano.risco]}>{ROTULO_RISCO[plano.risco]}</Badge>
                        <Badge variant="neutral">{ROTULO_REVERSIBILIDADE[plano.reversibilidade]}</Badge>
                        <Badge variant="info">Confiança {plano.confianca}</Badge>
                        {plano.exige_aprovacao ? (
                          <Badge variant="warning">Exige aprovação</Badge>
                        ) : null}
                      </div>

                      <p className="text-sm text-text">{plano.resumo}</p>

                      <h4 className="mt-3 text-xs font-medium uppercase tracking-wide text-text-muted">
                        Passos
                      </h4>
                      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-text-muted">
                        {plano.passos.map((passo) => (
                          <li key={passo}>{passo}</li>
                        ))}
                      </ol>

                      {plano.campos_pendentes.length > 0 ? (
                        <>
                          <h4 className="mt-3 text-xs font-medium uppercase tracking-wide text-text-muted">
                            Campos pendentes
                          </h4>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-text-muted">
                            {plano.campos_pendentes.map((campo) => (
                              <li key={campo}>{campo}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}

                      {plano.limitacao ? (
                        <p className="mt-3 rounded-md border border-warning-bg bg-warning-bg/30 p-2 text-xs text-text-muted">
                          <strong className="text-text">Limitação:</strong> {plano.limitacao}
                        </p>
                      ) : null}

                      <p className="mt-3 text-xs text-text-muted">
                        Fontes: {plano.fonte.join(", ")}. Nada é executado automaticamente: aprovar
                        registra a decisão; a correção continua manual nesta versão.
                      </p>
                    </section>
                  );
                })()}

                <section>
                  <h3 className="mb-1 font-medium text-text">Evidência</h3>
                  <pre className="max-h-64 overflow-auto rounded-md border border-border bg-surface-elevated p-3 text-xs text-text-muted">
                    {JSON.stringify(detalhe.ocorrencia.evidencia, null, 2)}
                  </pre>
                </section>

                <section className="grid gap-2 text-xs text-text-muted sm:grid-cols-2">
                  <span>Entidade: {detalhe.ocorrencia.entidade_tipo}</span>
                  <span>Vista pela primeira vez: {quando(detalhe.ocorrencia.primeira_vista_em, tagDeIdioma)}</span>
                  <span>Última vez: {quando(detalhe.ocorrencia.ultima_vista_em, tagDeIdioma)}</span>
                  <span>Repetições: {detalhe.ocorrencia.vezes_vista}×</span>
                  {detalhe.ocorrencia.ignorada_motivo ? (
                    <span className="sm:col-span-2">
                      Ignorada: {detalhe.ocorrencia.ignorada_motivo}
                    </span>
                  ) : null}
                  {detalhe.ocorrencia.motivo_encerramento ? (
                    <span className="sm:col-span-2">
                      Encerramento: {detalhe.ocorrencia.motivo_encerramento}
                    </span>
                  ) : null}
                </section>

                {detalhe.ocorrencia.href ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={detalhe.ocorrencia.href}>
                      <ArrowSquareOut className="size-4" aria-hidden />
                      Abrir o registro
                    </Link>
                  </Button>
                ) : null}

                <section>
                  <h3 className="mb-2 font-medium text-text">Histórico</h3>
                  {detalhe.eventos.length === 0 ? (
                    <p className="text-text-muted">Sem eventos registrados.</p>
                  ) : (
                    <ol className="space-y-2 border-l border-border pl-4">
                      {detalhe.eventos.map((evento) => (
                        <li key={evento.id} className="text-xs text-text-muted">
                          <span className="font-medium text-text">{evento.tipo}</span>
                          {evento.estado_anterior || evento.estado_novo ? (
                            <span>
                              {" "}
                              · {evento.estado_anterior ?? "—"} → {evento.estado_novo ?? "—"}
                            </span>
                          ) : null}
                          <span className="block">
                            {quando(evento.created_at, tagDeIdioma)} · {evento.origem}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                {podeAgir ? (
                  <section className="flex flex-wrap gap-2 border-t border-border pt-4">
                    {alvosPermitidos(detalhe.ocorrencia).map((para) => (
                      <Button
                        key={para}
                        size="sm"
                        variant={para === "encerrada" || para === "ignorada" ? "outline" : "default"}
                        onClick={() => {
                          setMotivo("");
                          setAcao({ ocorrencia: detalhe.ocorrencia, para });
                        }}
                      >
                        {para === "investigando"
                          ? "Assumir"
                          : para === "acao_necessaria"
                            ? "Pedir ação"
                            : para === "corrigida"
                              ? "Marcar corrigida"
                              : para === "ignorada"
                                ? "Ignorar"
                                : para === "encerrada"
                                  ? "Encerrar"
                                  : para === "aprovada"
                                    ? "Aprovar"
                                    : ROTULO_ESTADO[para]}
                      </Button>
                    ))}
                  </section>
                ) : null}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={acao !== null} onOpenChange={(aberto) => !aberto && setAcao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {acao ? ROTULO_ESTADO[acao.para] : "Mudar estado"} — {acao?.ocorrencia.titulo}
            </DialogTitle>
            <DialogDescription>
              {acao?.para === "ignorada"
                ? "Ignorar exige motivo: é o que separa um falso positivo conhecido de um alerta que ninguém olhou."
                : "O motivo é opcional, mas fica no histórico da ocorrência."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sentinel-motivo">Motivo</Label>
            <Textarea
              id="sentinel-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                acao?.para === "ignorada"
                  ? "Por que isso não é um problema real?"
                  : "O que foi feito ou por que está encerrando?"
              }
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcao(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={() => void confirmarAcao()}
              disabled={salvando || (acao?.para === "ignorada" && motivo.trim().length < 3)}
            >
              {salvando ? <CircleNotch className="size-4 animate-spin" aria-hidden /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={configAberta} onOpenChange={setConfigAberta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurações do Sentinel</DialogTitle>
            <DialogDescription>
              {linhaDeConfiguracaoExiste
                ? "Vale para esta organização."
                : "Ainda não há linha salva — estes são os padrões e serão gravados ao salvar."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm">
                <span className="block font-medium text-text">Varredura ligada</span>
                <span className="block text-xs text-text-muted">
                  Desligar não apaga ocorrências nem histórico.
                </span>
              </span>
              <Switch
                checked={config.ativo}
                onCheckedChange={(ativo) => setConfig((c) => ({ ...c, ativo }))}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="sentinel-intervalo">Intervalo (min)</Label>
                <Input
                  id="sentinel-intervalo"
                  type="number"
                  min={15}
                  max={10080}
                  value={config.intervaloMinutos}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, intervaloMinutos: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sentinel-retencao">Retenção (dias)</Label>
                <Input
                  id="sentinel-retencao"
                  type="number"
                  min={30}
                  max={3650}
                  value={config.retencaoDias}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, retencaoDias: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sentinel-limite">Máx. ocorrências</Label>
                <Input
                  id="sentinel-limite"
                  type="number"
                  min={50}
                  max={2000}
                  value={config.limiteOcorrencias}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, limiteOcorrencias: Number(e.target.value) }))
                  }
                />
              </div>
            </div>

            <p className="text-xs text-text-muted">
              A retenção só apaga ocorrências em estado terminal (corrigida, ignorada ou
              encerrada) e tem piso de 30 dias no banco. Ocorrência aberta nunca é apagada.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigAberta(false)} disabled={salvandoConfig}>
              Cancelar
            </Button>
            <Button onClick={() => void salvarConfig()} disabled={salvandoConfig}>
              {salvandoConfig ? <CircleNotch className="size-4 animate-spin" aria-hidden /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  detalhe,
  tom,
}: {
  rotulo: string;
  valor: number;
  detalhe: string;
  tom?: "erro";
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{rotulo}</p>
        <p
          className={
            tom === "erro" && valor > 0
              ? "mt-1 text-2xl font-medium text-error-fg"
              : "mt-1 text-2xl font-medium text-text"
          }
        >
          {valor}
        </p>
        <p className="text-xs text-text-muted">{detalhe}</p>
      </CardContent>
    </Card>
  );
}
