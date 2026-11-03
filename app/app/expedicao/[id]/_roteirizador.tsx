"use client";

import * as React from "react";
import Link from "next/link";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { comoMoeda, numeroDoPedido } from "@/lib/format/moeda";
import { formatarDistancia, formatarDuracao, haversineM } from "@/lib/rotas/roteamento";
import { createClient } from "@/lib/supabase/browser";
import { CaretDown, CaretUp, MapPin } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { MapaRota, type PontoParadaMapa } from "./_mapa-rota";

export interface ParadaRotaApi {
  chave: string;
  contact_id: string | null;
  cliente: string;
  fone: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_status: string;
  geo_fonte: string | null;
  pedidos: { shipment_order_id: string; order_id: string; numero: number; total_cents: number; status: string }[];
  total_cents: number;
}

export interface RotaCarregada {
  carga: {
    id: string;
    numero: number;
    status: string;
    placa: string | null;
    veiculo_tipo: string | null;
    motorista_nome: string | null;
    origem_endereco: string | null;
    origem_lat: number | null;
    origem_lng: number | null;
    retornar_origem: boolean;
    tempo_parada_min: number;
    distancia_m: number | null;
    duracao_s: number | null;
    rota_geojson: { geometria?: number[][]; provedor?: string; ruas?: boolean; modo?: string } | null;
    rota_em: string | null;
    rota_versao: number;
    started_at: string | null;
    finished_at: string | null;
  };
  paradas: ParadaRotaApi[];
  ultima_posicao: { latitude: number; longitude: number; em: string } | null;
}

interface Proposta {
  ordem: string[];
  origem: { lat: number; lng: number; endereco: string | null } | null;
  retornar_origem: boolean;
  tempo_parada_min: number;
  modo: string;
  distancia_m: number;
  duracao_dirigindo_s: number;
  duracao_total_s: number;
  geometria: number[][];
  provedor: string;
  ruas: boolean;
  nao_roteirizaveis: string[];
}

const ROTULO_GEO: Record<string, string> = {
  ok: "No mapa",
  pendente: "A localizar",
  nao_encontrado: "Não localizado",
  ambiguo: "Ambíguo",
  erro: "Erro",
};

/**
 * ROTEIRIZADOR — a central de planejamento da carga.
 *
 * Paradas vêm da carga (agrupadas por cliente no backend), geocodificação no
 * servidor com cache, otimização OSRM pelas ruas com fallback honesto,
 * reordenação manual, origem configurável e mapa sincronizado. Salvar grava
 * sequência + geometria + versão; iniciar/finalizar moram nos botões da
 * carga e no modo motorista.
 */
