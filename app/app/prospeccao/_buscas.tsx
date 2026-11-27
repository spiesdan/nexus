"use client";

import * as React from "react";
import Link from "next/link";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { comoMoeda } from "@/lib/format/moeda";
import {
  CheckCircle,
  Clock,
  MagnifyingGlass,
  MapPin,
  Pause,
  Play,
  Warning,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import {
  PROVIDER_OSM,
  PROVIDER_PLACES,
  comoListaBuscas,
  deveMostrarDegradada,
  deveMostrarParcial,
  deveMostrarZero,
  estaAtiva,
  estaParando,
  percentualDaBusca,
  raioAmpliado,
  rotuloDoStatus,
  termosConcluidosDaBusca,
  termosDaBusca,
  type BuscaDaTela,
} from "./_buscas-estado";

const TOM_DO_STATUS: Record<string, "neutral" | "info" | "warning" | "success" | "error"> = {
  queued: "neutral",
  running: "info",
  paused: "warning",
  completed: "success",
  failed: "error",
  cancelled: "neutral",
};

/**
 * PESQUISAS — a busca no mapa com o estado REAL, não só a porcentagem.
 *
 * A tela antiga reduzia tudo a "progresso %" de células. O contrato
 * (`docs/prospeccao-maps-contrato.md`) avança por TERMO × CIDADE e separa
 * quatro leituras que o banco não tem como status: em andamento (com
 * "parando"), parcial, zero e degradada. Cada cartão mostra a sua, e nenhuma
 * delas esconde o que já foi encontrado.
 *
 * Os dados vêm de `GET /api/v1/prospecting/searches`; a pausa/retomada, de
 * `PATCH .../[id]`. A lista já traz os campos derivados que o detalhe traz.
 */
export function BuscasTab({
  iniciais,
  podeOperar,
  podeGerenciar,
  hrefEmpresas,
  aoIrParaBuscar,
}: {
  iniciais: BuscaDaTela[];
  podeOperar: boolean;
  podeGerenciar: boolean;
  hrefEmpresas: (buscaId: string) => string;
  aoIrParaBuscar: () => void;
}) {
  const t = useT();
  const [buscas, setBuscas] = React.useState<BuscaDaTela[]>(iniciais);
  const [carregando, setCarregando] = React.useState(iniciais.length === 0);
  const [erro, setErro] = React.useState(false);
  const [ocupada, setOcupada] = React.useState<string | null>(null);
  const [errosDeAcao, setErrosDeAcao] = React.useState<Record<string, string>>({});

  const carregar = React.useCallback(async () => {
    try {
      const corpo = await apiClient.get<{ data: unknown }>("/api/v1/prospecting/searches");
      setBuscas(comoListaBuscas(corpo?.data));
      setErro(false);
    } catch {
      // Um erro se anuncia uma vez: a tela pinta a faixa, sem toast por cima.
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  // A busca avança no servidor a cada tick; 10 s é frescor sem request à toa.
  const temAtiva = buscas.some(estaAtiva);
  React.useEffect(() => {
    if (!temAtiva) return;
    const timer = setInterval(() => void carregar(), 10000);
    return () => clearInterval(timer);
  }, [temAtiva, carregar]);

  async function acao(id: string, acao: "pause" | "resume" | "cancel") {
    setOcupada(`${id}:${acao}`);
    try {
      await apiClient.patch(`/api/v1/prospecting/searches/${id}`, { acao });
      await carregar();
    } catch (e) {
      showApiError(e);
    } finally {
      setOcupada(null);
    }
  }

  /** Repetir a busca com outro raio/provider. A escolha é sempre do operador. */
  async function repetir(
    busca: BuscaDaTela,
    opcoes: { raioKm?: number; provider?: string },
  ): Promise<void> {
    setOcupada(`${busca.id}:repetir`);
    setErrosDeAcao((atual) => ({ ...atual, [busca.id]: "" }));
    try {
      await apiClient.post("/api/v1/prospecting/searches", {
        categorias: busca.categorias,
        ...(busca.cidade ? { cidade: busca.cidade } : {}),
        ...(busca.estado ? { estado: busca.estado } : {}),
        raio_km: opcoes.raioKm ?? busca.raio_km,
        max_empresas: busca.max_empresas ?? 500,
        // Sem `forcar`, o cache devolveria a mesma busca de zero resultados.
        forcar: true,
        ...(opcoes.provider ? { provider: opcoes.provider } : {}),
      });
      toast.success(t("Nova busca criada. O progresso aparece aqui."));
      await carregar();
    } catch (e) {
      // A rota recusa provider diferente do ativo com o motivo exato; mostrar
      // a mensagem é melhor que inventar um fallback que o contrato não tem.
      const mensagem =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : t("Não foi possível criar a busca.");
      setErrosDeAcao((atual) => ({ ...atual, [busca.id]: mensagem }));
    } finally {
      setOcupada(null);
    }
  }

  const linkDaConfiguracao = "/app/campanhas?subtela=prospeccao&aba=config";

  if (carregando) {
    return (
      <div className="space-y-3" aria-busy="true">
        <TituloDaLista total={null} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (erro && buscas.length === 0) {
    return (
      <NexusErrorState
        title={t("Não foi possível carregar as buscas")}
        description={t("A lista não veio. Tente de novo — as buscas em andamento continuam no servidor.")}
        onRetry={() => void carregar()}
      />
    );
  }

  return (
    <div className="space-y-3">
      <TituloDaLista total={buscas.length} />

      {erro && buscas.length > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning-fg"
        >
          <span>
            {t("A lista pode estar desatualizada — a última leitura falhou.")}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => void carregar()}>
            {t("Tentar de novo")}
          </Button>
        </div>
      )}

      {buscas.length === 0 ? (
        <NexusEmptyState
          icon={MagnifyingGlass}
          headline={t("Nenhuma busca ainda.")}
          subcopy={t(
            "Escolha cidade e categorias em Encontrar empresas; o progresso por termo aparece aqui.",
          )}
          primary={{ label: t("Encontrar empresas"), onClick: aoIrParaBuscar }}
        />
      ) : (
        <ul className="space-y-3">
          {buscas.map((busca) => (
            <CartaoDaBusca
              key={busca.id}
              busca={busca}
              podeOperar={podeOperar}
              hrefEmpresas={hrefEmpresas(busca.id)}
              ocupada={ocupada}
              erroDaAcao={errosDeAcao[busca.id]}
              linkDaConfiguracao={podeGerenciar ? linkDaConfiguracao : null}
              aoMudar={acao}
              aoRepetir={repetir}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TituloDaLista({ total }: { total: number | null }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-medium text-text">{t("Buscas no mapa")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("Cada busca avança termo por termo. O que já foi encontrado não some se ela parar.")}
        </p>
      </div>
      {total !== null && (
        <Badge variant="neutral">
          {total} {total === 1 ? t("busca") : t("buscas")}
        </Badge>
      )}
    </div>
  );
}

function CartaoDaBusca({
  busca,
  podeOperar,
  hrefEmpresas,
  ocupada,
  erroDaAcao,
  linkDaConfiguracao,
  aoMudar,
  aoRepetir,
}: {
  busca: BuscaDaTela;
  podeOperar: boolean;
  hrefEmpresas: string;
  ocupada: string | null;
  erroDaAcao?: string;
  linkDaConfiguracao: string | null;
  aoMudar: (id: string, acao: "pause" | "resume" | "cancel") => Promise<void>;
  aoRepetir: (
    busca: BuscaDaTela,
    opcoes: { raioKm?: number; provider?: string },
  ) => Promise<void>;
}) {
  const t = useT();
  const pct = percentualDaBusca(busca);
  const termos = termosDaBusca(busca);
  const contagem = termosConcluidosDaBusca(busca);
  const parando = estaParando(busca);
  const ativa = estaAtiva(busca);
  const parcial = deveMostrarParcial(busca);
  const zero = deveMostrarZero(busca);
  const degradada = deveMostrarDegradada(busca);
  const ocupadoNeste = ocupada?.startsWith(`${busca.id}:`) ? ocupada : null;
  const local = [busca.cidade, busca.estado].filter(Boolean).join("/");
  const novoRaio = raioAmpliado(busca.raio_km);

  return (
    <li>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">{busca.categorias.join(" · ")}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
              <MapPin size={13} aria-hidden className="shrink-0" />
              {local ? `${local} · ` : ""}
              {busca.raio_km} km
              {busca.max_empresas ? ` · ${t("máximo")} ${busca.max_empresas}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {degradada && <Badge variant="error">{t("Descoberta degradada")}</Badge>}
            {parando && <Badge variant="warning">{t("Parando…")}</Badge>}
            {parcial && !parando && <Badge variant="warning">{t("Parcial")}</Badge>}
            <Badge variant={TOM_DO_STATUS[busca.status] ?? "neutral"}>
              {t(rotuloDoStatus(busca.status))}
            </Badge>
          </div>
        </div>

        {parando && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning-fg"
          >
            <Clock size={15} aria-hidden className="mt-0.5 shrink-0" />
            <p>
              <strong className="font-semibold">{t("Parando…")}</strong>{" "}
              {t(
                "A busca conclui o termo em curso antes de parar — no máximo {s} s. O que já foi encontrado continua disponível.",
              ).replace("{s}", String(busca.parada_maxima_s ?? 125))}
            </p>
          </div>
        )}

        {/* Progresso: termos para Maps; células para os outros providers. */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              {termos
                ? `${contagem.concluidos} ${t("de")} ${contagem.total} ${t("termos")}`
                : `${busca.celulas_processadas ?? 0} ${t("de")} ${busca.total_celulas ?? 0} ${t("células")}`}
            </span>
            <span className="font-medium text-text tabular-nums">{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`${t("Progresso da busca")}${local ? ` · ${local}` : ""}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                busca.status === "failed" ? "bg-error" : "bg-success",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {termos && termos.termos_total > 0 && (
          <ul className="space-y-1 text-xs" aria-label={t("Termos da busca")}>
            {busca.categorias.map((termo) => {
              const concluido = termos.termos_concluidos.includes(termo);
              const falhou = termos.termos_falhos.includes(termo);
              const atual = termos.termo_atual === termo && !concluido && !falhou;
              const achados = termos.termos_encontradas?.[termo];
              return (
                <li key={termo} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  {concluido ? (
                    <CheckCircle size={13} aria-hidden className="shrink-0 text-success-fg" />
                  ) : falhou ? (
                    <Warning size={13} aria-hidden className="shrink-0 text-warning-fg" />
                  ) : atual ? (
                    <Clock size={13} aria-hidden className="shrink-0 text-info-fg" />
                  ) : (
                    <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-full border border-border" />
                  )}
                  <span className={concluido ? "text-text" : "text-muted-foreground"}>{termo}</span>
                  <span className="text-text-subtle">
                    {concluido
                      ? `· ${achados ?? 0} ${(achados ?? 0) === 1 ? t("encontrada") : t("encontradas")}`
                      : falhou
                        ? `· ${t("falhou após 3 tentativas")}`
                        : atual
                          ? `· ${t("em execução")} · ${t("tentativas")} ${termos.tentativas}/3`
                          : `· ${t("na fila")}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <dl className="grid grid-cols-3 gap-2 border-t border-border pt-2.5 text-xs sm:max-w-md">
          {[
            [t("Encontradas"), busca.encontradas],
            [t("Novas"), busca.novas],
            [t("Duplicadas"), busca.duplicadas],
          ].map(([rotulo, valor]) => (
            <div key={String(rotulo)}>
              <dt className="text-muted-foreground">{rotulo}</dt>
              <dd className="font-semibold text-text tabular-nums">{valor}</dd>
            </div>
          ))}
        </dl>

        {parcial && (
          <div className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning-fg">
            <p className="font-semibold">{t("Resultado parcial")}</p>
            <p className="mt-0.5">
              {busca.parcial_motivo ??
                t("A busca não cobriu todos os termos; o que foi encontrado está disponível.")}
            </p>
          </div>
        )}

        {zero && (
          <div className="space-y-2 rounded-lg border border-border bg-stage-2 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-text">{t("Nenhum resultado nesta região")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("0 encontrados para {termos} em {local}.").replace(
                  "{termos}",
                  busca.categorias.join(", "),
                ).replace("{local}", local || t("esta área"))}{" "}
                {t("Nada foi trocado automaticamente — escolha como seguir:")}
              </p>
            </div>
            {podeOperar && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11"
                  disabled={ocupadoNeste !== null}
                  onClick={() => void aoRepetir(busca, { raioKm: novoRaio })}
                >
                  {t("Ampliar para {km} km e repetir").replace("{km}", String(novoRaio))}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  disabled={ocupadoNeste !== null}
                  onClick={() => void aoRepetir(busca, { provider: PROVIDER_OSM })}
                >
                  {t("Buscar no OSM")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  disabled={ocupadoNeste !== null}
                  onClick={() => void aoRepetir(busca, { provider: PROVIDER_PLACES })}
                >
                  {t("Buscar no Google Places")}
                </Button>
              </div>
            )}
          </div>
        )}

        {degradada && (
          <div className="space-y-2 rounded-lg border border-error/30 bg-error-bg/50 px-3 py-2.5 text-xs">
            <div>
              <p className="text-sm font-medium text-error-fg">{t("Descoberta degradada")}</p>
              <p className="mt-0.5 text-text">
                {busca.degradacao_motivo ??
                  t("O Maps não executou esta busca, então o resultado pode estar incompleto.")}
              </p>
              <p className="mt-1 text-muted-foreground">
                {t("Não existe troca automática de provedor. Escolha como seguir:")}
              </p>
            </div>
            {podeOperar && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  disabled={ocupadoNeste !== null}
                  onClick={() => void aoRepetir(busca, { provider: PROVIDER_OSM })}
                >
                  {t("Buscar no OSM")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  disabled={ocupadoNeste !== null}
                  onClick={() => void aoRepetir(busca, { provider: PROVIDER_PLACES })}
                >
                  {t("Buscar no Google Places")}
                </Button>
              </div>
            )}
          </div>
        )}

        {erroDaAcao && (
          <div role="alert" className="rounded-lg border border-error/30 bg-error-bg/50 px-3 py-2 text-xs text-error-fg">
            <p>{erroDaAcao}</p>
            {linkDaConfiguracao && (
              <p className="mt-1">
                {t("O provedor ativo é escolhido em")}{" "}
                <Link href={linkDaConfiguracao} className="font-medium underline underline-offset-4">
                  {t("Configuração da prospecção")}
                </Link>
                .
              </p>
            )}
          </div>
        )}

        {busca.ultimo_erro && (
          <p role="alert" className="text-xs text-error-fg">
            {busca.ultimo_erro}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {busca.encontradas > 0 && (
            <Button size="sm" variant="outline" className="min-h-11" asChild>
              <Link href={hrefEmpresas}>{t("Ver empresas")}</Link>
            </Button>
          )}
          {podeOperar && ativa && !parando && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              disabled={ocupadoNeste !== null}
              onClick={() => void aoMudar(busca.id, "pause")}
            >
              <Pause size={14} aria-hidden />
              {ocupadoNeste?.endsWith(":pause") ? t("Pausando…") : t("Pausar")}
            </Button>
          )}
          {podeOperar && busca.status === "paused" && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              disabled={ocupadoNeste !== null}
              onClick={() => void aoMudar(busca.id, "resume")}
            >
              <Play size={14} aria-hidden />
              {ocupadoNeste?.endsWith(":resume") ? t("Retomando…") : t("Continuar")}
            </Button>
          )}
          {podeOperar && (ativa || busca.status === "paused") && (
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11"
              disabled={ocupadoNeste !== null}
              onClick={() => void aoMudar(busca.id, "cancel")}
            >
              {ocupadoNeste?.endsWith(":cancel") ? t("Cancelando…") : t("Cancelar")}
            </Button>
          )}
          {busca.custo_estimado_cents != null && busca.custo_estimado_cents > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {t("Custo estimado")}: {comoMoeda(busca.custo_estimado_cents, "BRL")}
            </span>
          )}
        </div>
      </Card>
    </li>
  );
}
