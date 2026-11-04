"use client";

import * as React from "react";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import {
  descarregarOutbox,
  enfileirarDesfecho,
  lerRotaLocal,
  pendentesDaCarga,
  salvarRotaLocal,
  type DesfechoPendente,
} from "@/lib/entregas/outbox";
import { comoMoeda, numeroDoPedido } from "@/lib/format/moeda";
import { MOTIVOS_DEVOLUCAO, ROTULO_MOTIVO_DEVOLUCAO, type MotivoDevolucao } from "@/lib/schemas/expedicao";
import { CaretRight, Check, Clock } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { MapaRota, type PontoParadaMapa } from "./_mapa-rota";
import type { RotaCarregada } from "./_roteirizador";

function posicaoAtual(timeoutMs = 10000): Promise<GeolocationPosition> {
  return new Promise((ok, falha) => {
    if (!("geolocation" in navigator)) {
      falha(new Error("sem gps"));
      return;
    }
    navigator.geolocation.getCurrentPosition(ok, falha, { enableHighAccuracy: true, timeout: timeoutMs });
  });
}

/**
 * MODO MOTORISTA — o celular na cabine.
 *
 * Uma entrega por vez: próxima parada, navegar (app de navegação do aparelho —
 * não reinventamos Waze), cheguei, entregue/não-entregue com motivo, foto do
 * comprovante. O rastreio GPS só existe com a rota ativa e com o botão
 * ligado (§32): desligou ou finalizou, encerrou.
 */