export function Roteirizador({
  cargaId,
  podeOperar,
  aoMudar,
}: {
  cargaId: string;
  podeOperar: boolean;
  aoMudar: () => void;
}) {
  const t = useT();
  const confirmar = useConfirmar();
  const [rota, setRota] = React.useState<RotaCarregada | null>(null);
  const [ordem, setOrdem] = React.useState<string[]>([]);
  const [proposta, setProposta] = React.useState<Proposta | null>(null);
  const [origemTexto, setOrigemTexto] = React.useState("");
  const [retornar, setRetornar] = React.useState(false);
  const [tempoParada, setTempoParada] = React.useState(8);
  const [trabalhando, setTrabalhando] = React.useState<string | null>(null);
  const [progressoGeo, setProgressoGeo] = React.useState<string | null>(null);
  const [marcarPara, setMarcarPara] = React.useState<string | null>(null);
  const [pinoPendente, setPinoPendente] = React.useState<{ lat: number; lng: number } | null>(null);
  const [rastro, setRastro] = React.useState<[number, number][]>([]);
  const [motorista, setMotorista] = React.useState<{ lat: number; lng: number } | null>(null);

  const recarregar = React.useCallback(async () => {
    try {
      const corpo = await apiClient.get<{ data: RotaCarregada }>(`/api/v1/shipments/${cargaId}/rota`);
      const d = corpo.data;
      setRota(d);
      setOrdem((atual) => {
        const chaves = d.paradas.map((p) => p.chave);
        // Preserva reordenação manual quando as paradas são as mesmas.
        if (atual.length === chaves.length && atual.every((c) => chaves.includes(c))) return atual;
        return chaves;
      });
      setOrigemTexto((atual) => (atual === "" && d.carga.origem_endereco ? d.carga.origem_endereco : atual));
      setRetornar(d.carga.retornar_origem);
      setTempoParada(d.carga.tempo_parada_min);
      if (d.ultima_posicao) setMotorista({ lat: d.ultima_posicao.latitude, lng: d.ultima_posicao.longitude });
    } catch (e) {
      showApiError(e);
    }
  }, [cargaId]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  const statusCarga = rota?.carga.status;

  // Rastro realizado (mapa + comparação planejado×realizado).
  React.useEffect(() => {
    if (!rota || (statusCarga !== "em_rota" && statusCarga !== "concluida")) return;
    let vivo = true;
    apiClient
      .get<{ data: { posicoes: { latitude: number; longitude: number }[] } }>(
        `/api/v1/shipments/${cargaId}/rota/posicao?limite=500`,
      )
      .then((r) => {
        if (vivo) setRastro((r.data.posicoes ?? []).map((p) => [p.latitude, p.longitude]));
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargaId, statusCarga]);

  // Motorista ao vivo via Realtime (sem polling): INSERT em shipment_positions.
  React.useEffect(() => {
    if (!rota || statusCarga !== "em_rota") return;
    const sb = createClient();
    const canal = sb
      .channel(`rota:${cargaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shipment_positions", filter: `shipment_id=eq.${cargaId}` },
        (pag: { new: { latitude: number; longitude: number } }) => {
          const n = pag.new as { latitude: number; longitude: number };
          if (typeof n.latitude === "number" && typeof n.longitude === "number") {
            setMotorista({ lat: n.latitude, lng: n.longitude });
            setRastro((atual) => [...atual.slice(-499), [n.latitude, n.longitude]]);
          }
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargaId, statusCarga]);

  if (!rota) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-[50vh] w-full" />
        <p className="text-sm text-muted-foreground">{t("Carregando rota…")}</p>
      </div>
    );
  }

  const paradasOrdenadas = ordem
    .map((c) => rota.paradas.find((p) => p.chave === c))
    .filter((p): p is ParadaRotaApi => !!p);
  const comCoord = paradasOrdenadas.filter((p) => p.latitude != null && p.longitude != null);
  const semCoord = paradasOrdenadas.filter((p) => p.latitude == null || p.longitude == null);
  const totalClientes = new Set(rota.paradas.map((p) => p.contact_id ?? p.chave)).size;
  // Planejador vale montando E em rota (reotimizar no meio do caminho é
  // operação normal — o motorista confirma a nova sequência no app).
  const editavel = podeOperar && (rota.carga.status === "montando" || rota.carga.status === "em_rota");
  const valorTotal = rota.paradas.reduce((s, p) => s + p.total_cents, 0);
  const ordemSalva = rota.paradas.map((p) => p.chave);
  const ordemMudou = ordem.join("|") !== ordemSalva.join("|") && ordem.length === ordemSalva.length;
  const configMudou = retornar !== rota.carga.retornar_origem || tempoParada !== rota.carga.tempo_parada_min;

  const primeiraPendente = (() => {
    for (const p of paradasOrdenadas) {
      if (p.pedidos.some((x) => ["na_carga", "em_rota", "em_atendimento"].includes(x.status))) return p.chave;
    }
    return null;
  })();

  const pontosMapa: PontoParadaMapa[] = paradasOrdenadas.map((p, i) => {
    const sts = p.pedidos.map((x) => x.status);
    const estado = sts.every((s) => s === "entregue")
      ? "entregue"
      : sts.some((s) => s === "devolvido")
        ? "problema"
        : sts.some((s) => s === "em_atendimento")
          ? "atendimento"
          : p.chave === primeiraPendente
            ? "proxima"
            : "pendente";
    return {
      chave: p.chave,
      cliente: p.cliente,
      contact_id: p.contact_id,
      endereco: p.endereco,
      fone: p.fone,
      lat: p.latitude,
      lng: p.longitude,
      ordem: i + 1,
      estado,
      pedidos: p.pedidos,
    };
  });

  const geometria = proposta?.geometria ?? rota.carga.rota_geojson?.geometria ?? [];
  const modoSalvo = rota.carga.rota_geojson?.modo ?? null;
  const provedorRota = proposta ? { nome: proposta.provedor, ruas: proposta.ruas } : rota.carga.rota_geojson ? { nome: rota.carga.rota_geojson.provedor ?? "?", ruas: rota.carga.rota_geojson.ruas ?? false } : null;
  const modoEfetivo = proposta?.modo ?? modoSalvo;
  const distanciaM = proposta?.distancia_m ?? rota.carga.distancia_m;
  const duracaoTotalS = proposta ? proposta.duracao_total_s : rota.carga.duracao_s != null ? rota.carga.duracao_s + paradasOrdenadas.length * rota.carga.tempo_parada_min * 60 : null;

  // Realizado do rastro (haversine + ponta a ponta) — só com dado suficiente.
  let realizado: { km: string; tempo: string } | null = null;
  if (rastro.length >= 2) {
    let m = 0;
    for (let i = 1; i < rastro.length; i++) m += haversineM({ lat: rastro[i - 1]![0], lng: rastro[i - 1]![1] }, { lat: rastro[i]![0], lng: rastro[i]![1] });
    realizado = { km: formatarDistancia(m), tempo: "—" };
  }
  const tempoRealizado =
    rota.carga.started_at && (rota.carga.finished_at || rastro.length > 0)
      ? Math.round((new Date(rota.carga.finished_at ?? new Date().toISOString()).getTime() - new Date(rota.carga.started_at).getTime()) / 1000)
      : null;
  if (realizado && tempoRealizado != null) realizado = { ...realizado, tempo: formatarDuracao(tempoRealizado) };

  async function geocodificarTudo() {
    setTrabalhando("geo");
    setProgressoGeo(t("Localizando…"));
    try {
      for (;;) {
        const corpo = await apiClient.post<{ data: { estados: { estado: string }[]; restantes: number } }>(
          `/api/v1/shipments/${cargaId}/rota/geocodificar`,
          {},
        );
        const d = corpo.data;
        setProgressoGeo(
          d.restantes > 0 ? t(`Faltam ${d.restantes}…`) : t("Pronto."),
        );
        await recarregar();
        if (d.restantes <= 0) break;
      }
      toast.success(t("Geocodificação concluída."));
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
      setProgressoGeo(null);
    }
  }

  async function otimizar(modoEscolhido: "tsp" | "distancia") {
    if (
      ordemMudou &&
      !(await confirmar({
        title: t("A ordem manual será substituída pela otimizada. Reotimizar mesmo assim?"),
        confirmLabel: t("Reotimizar"),
      }))
    )
      return;
    if (
      rota?.carga.status === "em_rota" &&
      !(await confirmar({
        title: t("A rota está em andamento — o motorista verá a nova sequência. Reotimizar mesmo assim?"),
        confirmLabel: t("Reotimizar"),
      }))
    )
      return;
    setTrabalhando("otimizar");
    try {
      // Minha posição como origem: resolve o GPS antes de pedir a proposta.
      let origem: { endereco: string } | { latitude: number; longitude: number } | null = null;
      const txt = origemTexto.trim();
      if (txt === "@gps") {
        const pos = await new Promise<GeolocationPosition>((ok, falha) =>
          navigator.geolocation.getCurrentPosition(ok, falha, { timeout: 10000 }),
        );
        origem = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } else if (txt) {
        origem = { endereco: txt };
      }
      const corpo = await apiClient.post<{ data: Proposta }>(`/api/v1/shipments/${cargaId}/rota/otimizar`, {
        origem,
        retornar_origem: retornar,
        tempo_parada_min: tempoParada,
        modo: modoEscolhido,
      });
      const p = corpo.data;
      setProposta(p);
      setOrdem(p.ordem);
      if (!p.ruas) toast.warning(t("Serviço de ruas fora do ar — ordem aproximada (linha reta ×1,3)."));
      else toast.success(t("Rota otimizada. Confira e salve."));
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
    }
  }

  async function salvarOrdem() {
    setTrabalhando("salvar");
    try {
      const corpo = await apiClient.patch<{ data: RotaCarregada }>(`/api/v1/shipments/${cargaId}/rota/ordem`, {
        ordem,
        ...(proposta
          ? {
              distancia_m: proposta.distancia_m,
              duracao_s: proposta.duracao_dirigindo_s,
              geometria: proposta.geometria,
              provedor: proposta.provedor,
              ruas: proposta.ruas,
              modo: proposta.modo,
              ...(proposta.origem
                ? {
                    origem_endereco: proposta.origem.endereco,
                    origem_lat: proposta.origem.lat,
                    origem_lng: proposta.origem.lng,
                  }
                : {}),
              retornar_origem: proposta.retornar_origem,
              tempo_parada_min: proposta.tempo_parada_min,
            }
          : { retornar_origem: retornar, tempo_parada_min: tempoParada }),
      });
      setRota(corpo.data);
      setProposta(null);
      toast.success(t("Rota salva."));
      aoMudar();
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
    }
  }

  function mover(chave: string, dir: -1 | 1) {
    setOrdem((atual) => {
      const i = atual.indexOf(chave);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= atual.length) return atual;
      const copia = [...atual];
      [copia[i], copia[j]] = [copia[j]!, copia[i]!];
      return copia;
    });
    setProposta(null);
  }

  function alternarMarcar(contactId: string) {
    setMarcarPara((atual) => (atual === contactId ? null : contactId));
    setPinoPendente(null);
  }

  function usarMinhaPosicao() {
    if (!("geolocation" in navigator)) {
      toast.error(t("GPS indisponível neste aparelho."));
      return;
    }
    setOrigemTexto("@gps");
    toast.success(t("Origem = sua posição atual (resolve ao otimizar)."));
  }

  async function confirmarPino() {
    if (!marcarPara || !pinoPendente) return;
    setTrabalhando("pino");
    try {
      await apiClient.post(`/api/v1/shipments/${cargaId}/rota/manual`, {
        contact_id: marcarPara,
        latitude: Number(pinoPendente.lat.toFixed(6)),
        longitude: Number(pinoPendente.lng.toFixed(6)),
      });
      toast.success(t("Posição fixada."));
      setMarcarPara(null);
      setPinoPendente(null);
      await recarregar();
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
    }
  }

  function cancelarPino() {
    setMarcarPara(null);
    setPinoPendente(null);
  }

  async function acaoParada(chave: string, acao: "cheguei" | "entregue") {
    if (!rota) return;
    const parada = rota.paradas.find((p) => p.chave === chave);
    const alvo = parada?.pedidos.find((x) => ["na_carga", "em_rota", "em_atendimento"].includes(x.status));
    if (!alvo) return;
    try {
      let geo: { latitude?: number; longitude?: number } = {};
      if (acao === "entregue" && "geolocation" in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((ok, falha) =>
            navigator.geolocation.getCurrentPosition(ok, falha, { timeout: 8000 }),
          );
          geo = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        } catch {
          // Sem GPS, a entrega vale igual — só sem coordenada.
        }
      }
      await apiClient.patch(`/api/v1/shipments/${cargaId}/orders/${alvo.order_id}`, {
        status: acao === "cheguei" ? "em_atendimento" : "entregue",
        ...geo,
      });
      toast.success(acao === "cheguei" ? t("Em atendimento.") : t("Entregue."));
      await recarregar();
      aoMudar();
    } catch (e) {
      showApiError(e);
    }
  }

  const origemMapa =
    (proposta?.origem ?? (rota.carga.origem_lat != null && rota.carga.origem_lng != null
      ? { lat: rota.carga.origem_lat, lng: rota.carga.origem_lng, endereco: rota.carga.origem_endereco }
      : null));

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho da seção ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {t("Rota")}
          </p>
          <h2 className="text-base font-medium text-text">{t("Mapa e ordem de entrega")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("A ordem da lista é a ordem da rua. Use as setas para ajustar.")}
          </p>
        </div>
        <Badge variant={provedorRota?.ruas ? "success" : provedorRota ? "warning" : "neutral"}>
          {provedorRota
            ? provedorRota.ruas
              ? t("Pelas ruas")
              : t("Ordem aproximada")
            : t("Sem rota calculada")}
        </Badge>
      </div>

      {/* ── O mapa é o herói da seção ───────────────────────────────────────
          Os números que importam ficam sobre ele, para não haver uma faixa de
          cartões entre a pessoa e o desenho da rota. */}
      <div className="min-w-0">
        <MapaRota
          altura="min(46vh, 430px)"
          paradas={pontosMapa}
          geometria={geometria}
          origem={origemMapa}
          motorista={motorista}
          rastro={rastro}
          modoMarcar={marcarPara !== null}
          pinoPendente={pinoPendente}
          aoClicarMapa={(lat, lng) => {
            if (marcarPara) setPinoPendente({ lat, lng });
          }}
          aoAcaoParada={(chave, acao) => void acaoParada(chave, acao)}
          sobreposicao={
            <>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/95 px-2 py-1 text-[11px] font-medium text-text shadow-xs backdrop-blur">
                <strong className="tabular-nums">{paradasOrdenadas.length}</strong>
                {paradasOrdenadas.length === 1 ? t("entrega") : t("entregas")}
                <span className="text-muted-foreground">
                  · {totalClientes} {totalClientes === 1 ? t("cliente") : t("clientes")}
                </span>
              </span>
              {/* Sem rota calculada, "Distância —" e "Tempo —" ocupam o mapa
                  para não dizer nada. O selo do cabeçalho já informa que a rota
                  não foi calculada; aqui só entra o que tem número. */}
              {distanciaM != null && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/95 px-2 py-1 text-[11px] font-medium text-text shadow-xs backdrop-blur">
                  <span className="text-muted-foreground">{t("Distância")}</span>
                  <strong className="tabular-nums">{formatarDistancia(distanciaM)}</strong>
                </span>
              )}
              {duracaoTotalS != null && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/95 px-2 py-1 text-[11px] font-medium text-text shadow-xs backdrop-blur">
                  <span className="text-muted-foreground">{t("Tempo")}</span>
                  <strong className="tabular-nums">{formatarDuracao(duracaoTotalS)}</strong>
                </span>
              )}
              <span className="hidden items-center gap-1.5 rounded-lg border border-border/60 bg-background/95 px-2 py-1 text-[11px] font-medium text-text shadow-xs backdrop-blur sm:inline-flex">
                <span className="text-muted-foreground">{t("Mercadorias")}</span>
                <strong className="tabular-nums">{comoMoeda(valorTotal, "BRL")}</strong>
              </span>
            </>
          }
        />

        {marcarPara && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning-bg p-2.5 text-sm text-warning-fg">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              {pinoPendente
                ? t("Alfinete no lugar? Confirme para valer.")
                : t("Clique no mapa para soltar o alfinete.")}
            </span>
            <span className="ml-auto flex gap-2">
              <Button
                size="sm"
                onClick={() => void confirmarPino()}
                disabled={!pinoPendente || trabalhando !== null}
              >
                {t("Confirmar posição")}
              </Button>
              <Button size="sm" variant="outline" onClick={cancelarPino}>
                {t("Cancelar")}
              </Button>
            </span>
          </div>
        )}

        {/* Legenda do que o mapa está desenhando + planejado × realizado.
            Sem rota calculada a linha não aparece: o selo do cabeçalho já diz
            "Sem rota calculada" e dizia a mesma coisa duas vezes. */}
        {(provedorRota || realizado) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-[11px] text-muted-foreground">
            {provedorRota && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    provedorRota.ruas ? "bg-success" : "bg-warning",
                  )}
                />
                {provedorRota.ruas
                  ? t("Pelas ruas (OSRM)")
                  : t("Aproximado — sem serviço de ruas")}
                {modoEfetivo
                  ? ` · ${modoEfetivo === "distancia" ? t("por distância da base") : t("caminho mais curto")}`
                  : ""}
              </span>
            )}
            {realizado && (
              <span className={cn(provedorRota && "sm:ml-auto")}>
                {t("Realizado")}{" "}
                <strong className="font-medium text-text tabular-nums">
                  {realizado.km} · {realizado.tempo}
                </strong>
                {distanciaM != null && (
                  <>
                    {" · "}
                    {t("vs planejado")} {formatarDistancia(distanciaM)}
                  </>
                )}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* ── O planejamento, em três passos ────────────────────────────── */}
        {editavel && (
          <Card className="overflow-hidden p-0">
            <header className="flex items-center justify-between gap-2 border-b border-border bg-stage-2/60 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {t("Planejamento")}
                </p>
                <p className="text-sm font-medium text-text">{t("Planejar rota")}</p>
              </div>
              <Badge variant={proposta ? "info" : "neutral"}>
                {proposta ? t("Não salva") : t("Salva")}
              </Badge>
            </header>

            <ol className="divide-y divide-border">
              {/* 1 — de onde a rota sai */}
              <li className="flex gap-3 p-3.5">
                <Passo numero={1} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <label
                    htmlFor="rota-origem"
                    className="block text-xs font-medium text-text"
                  >
                    {t("Origem da rota")}
                  </label>
                  <div className="flex flex-col gap-1.5">
                    <Input
                      id="rota-origem"
                      className="h-9"
                      value={origemTexto}
                      onChange={(e) => setOrigemTexto(e.target.value)}
                      placeholder={t("Ex.: Rua Caetano Costa, 425, Canoinhas")}
                    />
                    {/* Empilhado, não lado a lado: na coluna de 340px o botão
                        comia o campo e o endereço aparecia cortado em
                        "Ex.: Rua Caetano Co…". */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={usarMinhaPosicao}
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {t("Minha posição")}
                    </Button>
                  </div>
                  <p className="text-[11px] text-text-subtle">
                    {t("Vazio começa na primeira entrega.")}
                  </p>
                </div>
              </li>

              {/* 2 — o cálculo */}
              <li className="flex gap-3 p-3.5">
                <Passo numero={2} />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs font-medium text-text">{t("Calcular a ordem")}</p>
                  <div className="grid gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => void otimizar("distancia")}
                      disabled={trabalhando !== null || comCoord.length === 0}
                    >
                      {trabalhando === "otimizar" ? t("Calculando…") : t("Ordenar por distância")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void otimizar("tsp")}
                      disabled={trabalhando !== null || comCoord.length === 0}
                    >
                      {t("Otimizar por ruas")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void geocodificarTudo()}
                      disabled={trabalhando !== null}
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {t("Geocodificar")}
                    </Button>
                  </div>
                  {comCoord.length === 0 && (
                    <p className="text-[11px] text-warning-fg">
                      {t("Otimizar desativado: nenhuma parada localizada. Geocodifique ou marque no mapa.")}
                    </p>
                  )}
                  {progressoGeo && (
                    <p className="text-[11px] text-muted-foreground">{progressoGeo}</p>
                  )}
                  {proposta && !proposta.ruas && (
                    <p className="text-[11px] text-warning-fg">
                      {t("Sem ruas no momento: ordem aproximada. Tente de novo mais tarde.")}
                    </p>
                  )}
                </div>
              </li>

              {/* 3 — ajustes e gravação */}
              <li className="flex gap-3 p-3.5">
                <Passo numero={3} />
                <div className="min-w-0 flex-1 space-y-2.5">
                  <p className="text-xs font-medium text-text">{t("Ajustes e gravação")}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-accent"
                        checked={retornar}
                        onChange={(e) => setRetornar(e.target.checked)}
                      />
                      {t("Retornar à origem")}
                    </label>
                    <label className="flex items-center gap-1.5">
                      {t("Parada")}
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={tempoParada}
                        onChange={(e) => setTempoParada(Number(e.target.value))}
                        className="h-7 w-14 rounded-md border border-border bg-surface px-1.5 text-center text-xs text-text tabular-nums"
                      />
                      {t("min")}
                    </label>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => void salvarOrdem()}
                    disabled={trabalhando !== null || !(proposta || ordemMudou || configMudou)}
                  >
                    {trabalhando === "salvar" ? t("Salvando…") : t("Salvar ordem")}
                  </Button>
                  <p className="text-[11px] text-text-subtle">
                    {proposta || ordemMudou || configMudou
                      ? t("A ordem e os ajustes serão gravados na carga.")
                      : t("Nada mudou desde a última gravação.")}
                  </p>
                </div>
              </li>
            </ol>
          </Card>
        )}

        {/* ── A ordem de entrega ────────────────────────────────────────── */}
        <Card className="min-w-0 overflow-hidden p-0">
          <header className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-b border-border px-3.5 py-2.5">
            <p className="text-sm font-medium text-text">
              {t("Ordem de entrega")}{" "}
              <span className="font-normal text-muted-foreground tabular-nums">
                ({paradasOrdenadas.length})
              </span>
            </p>
            <p className="text-[11px] text-text-subtle">{t("A ordem da lista é a ordem da rua.")}</p>
          </header>

          <ol className="divide-y divide-border">
            {paradasOrdenadas.map((p, i) => (
              <li key={p.chave} className="flex items-start gap-2.5 px-3.5 py-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                    i === 0 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
                  )}
                  aria-label={`${t("Parada")} ${i + 1}`}
                >
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                      {p.cliente}
                    </p>
                    <p className="shrink-0 text-xs font-medium text-text tabular-nums">
                      {comoMoeda(p.total_cents, "BRL")}
                    </p>
                  </div>
                  <p className="truncate text-xs text-muted-foreground tabular-nums">
                    {p.pedidos.map((x) => numeroDoPedido(x.numero)).join(" · ")}
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        p.geo_status === "ok"
                          ? "text-success-fg"
                          : p.geo_status === "pendente"
                            ? "text-text-subtle"
                            : "text-warning-fg",
                      )}
                    >
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                      {ROTULO_GEO[p.geo_status] ?? p.geo_status}
                      {p.geo_status === "ok" && p.geo_fonte === "nominatim:rua"
                        ? ` ${t("(rua aproximada)")}`
                        : ""}
                    </span>
                    {podeOperar && p.contact_id && p.geo_status !== "ok" && (
                      <>
                        <button
                          type="button"
                          className="text-muted-foreground underline underline-offset-2 hover:text-text"
                          onClick={() => void geocodificarTudo()}
                        >
                          {t("Tentar de novo")}
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground underline underline-offset-2 hover:text-text"
                          onClick={() => alternarMarcar(p.contact_id as string)}
                        >
                          {marcarPara === p.contact_id ? t("Cancelar marcação") : t("Marcar no mapa")}
                        </button>
                        {p.contact_id && (
                          <Link
                            href={`/app/contacts/${p.contact_id}`}
                            className="text-muted-foreground underline underline-offset-2 hover:text-text"
                          >
                            {t("Corrigir endereço")}
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {editavel && (
                  <div className="flex shrink-0 flex-col items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => mover(p.chave, -1)}
                      disabled={i === 0}
                      aria-label={t("Subir")}
                    >
                      <CaretUp className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => mover(p.chave, 1)}
                      disabled={i === paradasOrdenadas.length - 1}
                      aria-label={t("Descer")}
                    >
                      <CaretDown className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ol>

          {semCoord.length > 0 && (
            <p className="border-t border-border bg-warning-bg px-3.5 py-2 text-xs text-warning-fg">
              {semCoord.length}{" "}
              {semCoord.length === 1
                ? t("parada fora do cálculo — sem localização.")
                : t("paradas fora do cálculo — sem localização.")}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Círculo numerado do planejador — a etapa em que a pessoa está. */
function Passo({ numero }: { numero: number }) {
  return (
    <span
      aria-hidden
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums"
    >
      {numero}
    </span>
  );
}

