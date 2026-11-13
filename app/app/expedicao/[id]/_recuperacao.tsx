"use client";

/**
 * PAINEL DE RECUPERAÇÃO DE ENDEREÇOS — a superfície do Address Recovery Engine.
 *
 * O motor (lib/rotas/recuperacao) só existe para o operador por meio desta
 * tela: aqui ele vê o que o vendedor digitou, o que o sistema encontrou, a
 * confiança de cada correção e decide. Sem ela, "recuperado" e "ambíguo" eram
 * estados do banco sem ninguém para agir.
 *
 * Três decisões de produto que a tela materializa:
 *   1. original e recuperado aparecem LADO A LADO — o operador nunca aceita
 *      uma correção sem ver o que mudou;
 *   2. sugestão não vira pino até confirmação humana (`Confirmar` só aparece
 *      quando há candidato com coordenada);
 *   3. otimizar com endereço pendente é bloqueado no servidor, e a tela diz
 *      isso aqui, antes do operador clicar e levar um 422 sem explicação.
 */

import * as React from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { ArrowsClockwise, ArrowBendUpLeft, Check, CircleNotch, Warning, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface SugestaoApi {
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  precisao: string | null;
  metodo: string | null;
  provedor: string | null;
  confianca: number | null;
  motivo: string | null;
}

interface DestinoRecuperacaoApi {
  destinationId: string;
  chave: string;
  cliente: string | null;
  enderecoOriginal: string | null;
  enderecoNormalizado: string | null;
  enderecoRecuperado: string | null;
  status: string;
  confianca: number | null;
  metodo: string | null;
  provedor: string | null;
  recuperadoEm: string | null;
  latitude: number | null;
  longitude: number | null;
  geoStatus: string | null;
  sugestao: SugestaoApi | null;
  tentativas: { tentativa: number; provedor: string; confianca: number | null; motivo: string | null }[];
}

interface ResumoRecuperacaoApi {
  analisados: number;
  encontrados: number;
  recuperados: number;
  aguardandoConfirmacao: number;
  naoEncontrados: number;
  erros: number;
  naoTentados: number;
  pendentes: number;
}

const ROTULO_STATUS: Record<string, string> = {
  nao_tentada: "Não tentada",
  encontrado: "Encontrado",
  recuperado: "Recuperado",
  ambiguo: "Aguardando confirmação",
  nao_encontrado: "Não encontrado",
  erro: "Erro no provedor",
};

const ROTULO_METODO: Record<string, string> = {
  original: "endereço original",
  normalizado: "normalização",
  digitos: "correção de digitação",
  componentes: "busca por componentes",
  photon: "provedor alternativo",
  manual: "confirmação manual",
};

function confiancaEmPorcento(v: number | null): string | null {
  if (v == null || Number.isNaN(v)) return null;
  return `${Math.round(v * 100)}%`;
}

export function PainelRecuperacao({
  cargaId,
  podeOperar,
  aoAtualizar,
}: {
  cargaId: string;
  podeOperar: boolean;
  /** Recarrega a rota no planejador (a recuperação muda pino e ordem). */
  aoAtualizar: () => Promise<unknown> | void;
}) {
  const t = useT();
  const tagDeIdioma = useTagDeIdioma();
  const [destinos, setDestinos] = React.useState<DestinoRecuperacaoApi[] | null>(null);
  const [resumo, setResumo] = React.useState<ResumoRecuperacaoApi | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [trabalhando, setTrabalhando] = React.useState<string | null>(null);
  const [mostrarResolvidos, setMostrarResolvidos] = React.useState(false);

  const carregar = React.useCallback(async () => {
    try {
      const corpo = await apiClient.get<{
        data: { destinos: DestinoRecuperacaoApi[]; resumo: ResumoRecuperacaoApi };
      }>(`/api/v1/shipments/${cargaId}/rota/recuperacoes`);
      setDestinos(corpo.data.destinos);
      setResumo(corpo.data.resumo);
    } catch (e) {
      // Falha de leitura não pode esconder o painel: fica com o que já tem e
      // diz que não conseguiu atualizar.
      showApiError(e);
    } finally {
      setCarregando(false);
    }
  }, [cargaId]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  async function recuperar() {
    setTrabalhando("recuperar");
    try {
      const corpo = await apiClient.post<{
        data: {
          resumo: {
            analisados: number;
            encontrados: number;
            recuperados: number;
            aguardandoConfirmacao: number;
            naoEncontrados: number;
            erros: number;
          };
        };
      }>(
        `/api/v1/shipments/${cargaId}/rota/recuperar`,
        {},
        // O motor respeita a cadência do provedor público (1 req/s) e tenta 5
        // caminhos por destino: a chamada passa dos 10s padrão com facilidade.
        { timeoutMs: 180_000 }
      );
      const r = corpo.data.resumo;
      if (r.recuperados + r.encontrados > 0) {
        toast.success(
          `${r.encontrados} ${t("confirmado(s)")}, ${r.recuperados} ${t("corrigido(s) automaticamente.")}`
        );
      } else if (r.aguardandoConfirmacao > 0) {
        toast.warning(
          `${r.aguardandoConfirmacao} ${t("endereço(s) precisam da sua confirmação.")}`
        );
      } else {
        toast.info(t("Nenhum endereço novo foi localizado."));
      }
      await carregar();
      await aoAtualizar();
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
    }
  }

  async function confirmar(dest: DestinoRecuperacaoApi) {
    const s = dest.sugestao;
    if (!s || s.latitude == null || s.longitude == null || !s.endereco) return;
    setTrabalhando(dest.destinationId);
    try {
      await apiClient.post(
        `/api/v1/shipments/${cargaId}/destinos/${dest.destinationId}/confirmar`,
        {
          endereco: s.endereco,
          latitude: s.latitude,
          longitude: s.longitude,
          metodo: s.metodo ?? "manual",
          provedor: s.provedor === "photon" ? "photon" : "nominatim",
          ...(s.confianca != null ? { confianca: s.confianca } : {}),
          ...(s.motivo ? { motivo: s.motivo } : {}),
        }
      );
      toast.success(t("Endereço confirmado — a parada está no mapa."));
      await carregar();
      await aoAtualizar();
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
    }
  }

  async function rejeitar(dest: DestinoRecuperacaoApi) {
    setTrabalhando(dest.destinationId);
    try {
      await apiClient.post(`/api/v1/shipments/${cargaId}/destinos/${dest.destinationId}/rejeitar`, {});
      toast.info(t("Sugestão rejeitada. O endereço original foi preservado."));
      await carregar();
      await aoAtualizar();
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
    }
  }

  async function reverter(dest: DestinoRecuperacaoApi) {
    setTrabalhando(dest.destinationId);
    try {
      await apiClient.post(`/api/v1/shipments/${cargaId}/destinos/${dest.destinationId}/reverter`, {});
      toast.info(t("Recuperação desfeita. O endereço original voltou a valer."));
      await carregar();
      await aoAtualizar();
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
    }
  }

  if (carregando) {
    return (
      <Card className="min-w-0 p-0 xl:order-4">
        <div className="space-y-2 p-3.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </Card>
    );
  }

  // Carga sem destino persistido (anterior à 0308): não há o que recuperar,
  // e dizer isso é melhor que mostrar um painel vazio sem explicação.
  if (!destinos || destinos.length === 0) {
    return (
      <Card className="min-w-0 p-0 xl:order-4">
        <header className="flex items-center justify-between gap-2 border-b border-border bg-stage-2/60 px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {t("Endereços")}
            </p>
            <p className="text-sm font-medium text-text">{t("Recuperação de endereços")}</p>
          </div>
          <Badge variant="neutral">{t("Sem destinos")}</Badge>
        </header>
        <p className="p-3.5 text-xs text-muted-foreground">
          {t(
            "Esta carga não tem destinos persistidos. Geocodifique as paradas para habilitar a recuperação."
          )}
        </p>
      </Card>
    );
  }

  const pendentes = destinos.filter(
    (d) => d.status !== "encontrado" && d.status !== "recuperado"
  );
  const resolvidos = destinos.filter((d) => d.status === "encontrado" || d.status === "recuperado");
  const recuperados = destinos.filter((d) => d.status === "recuperado");
  const zona = resumo?.pendentes ?? pendentes.length;

  return (
    <Card className="min-w-0 p-0 xl:order-4">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-stage-2/60 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {t("Endereços")}
          </p>
          <p className="text-sm font-medium text-text">{t("Recuperação de endereços")}</p>
        </div>
        <Badge variant={pendentes.length > 0 ? "warning" : "success"}>
          {pendentes.length > 0
            ? `${pendentes.length} ${pendentes.length === 1 ? t("pendente") : t("pendentes")}`
            : t("Tudo resolvido")}
        </Badge>
      </header>

      <div className="space-y-3 p-3.5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Contador rotulo={t("Confirmados")} valor={resumo?.encontrados ?? 0} />
          <Contador rotulo={t("Corrigidos")} valor={resumo?.recuperados ?? 0} />
          <Contador
            rotulo={t("Aguardando")}
            valor={
              (resumo?.aguardandoConfirmacao ?? 0) +
              (resumo?.naoEncontrados ?? 0) +
              (resumo?.erros ?? 0) +
              (resumo?.naoTentados ?? 0)
            }
            alerta={pendentes.length > 0}
          />
        </div>

        {podeOperar && (
          <Button
            size="sm"
            className="w-full"
            onClick={() => void recuperar()}
            disabled={trabalhando !== null || destinos.length === 0}
          >
            {trabalhando === "recuperar" ? (
              <CircleNotch className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <ArrowsClockwise className="h-3.5 w-3.5" aria-hidden />
            )}
            {trabalhando === "recuperar" ? t("Recuperando…") : t("Recuperar endereços")}
          </Button>
        )}

        {zona > 0 && (
          <p className="flex items-start gap-1.5 rounded-md bg-warning-bg px-2 py-1.5 text-[11px] text-warning-fg">
            <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {t(
              "A otimização fica bloqueada enquanto houver endereço sem confirmação. Confirme, rejeite ou corrija o cadastro."
            )}
          </p>
        )}

        {pendentes.length > 0 && (
          <ul className="space-y-1.5">
            {pendentes.map((dest) => (
              <li key={dest.destinationId} className="rounded-lg border border-border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-text">
                      {dest.cliente ?? dest.chave}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-text-subtle">
                      {t("Original")}: {dest.enderecoOriginal ?? t("sem endereço")}
                    </p>
                    {dest.sugestao?.endereco && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-accent">
                        {t("Sugerido")}: {dest.sugestao.endereco}
                      </p>
                    )}
                    {dest.sugestao?.motivo && (
                      <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
                        {dest.sugestao.motivo}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge
                      variant={
                        dest.status === "ambiguo"
                          ? "warning"
                          : dest.status === "erro"
                            ? "error"
                            : "neutral"
                      }
                    >
                      {t(ROTULO_STATUS[dest.status] ?? dest.status)}
                    </Badge>
                    {confiancaEmPorcento(dest.sugestao?.confianca ?? dest.confianca) && (
                      <span className="text-[10px] text-text-subtle tabular-nums">
                        {confiancaEmPorcento(dest.sugestao?.confianca ?? dest.confianca)}
                      </span>
                    )}
                  </div>
                </div>

                {podeOperar && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-1.5">
                    {dest.sugestao?.endereco &&
                      dest.sugestao.latitude != null &&
                      dest.sugestao.longitude != null && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-success-fg hover:underline disabled:opacity-50"
                          onClick={() => void confirmar(dest)}
                          disabled={trabalhando !== null}
                        >
                          <Check className="h-3 w-3" aria-hidden />
                          {t("Confirmar sugestão")}
                        </button>
                      )}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-text hover:underline disabled:opacity-50"
                      onClick={() => void rejeitar(dest)}
                      disabled={trabalhando !== null}
                    >
                      <X className="h-3 w-3" aria-hidden />
                      {t("Rejeitar")}
                    </button>
                    {dest.metodo && (
                      <span className="text-[10px] text-text-subtle">
                        {t(ROTULO_METODO[dest.metodo] ?? dest.metodo)}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {resolvidos.length > 0 && (
          <div>
            <button
              type="button"
              className="flex w-full items-center justify-between text-[11px] text-muted-foreground hover:text-text"
              onClick={() => setMostrarResolvidos((v) => !v)}
            >
              <span>
                {resolvidos.length}{" "}
                {resolvidos.length === 1 ? t("endereço resolvido") : t("endereços resolvidos")}
              </span>
              <span aria-hidden>{mostrarResolvidos ? "−" : "+"}</span>
            </button>
            {mostrarResolvidos && (
              <ul className="mt-1.5 space-y-1">
                {resolvidos.map((dest) => (
                  <li
                    key={dest.destinationId}
                    className="flex items-start justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-text">
                        {dest.cliente ?? dest.chave}
                      </p>
                      <p className="truncate text-[10px] text-text-subtle">
                        {dest.enderecoRecuperado ?? dest.enderecoOriginal}
                      </p>
                      <p className="text-[10px] text-text-subtle">
                        {t(ROTULO_STATUS[dest.status] ?? dest.status)}
                        {confiancaEmPorcento(dest.confianca)
                          ? ` · ${confiancaEmPorcento(dest.confianca)}`
                          : ""}
                        {dest.recuperadoEm
                          ? ` · ${new Intl.DateTimeFormat(tagDeIdioma, {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(new Date(dest.recuperadoEm))}`
                          : ""}
                      </p>
                    </div>
                    {podeOperar && dest.status === "recuperado" && (
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground hover:text-text hover:underline disabled:opacity-50"
                        onClick={() => void reverter(dest)}
                        disabled={trabalhando !== null}
                        title={t("Desfazer a correção e voltar ao endereço original")}
                      >
                        <ArrowBendUpLeft className="h-3 w-3" aria-hidden />
                        {t("Desfazer")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {recuperados.length > 0 && (
          <p className="text-[10px] text-text-subtle">
            {t(
              "Correção automática só acontece com confiança alta, componentes verificáveis e precisão de rua ou número. O endereço original nunca é sobrescrito."
            )}
          </p>
        )}
      </div>
    </Card>
  );
}

function Contador({
  rotulo,
  valor,
  alerta,
}: {
  rotulo: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-md border border-border px-1.5 py-1.5">
      <p
        className={cn(
          "text-base font-semibold tabular-nums",
          alerta && valor > 0 ? "text-warning-fg" : "text-text"
        )}
      >
        {valor}
      </p>
      <p className="text-[10px] leading-tight text-text-subtle">{rotulo}</p>
    </div>
  );
}