export function ModoMotorista({
  cargaId,
  podeOperar,
  imersivo = false,
  aoMudar,
}: {
  cargaId: string;
  podeOperar: boolean;
  /**
   * Login de ENTREGADOR (0292): o mapa ocupa a tela inteira, como um app de
   * navegação, e os cartões sobem por cima dele numa folha. No painel
   * (`imersivo=false`) o desenho é o de sempre: mapa no topo, coluna abaixo.
   */
  imersivo?: boolean;
  aoMudar: () => void;
}) {
  const t = useT();
  const [rota, setRota] = React.useState<RotaCarregada | null>(null);
  const [versaoVista, setVersaoVista] = React.useState<number | null>(null);
  const [rastreando, setRastreando] = React.useState(false);
  const [motivoAberto, setMotivoAberto] = React.useState(false);
  const [motivo, setMotivo] = React.useState<MotivoDevolucao>("cliente_ausente");
  const [fila, setFila] = React.useState<DesfechoPendente[]>(() => pendentesDaCarga(cargaId));
  const [sincronizando, setSincronizando] = React.useState(false);
  // Folha da cabine: fechada mostra a próxima entrega; aberta, o roteiro.
  const [folhaAberta, setFolhaAberta] = React.useState(false);
  // Última posição do GPS — o "você está aqui" do mapa, como num app de mapas.
  const [minhaPosicao, setMinhaPosicao] = React.useState<{ lat: number; lng: number } | null>(null);
  const refVigia = React.useRef<number | null>(null);

  const recarregar = React.useCallback(async () => {
    try {
      const corpo = await apiClient.get<{ data: RotaCarregada }>(`/api/v1/shipments/${cargaId}/rota`);
      setRota(corpo.data);
      salvarRotaLocal(cargaId, corpo.data);
      setVersaoVista((v) => v ?? corpo.data.carga.rota_versao);
    } catch (e) {
      // Sem internet, a última rota vista vale: o motorista segue dirigindo.
      const local = lerRotaLocal<RotaCarregada>(cargaId);
      if (local) {
        setRota(local);
        setVersaoVista((v) => v ?? local.carga.rota_versao);
      } else {
        showApiError(e);
      }
    }
  }, [cargaId]);

  /** Manda a fila offline; volta sozinho quando a internet retorna. */
  const sincronizar = React.useCallback(async () => {
    const fila = pendentesDaCarga(cargaId);
    if (fila.length === 0 || sincronizando) return;
    setSincronizando(true);
    try {
      const r = await descarregarOutbox(async (item) => {
        await apiClient.patch(`/api/v1/shipments/${item.cargaId}/orders/${item.orderId}`, {
          status: item.status,
          ...(item.motivo ? { motivo: item.motivo } : {}),
          ...(item.latitude != null ? { latitude: item.latitude } : {}),
          ...(item.longitude != null ? { longitude: item.longitude } : {}),
          ocorrido_em: item.ocorrido_em,
        });
      });
      setFila(pendentesDaCarga(cargaId));
      if (r.enviados > 0) {
        toast.success(
          `${r.enviados} ${
            r.enviados === 1 ? t("entrega sincronizada") : t("entregas sincronizadas")
          }`,
        );
        await recarregar();
        aoMudar();
      }
      if (r.falhas.length > 0) {
        toast.error(`${r.falhas.length} ${t("ainda sem enviar — tenta de novo com sinal")}`);
      }
    } finally {
      setSincronizando(false);
    }
  }, [cargaId, sincronizando, recarregar, aoMudar, t]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  // Desliga o rastreio ao sair da tela (privacidade §32).
  React.useEffect(() => {
    return () => {
      if (refVigia.current != null) navigator.geolocation.clearWatch(refVigia.current);
    };
  }, []);

  // Internet voltou: descarrega sozinho, sem o motorista lembrar.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void sincronizar();
    const aoVoltar = () => void sincronizar();
    window.addEventListener("online", aoVoltar);
    return () => window.removeEventListener("online", aoVoltar);
  }, [sincronizar]);

  if (!rota) return <p className="text-sm text-muted-foreground">{t("Carregando rota…")}</p>;

  // O que está na fila offline vale como desfecho até o servidor confirmar:
  // o motorista vê a parada como feita e a rota avança mesmo sem internet.
  const mapaFila = new Map(fila.map((d) => [d.orderId, d]));
  const statusDe = (pedido: { order_id: string; status: string }) =>
    mapaFila.get(pedido.order_id)?.status ?? pedido.status;
  const pendentes = rota.paradas.filter((p) =>
    p.pedidos.some((x) => ["na_carga", "em_rota", "em_atendimento"].includes(statusDe(x))),
  );
  const feitas = rota.paradas.length - pendentes.length;
  const pctFeito = rota.paradas.length > 0 ? Math.round((feitas / rota.paradas.length) * 100) : 0;
  const proxima = pendentes[0] ?? null;
  const versaoNova = versaoVista != null && rota.carga.rota_versao > versaoVista;

  async function desfecho(orderId: string, status: "em_atendimento" | "entregue" | "devolvido") {
    let geo: { latitude?: number; longitude?: number } = {};
    try {
      const pos = await posicaoAtual(8000);
      geo = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      // Sem GPS a baixa vale igual — só sem coordenada.
    }
    const ocorrido_em = new Date().toISOString();
    const corpo = {
      status,
      ...(status === "devolvido" ? { motivo } : {}),
      ...geo,
      ocorrido_em,
    };
    try {
      await apiClient.patch(`/api/v1/shipments/${cargaId}/orders/${orderId}`, corpo);
      toast.success(status === "entregue" ? t("Entregue.") : status === "em_atendimento" ? t("Em atendimento.") : t("Registrado."));
      setMotivoAberto(false);
      await recarregar();
      aoMudar();
    } catch (e) {
      if (e instanceof ApiError) {
        // O servidor recusou (validação, conflito): enfileirar repetiria o erro.
        showApiError(e);
        return;
      }
      // Sem internet (ou servidor fora): guarda no aparelho e segue a rota.
      // O `ocorrido_em` de agora vale no servidor quando sincronizar.
      enfileirarDesfecho({ cargaId, orderId, status, ...(status === "devolvido" ? { motivo } : {}), ...geo, ocorrido_em });
      setFila(pendentesDaCarga(cargaId));
      setMotivoAberto(false);
      toast.success(t("Sem internet — salvo no aparelho, envia sozinho quando voltar."));
    }
  }

  async function transicao(acao: "iniciar" | "finalizar") {
    try {
      await apiClient.post(`/api/v1/shipments/${cargaId}/rota/${acao}`, {});
      toast.success(acao === "iniciar" ? t("Rota iniciada.") : t("Rota finalizada."));
      if (acao === "finalizar") pararRastreio();
      await recarregar();
      aoMudar();
    } catch (e) {
      showApiError(e);
    }
  }

  function iniciarRastreio() {
    if (!("geolocation" in navigator)) {
      toast.error(t("GPS indisponível neste aparelho."));
      return;
    }
    let ultimoEnvio = 0;
    let ultimaPos: { lat: number; lng: number } | null = null;
    refVigia.current = navigator.geolocation.watchPosition(
      (pos) => {
        const agora = Date.now();
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const moveu =
          !ultimaPos || Math.abs(ultimaPos.lat - lat) + Math.abs(ultimaPos.lng - lng) > 0.0005;
        if (agora - ultimoEnvio < 15000 && !moveu) return;
        ultimoEnvio = agora;
        ultimaPos = { lat, lng };
        setMinhaPosicao({ lat, lng });
        void apiClient
          .post(`/api/v1/shipments/${cargaId}/rota/posicao`, {
            latitude: lat,
            longitude: lng,
            precisao_m: pos.coords.accuracy ?? null,
          })
          .catch(() => undefined);
      },
      () => toast.error(t("GPS negado ou indisponível.")),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    setRastreando(true);
    toast.success(t("Rastreio ligado — só durante esta rota."));
  }

  function pararRastreio() {
    if (refVigia.current != null) navigator.geolocation.clearWatch(refVigia.current);
    refVigia.current = null;
    setRastreando(false);
    toast.success(t("GPS encerrado."));
  }

  const navegarHref =
    proxima?.latitude != null && proxima?.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${proxima.latitude},${proxima.longitude}`
      : proxima?.endereco
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(proxima.endereco)}`
        : null;

  // O MAPA É O HERÓI — como no app de navegação. Ele fica no topo, colado na
  // tela (`sticky`), e os cartões rolam por cima: o motorista vê a rota e a
  // próxima parada sem perder o desenho.
  const pontosDoMapa: PontoParadaMapa[] = rota.paradas.map((p, i) => {
    const sts = p.pedidos.map((x) => x.status);
    const estado: PontoParadaMapa["estado"] = sts.every((x) => x === "entregue")
      ? "entregue"
      : sts.some((x) => x === "devolvido")
        ? "problema"
        : p.chave === proxima?.chave
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
      pedidos: p.pedidos.map((x) => ({
        order_id: x.order_id,
        numero: x.numero,
        total_cents: x.total_cents,
        status: x.status,
      })),
    };
  });
  const origemDoMapa =
    rota.carga.origem_lat != null && rota.carga.origem_lng != null
      ? {
          lat: rota.carga.origem_lat,
          lng: rota.carga.origem_lng,
          endereco: rota.carga.origem_endereco,
        }
      : null;

  const mapa = (altura: string, cheio: boolean) => (
    <MapaRota
      altura={altura}
      imersivo={cheio}
      paradas={pontosDoMapa}
      geometria={rota.carga.rota_geojson?.geometria ?? []}
      origem={origemDoMapa}
      motorista={minhaPosicao}
      rastro={[]}
      modoMarcar={false}
      pinoPendente={null}
      aoClicarMapa={() => undefined}
      aoAcaoParada={() => undefined}
    />
  );

  // O MESMO conteúdo nos dois desenhos: no painel é uma coluna embaixo do mapa;
  // no celular do entregador é a folha que sobe por cima dele.
  const cartoes = (
    <>
      {/* ── O placar do dia ─────────────────────────────────────────────────
          Na cabine, o número que importa é "quantas faltam" — não a lista de
          indicadores. O anel e a barra dizem a mesma coisa em duas leituras:
          de relance (anel) e no detalhe (barra). */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {t("Rota de hoje")}
            </p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-3xl leading-none font-semibold text-text tabular-nums">
                {feitas}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                / {rota.paradas.length} {t("entregas")}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pendentes.length === 0
                ? t("Tudo concluído.")
                : pendentes.length === 1
                  ? t("Falta 1 parada.")
                  : `${pendentes.length} ${t("paradas pela frente.")}`}
            </p>
          </div>
          <div
            aria-hidden
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(var(--color-success) ${pctFeito}%, var(--color-border) 0)`,
            }}
          >
            <span className="grid h-11 w-11 place-items-center rounded-full bg-surface text-xs font-semibold text-text tabular-nums">
              {pctFeito}%
            </span>
          </div>
        </div>
        <div
          className="h-1.5 w-full bg-muted"
          role="progressbar"
          aria-label={t("Entregas concluídas")}
          aria-valuemin={0}
          aria-valuemax={rota.paradas.length}
          aria-valuenow={feitas}
        >
          <div
            className="h-full bg-success transition-[width] duration-300"
            style={{ width: `${pctFeito}%` }}
          />
        </div>
      </Card>

      {fila.length > 0 && (
        <Card className="overflow-hidden border-warning/40 p-0">
          <div className="flex items-start gap-2.5 bg-warning-bg px-4 py-3 text-sm text-warning-fg">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">
              {fila.length} {t("aguardando envio (sem internet)")}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 border-warning/40 text-warning-fg"
              disabled={sincronizando}
              onClick={() => void sincronizar()}
            >
              {sincronizando ? t("Enviando…") : t("Sincronizar")}
            </Button>
          </div>
        </Card>
      )}

      {versaoNova && (
        <Card className="overflow-hidden border-info/40 p-0">
          <div className="space-y-2 bg-info-bg px-4 py-3 text-sm text-info-fg">
            <p>{t("A rota foi alterada no painel de expedição. Nova sequência disponível.")}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-info/40 text-info-fg"
                onClick={() => {
                  setVersaoVista(rota.carga.rota_versao);
                  void recarregar();
                }}
              >
                {t("Aplicar")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-info-fg"
                onClick={() => setVersaoVista(rota.carga.rota_versao)}
              >
                {t("Manter atual")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {rota.carga.status === "montando" && podeOperar && (
        <Button className="h-11 w-full" onClick={() => void transicao("iniciar")}>
          {t("Iniciar rota")}
        </Button>
      )}

      {proxima ? (
        <Card className="overflow-hidden p-0">
          <header className="flex items-center justify-between gap-2 border-b border-border bg-accent-soft px-4 py-2">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-accent uppercase">
              {t("Próxima entrega")} · {t("parada")}{" "}
              {rota.paradas.findIndex((p) => p.chave === proxima.chave) + 1} {t("de")}{" "}
              {rota.paradas.length}
            </p>
            <span className="shrink-0 text-[11px] font-medium text-accent tabular-nums">
              {proxima.pedidos.length}{" "}
              {proxima.pedidos.length === 1 ? t("pedido") : t("pedidos")}
            </span>
          </header>

          <div className="space-y-3 p-4">
            <div>
              <p className="text-xl leading-tight font-semibold text-text">{proxima.cliente}</p>
              {proxima.endereco ? (
                <p className="mt-1 text-sm leading-snug text-muted-foreground">
                  {proxima.endereco}
                </p>
              ) : (
                <p className="mt-1 text-sm text-warning-fg">{t("Sem endereço cadastrado.")}</p>
              )}
              {proxima.fone && (
                <a
                  href={`tel:${proxima.fone.replace(/[^\d+]/g, "")}`}
                  className="mt-1 inline-block text-sm font-medium text-accent underline underline-offset-4"
                >
                  {proxima.fone}
                </a>
              )}
            </div>

            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-stage-2/60 text-sm">
              {proxima.pedidos.map((x) => (
                <li key={x.order_id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="font-medium tabular-nums">{numeroDoPedido(x.numero)}</span>
                  <span className="font-medium tabular-nums">{comoMoeda(x.total_cents, "BRL")}</span>
                </li>
              ))}
            </ul>

            {/* `flex` + `flex-1`, não `grid-cols-2`: quando a parada não tem
                coordenada o "Navegar" não existe e o "Cheguei" ficava sozinho
                na metade esquerda, com um buraco ao lado. */}
            <div className="flex gap-2">
              {navegarHref && (
                <Button asChild className="h-11 flex-1">
                  <a href={navegarHref} target="_blank" rel="noopener noreferrer">
                    {t("Navegar")}
                  </a>
                </Button>
              )}
              {podeOperar && (
                <Button
                  className="h-11 flex-1"
                  variant="outline"
                  onClick={() => {
                    const alvo = proxima.pedidos.find((x) =>
                      ["na_carga", "em_rota", "em_atendimento"].includes(statusDe(x)),
                    );
                    if (alvo) void desfecho(alvo.order_id, "em_atendimento");
                  }}
                >
                  {t("Cheguei")}
                </Button>
              )}
            </div>

            {podeOperar && (
              <>
                {/* Verde sólido: o desfecho positivo é A ação da cabine e, em
                    contorno sobre `success-bg`, lia como botão desabilitado. */}
                <Button
                  className="h-12 w-full bg-success text-accent-fg hover:bg-success/90"
                  onClick={() => {
                    const alvo = proxima.pedidos.find((x) =>
                      ["na_carga", "em_rota", "em_atendimento"].includes(statusDe(x)),
                    );
                    if (alvo) void desfecho(alvo.order_id, "entregue");
                  }}
                >
                  <Check className="h-4 w-4" aria-hidden />
                  {t("Marcar como entregue")}
                </Button>

                {!motivoAberto ? (
                  <Button
                    className="w-full text-muted-foreground"
                    variant="ghost"
                    onClick={() => setMotivoAberto(true)}
                  >
                    {t("Não entregue")}
                  </Button>
                ) : (
                  <div className="space-y-2 rounded-xl border border-error/30 bg-error-bg/60 p-2.5">
                    <select
                      className="h-10 w-full rounded-lg border border-input bg-surface px-2 text-sm"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value as MotivoDevolucao)}
                      aria-label={t("Motivo")}
                    >
                      {MOTIVOS_DEVOLUCAO.map((m) => (
                        <option key={m} value={m}>
                          {ROTULO_MOTIVO_DEVOLUCAO[m]}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-9 flex-1"
                        onClick={() => {
                          const alvo = proxima.pedidos.find((x) =>
                            ["na_carga", "em_rota", "em_atendimento"].includes(statusDe(x)),
                          );
                          if (alvo) void desfecho(alvo.order_id, "devolvido");
                        }}
                      >
                        {t("Confirmar")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9"
                        onClick={() => setMotivoAberto(false)}
                      >
                        {t("Voltar")}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="space-y-3 bg-success-bg px-4 py-5 text-center">
            <Check className="mx-auto h-7 w-7 text-success-fg" aria-hidden />
            <p className="text-sm font-semibold text-success-fg">
              {t("Todas as paradas concluídas.")}
            </p>
            {podeOperar && rota.carga.status === "em_rota" && (
              <Button className="h-11 w-full" onClick={() => void transicao("finalizar")}>
                {t("Finalizar rota")}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* ── O roteiro inteiro, para conferir de relance ───────────────────── */}
      <Card className="overflow-hidden p-0">
        <header className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-2">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {t("Roteiro")}
          </p>
          <p className="text-[11px] text-text-subtle tabular-nums">
            {rota.paradas.length} {rota.paradas.length === 1 ? t("parada") : t("paradas")}
          </p>
        </header>
        <ol className="divide-y divide-border text-sm">
          {rota.paradas.map((p, i) => {
            const temPendente = p.pedidos.some((x) => mapaFila.has(x.order_id));
            const feito = p.pedidos.every((x) => statusDe(x) === "entregue") && !temPendente;
            const atual = p.chave === proxima?.chave;
            return (
              <li
                key={p.chave}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5",
                  atual && "bg-accent-soft/60",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                    feito
                      ? "bg-success-bg text-success-fg"
                      : temPendente
                        ? "bg-warning-bg text-warning-fg"
                        : atual
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted text-muted-foreground",
                  )}
                >
                  {feito ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : temPendente ? (
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                  ) : atual ? (
                    <CaretRight className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    feito ? "text-muted-foreground line-through decoration-border" : "text-text",
                    atual && "font-medium",
                  )}
                >
                  {p.cliente}
                </span>
                {atual && (
                  <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[9px] font-semibold tracking-wide text-accent-foreground uppercase">
                    {t("agora")}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      {rota.carga.status === "em_rota" && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-text">{t("Rastreio GPS")}</p>
            <p className="text-[11px] text-muted-foreground">
              {rastreando ? t("Ligado — só durante esta rota.") : t("Desligado.")}
            </p>
          </div>
          <Button
            size="sm"
            variant={rastreando ? "destructive" : "outline"}
            className="h-9 shrink-0"
            onClick={() => (rastreando ? pararRastreio() : iniciarRastreio())}
          >
            {rastreando ? t("Parar") : t("Ligar")}
          </Button>
        </div>
      )}
    </>
  );

  if (!imersivo) {
    return (
      <div className="mx-auto max-w-xl space-y-3.5 pb-8">
        <div className="sticky top-0 z-10">{mapa("40dvh", false)}</div>
        {cartoes}
      </div>
    );
  }

  /*
   * A CABINE, TELA CHEIA (0292) — o mapa é o aplicativo.
   *
   * O celular fica preso na vertical, no suporte do painel: o que precisa
   * caber é o desenho da rota e a próxima parada. Por isso o mapa ocupa
   * `100%` da altura e os cartões vivem numa folha que sobe do rodapé —
   * exatamente o desenho do app de navegação, com a ação ao alcance do dedo.
   *
   * A folha tem duas posições: fechada (próxima entrega + ações) e aberta
   * (o roteiro inteiro). Ela rola por dentro; o mapa nunca sai do lugar.
   */
  return (
    <div className="relative h-full w-full overflow-hidden bg-muted">
      <div className="absolute inset-0">{mapa("100%", true)}</div>

      {/* Placar flutuante — o único número que importa em movimento. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-2.5 pt-2.5">
        <div className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-border bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur">
          <span className="text-xs font-semibold text-text tabular-nums">
            {feitas}/{rota.paradas.length}
          </span>
          <span
            aria-hidden
            className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="block h-full bg-success transition-[width] duration-300"
              style={{ width: `${pctFeito}%` }}
            />
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{pctFeito}%</span>
          <button
            type="button"
            onClick={() => setFolhaAberta((v) => !v)}
            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-accent"
            aria-expanded={folhaAberta}
          >
            {folhaAberta ? t("Fechar") : t("Roteiro")}
          </button>
        </div>
      </div>

      {/* A folha. `max-h` deixa o mapa respirar em cima; o conteúdo rola. */}
      <div className="absolute inset-x-0 bottom-0 z-20">
        <div className="mx-auto flex max-h-[72dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border-t border-border bg-surface shadow-[0_-10px_30px_rgba(0,0,0,0.18)]">
          <button
            type="button"
            onClick={() => setFolhaAberta((v) => !v)}
            aria-label={folhaAberta ? t("Recolher") : t("Expandir")}
            className="mx-auto flex w-full shrink-0 justify-center py-1.5"
          >
            <span aria-hidden className="h-1 w-10 rounded-full bg-border" />
          </button>
          <div
            className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3"
            // `env()` não é escolha de espaçamento: é o inset do iOS. Por isso
            // vai em estilo, e não como classe fora da escala.
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            {cartoes}
          </div>
          {/* O Leaflet ancora a atribuição no canto inferior direito; a folha
              cobre esse canto, então o crédito do OpenStreetMap sobe para cá. */}
          <p className="shrink-0 border-t border-border px-3 py-1 text-right text-[9px] text-text-subtle">
            © OpenStreetMap
          </p>
        </div>
      </div>
    </div>
  );
}
