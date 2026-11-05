"use client";

import * as React from "react";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
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
import { formatarDistancia, formatarDuracao, haversineM, ordemCompleta } from "@/lib/rotas/roteamento";
import { MOTIVOS_DEVOLUCAO, ROTULO_MOTIVO_DEVOLUCAO, type MotivoDevolucao } from "@/lib/schemas/expedicao";
import { CaretRight, Check, Clock, Crosshair, MapPin, NavigationArrow } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { MapaRota, type PontoParadaMapa } from "./_mapa-rota";
import type { PropostaRota, RotaCarregada } from "./_roteirizador";

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
  /** Rota da navegação até a próxima parada (desenhada em azul no mapa). */
  const [navegacao, setNavegacao] = React.useState<{ geometria: number[][]; distancia_m: number; duracao_s: number } | null>(null);
  const [calculandoRota, setCalculandoRota] = React.useState(false);
  // "Seguindo você": o mapa acompanha o GPS a cada ping. Desligado quando o
  // dedo arrasta o mapa — ver `aoArrastar` em `MapaRota`.
  const [seguir, setSeguir] = React.useState(false);
  // Qual modo de organização está rodando (senão os dois botões piscam juntos).
  const [organizando, setOrganizando] = React.useState<"tsp" | "distancia" | null>(null);
  const confirmar = useConfirmar();
  const refVigia = React.useRef<number | null>(null);
  // true = a posição do watch também vai para o servidor (botão de rastreio).
  const refPublicando = React.useRef(false);

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

  // ─── UM WATCH SÓ: O PONTO AZUL SEMPRE, A PUBLICAÇÃO SÓ COM O RASTREIO ────
  //
  // Antes havia dois caminhos: uma leitura ÚNICA ao abrir (o ponto aparecia e
  // congelava) e um segundo `watchPosition` que só nascia quando o motorista
  // achava o botão "Ligar rastreio" — que mora dentro da folha. Na cabine o
  // mapa parecia não ter GPS: o ponto não andava com o carro.
  //
  // Agora há UM watch, vivo enquanto a tela existir. Ele mantém o ponto azul
  // andando. Publicar posição para o servidor continua sendo decisão explícita
  // (§32) — é o que `refPublicando` liga e desliga, e o único trecho que fala
  // com a API.
  React.useEffect(() => {
    if (!("geolocation" in navigator)) return;
    let ultimoEnvio = 0;
    let ultimaPos: { lat: number; lng: number } | null = null;
    refVigia.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setMinhaPosicao({ lat, lng });
        if (!refPublicando.current) return;
        // 15s ou meia quadra: o escritório acompanha sem transformar o celular
        // do motorista num transmissor de bateria.
        const agora = Date.now();
        const moveu =
          !ultimaPos ||
          Math.abs(ultimaPos.lat - lat) + Math.abs(ultimaPos.lng - lng) > 0.0005;
        if (agora - ultimoEnvio < 15000 && !moveu) return;
        ultimoEnvio = agora;
        ultimaPos = { lat, lng };
        void apiClient
          .post(`/api/v1/shipments/${cargaId}/rota/posicao`, {
            latitude: lat,
            longitude: lng,
            precisao_m: pos.coords.accuracy ?? null,
          })
          .catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => {
      if (refVigia.current != null) navigator.geolocation.clearWatch(refVigia.current);
      refVigia.current = null;
    };
  }, [cargaId]);

  /** O gesto de "onde estou": recentraliza no ponto azul e volta a seguir. */
  async function centralizarEmMim() {
    setSeguir(true);
    try {
      const pos = await posicaoAtual(8000);
      setMinhaPosicao({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      toast.error(t("GPS negado ou indisponível."));
    }
  }

  /**
   * REORGANIZAR AS PARADAS, DO CELULAR — a mesma operação do planejador da web.
   *
   * O motorista na rua descobre que a ordem não fecha (obra, cliente fechado,
   * trânsito) e até aqui só o escritório resolvia. O servidor já aceita `agent`
   * nessa rota — é o role dele — e a origem é "onde estou": recomeçar do ponto
   * atual é o que faz sentido na rua.
   *
   * O cálculo NÃO grava nada: devolve a proposta. A confirmação mostra o que
   * vai mudar (paradas, distância, tempo) e só então a ordem é salva — igual à
   * web. Reordenar a carga de alguém é ato com consequência.
   */
  async function reorganizar(modo: "tsp" | "distancia") {
    if (organizando) return;
    setOrganizando(modo);
    try {
      let origem: { latitude: number; longitude: number } | null = null;
      try {
        const pos = await posicaoAtual(8000);
        origem = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch {
        // Sem GPS, a ordem por distância cai na base salva da carga. Se não
        // houver base, o servidor recusa e nomeia o que falta — nunca
        // inventamos uma origem: "perto de quê" sem base é pergunta sem
        // resposta.
        origem = null;
      }

      const corpo = await apiClient.post<{ data: PropostaRota }>(
        `/api/v1/shipments/${cargaId}/rota/otimizar`,
        {
          modo,
          origem,
          retornar_origem: rota?.carga.retornar_origem,
          tempo_parada_min: rota?.carga.tempo_parada_min,
        },
      );
      const p = corpo.data;

      const seguirCom = await confirmar({
        title: modo === "tsp" ? t("Ordenar pelas ruas?") : t("Ordenar por distância?"),
        description:
          `${p.ordem.length} ${t("paradas")} · ${formatarDistancia(p.distancia_m)} · ` +
          `${formatarDuracao(p.duracao_total_s)}` +
          (p.ruas ? "" : ` — ${t("aproximada: o serviço de ruas está fora do ar")}`),
        confirmLabel: t("Aplicar"),
      });
      if (!seguirCom) return;

      const salva = await apiClient.patch<{ data: RotaCarregada }>(
        `/api/v1/shipments/${cargaId}/rota/ordem`,
        {
          ordem: ordemCompleta(p.ordem, p.nao_roteirizaveis),
          distancia_m: p.distancia_m,
          duracao_s: p.duracao_dirigindo_s,
          geometria: p.geometria,
          provedor: p.provedor,
          ruas: p.ruas,
          modo: p.modo,
          retornar_origem: p.retornar_origem,
          tempo_parada_min: p.tempo_parada_min,
          ...(p.origem
            ? {
                origem_endereco: p.origem.endereco,
                origem_lat: p.origem.lat,
                origem_lng: p.origem.lng,
              }
            : {}),
        },
      );
      // A versão sobe ao gravar a ordem. Marcar como VISTA aqui é o que evita
      // a faixa "a rota foi alterada no painel" aparecer para quem acabou de
      // alterá-la — o aviso é para mudança vinda de fora, não para esta.
      setRota(salva.data);
      salvarRotaLocal(cargaId, salva.data);
      setVersaoVista(salva.data.carga.rota_versao);
      aoMudar();
      toast.success(t("Nova ordem aplicada."));
    } catch (e) {
      showApiError(e);
    } finally {
      setOrganizando(null);
    }
  }

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
      setNavegacao(null);
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
    // O watch já está de pé (efeito de montagem); ligar o rastreio só passa a
    // PUBLICAR as posições que ele já entrega. Dois watches disputando o GPS é
    // como a leitura piora e a bateria acaba mais rápido.
    refPublicando.current = true;
    setRastreando(true);
    setSeguir(true);
    toast.success(t("Rastreio ligado — só durante esta rota."));
  }

  function pararRastreio() {
    // Para de publicar, mas o ponto azul continua andando: apagar o mapa de
    // quem está dirigindo não é "encerrar o rastreio", é cegar o motorista.
    refPublicando.current = false;
    setRastreando(false);
    toast.success(t("GPS encerrado."));
  }

  const podeNavegar = proxima?.latitude != null && proxima?.longitude != null;
  const distanciaProximaM =
    minhaPosicao && proxima?.latitude != null && proxima?.longitude != null
      ? haversineM(minhaPosicao, { lat: proxima.latitude, lng: proxima.longitude })
      : null;

  /**
   * NAVEGAR DENTRO DO APP — sem sair para o Google Maps.
   *
   * A rota sai do mesmo OSRM que planeja a carga (`/api/v1/rotas`): sai da
   * posição atual do motorista e vai até a próxima parada. O traçado entra no
   * mapa em azul, por cima da rota planejada, e o mapa passa a seguir o GPS.
   *
   * Sem coordenada na parada não há rota por ruas — aí a tela diz o motivo, em
   * vez de abrir outro aplicativo por baixo.
   */
  async function navegar() {
    if (!proxima || proxima.latitude == null || proxima.longitude == null) {
      toast.error(t("Esta parada não tem coordenada no mapa."));
      return;
    }
    let de = minhaPosicao;
    if (!de) {
      try {
        const pos = await posicaoAtual(10000);
        de = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMinhaPosicao(de);
      } catch {
        toast.error(t("Ligue o GPS para calcular a rota."));
        return;
      }
    }
    setCalculandoRota(true);
    try {
      const corpo = await apiClient.get<{
        data: { geometria: number[][]; distancia_m: number; duracao_s: number };
      }>(`/api/v1/rotas?de=${de.lat},${de.lng}&para=${proxima.latitude},${proxima.longitude}`);
      setNavegacao(corpo.data);
      setSeguir(true);
      toast.success(t("Rota calculada — siga a linha azul."));
    } catch {
      toast.error(t("Não consegui calcular a rota agora. Tente de novo com sinal."));
    } finally {
      setCalculandoRota(false);
    }
  }

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
      navegacao={navegacao?.geometria ?? []}
      modoMarcar={false}
      pinoPendente={null}
      aoClicarMapa={() => undefined}
      aoAcaoParada={() => undefined}
      seguir={seguir}
      aoArrastar={() => setSeguir(false)}
    />
  );

  // O MESMO conteúdo nos dois desenhos: no painel é uma coluna embaixo do mapa;
  // no celular do entregador é a folha que sobe por cima dele.
  const cartoes = (
    <>
      {/* ── O placar do dia ─────────────────────────────────────────────────
          Na cabine, o número que importa é "quantas faltam" — não a lista de
          indicadores. O anel e a barra dizem a mesma coisa em duas leituras:
          de relance (anel) e no detalhe (barra).
          Na tela cheia ele NÃO entra: o pill flutuante sobre o mapa já diz
          `feitas/total` e a %, e cada pixel da folha é altura de mapa. */}
      {!imersivo && (
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
      )}

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
              {podeNavegar && (
                <Button
                  className="h-11 flex-1"
                  disabled={calculandoRota}
                  onClick={() => void navegar()}
                >
                  {calculandoRota ? t("Calculando…") : t("Navegar")}
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

      {/* ── O roteiro inteiro, para conferir de relance ─────────────────────
          Na cabine ele é o conteúdo do "Roteiro" (a folha aberta); fechada, a
          folha mostra só a próxima entrega. */}
      {(folhaAberta || !imersivo) && (
      <Card className="overflow-hidden p-0">
        <header className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-2">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {t("Roteiro")}
          </p>
          <p className="text-[11px] text-text-subtle tabular-nums">
            {rota.paradas.length} {rota.paradas.length === 1 ? t("parada") : t("paradas")}
          </p>
        </header>

        {/* ── ORGANIZAR, DO CELULAR ──────────────────────────────────────────
            A mesma operação do planejador da web ("Ordenar por distância" /
            "Otimizar por ruas"), aqui sem sair da cabine. É a pergunta que o
            motorista faz na rua — "qual é a próxima mais perto?" — e que até
            agora só o escritório respondia. A origem é onde ele está; o
            cálculo devolve proposta e a confirmação mostra o resultado antes
            de a ordem valer. */}
        {podeOperar && (
          <div className="border-b border-border bg-stage-2/40 px-4 py-2.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {t("Organizar paradas")}
            </p>
            <div className="mt-1.5 flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-9 flex-1"
                disabled={organizando !== null}
                onClick={() => void reorganizar("distancia")}
              >
                {organizando === "distancia" ? t("Calculando…") : t("Por distância")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 flex-1"
                disabled={organizando !== null}
                onClick={() => void reorganizar("tsp")}
              >
                {organizando === "tsp" ? t("Calculando…") : t("Por ruas")}
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-text-subtle">
              {t("A nova ordem aparece para você conferir antes de valer.")}
            </p>
          </div>
        )}

        <ol className="divide-y divide-border text-sm">
          {rota.paradas.map((p, i) => {
            const temPendente = p.pedidos.some((x) => mapaFila.has(x.order_id));
            const feito = p.pedidos.every((x) => statusDe(x) === "entregue") && !temPendente;
            const atual = p.chave === proxima?.chave;
            return (
              <li
                key={p.chave}
                className={cn(
                  "flex items-start gap-3 px-4 py-2.5",
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
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
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
                  </div>
                  {(p.itens?.length ?? 0) > 0 && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {(p.itens ?? [])
                        .map((it) => `${it.quantidade}× ${it.nome}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
      )}

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
   * O CARTÃO COMPACTO — o que a folha mostra FECHADA, e por que ele existe.
   *
   * A folha fechada mostrava o cartão inteiro da próxima entrega (telefone,
   * lista de pedidos, "Cheguei", "Marcar como entregue", "Não entregue"). Eram
   * ~700px num celular de 900: o mapa — que é o motivo de a tela existir —
   * ficava com um terço. No app de mapa que o motorista conhece, a folha
   * fechada é um cartão de destino com UMA ação, e o resto está atrás do
   * gesto de subir.
   *
   * Aqui a folha fechada mostra cliente, endereço e as duas ações do momento
   * (navegar e entregar). O resto continua a um toque: a alça, o "Roteiro" do
   * placar ou o próprio cartão.
   */
  const ordemDaProxima = proxima
    ? rota.paradas.findIndex((p) => p.chave === proxima.chave) + 1
    : 0;
  const alvoDaProxima = proxima?.pedidos.find((x) =>
    ["na_carga", "em_rota", "em_atendimento"].includes(statusDe(x)),
  );

  const cartaoCompacto = (
    <div className="pb-1">
      {proxima ? (
        <>
          <button
            type="button"
            onClick={() => setFolhaAberta(true)}
            className="w-full px-1 text-left"
            aria-label={t("Abrir detalhes desta entrega")}
          >
            <p className="text-[10px] font-semibold tracking-[0.14em] text-accent uppercase">
              {t("Próxima entrega")} · {t("parada")} {ordemDaProxima} {t("de")}{" "}
              {rota.paradas.length}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[22px] leading-tight font-semibold tracking-tight text-text">
              {proxima.cliente}
            </p>
            {proxima.endereco ? (
              <p className="mt-1 flex items-center gap-1 text-[13px] leading-snug text-muted-foreground">
                <MapPin size={13} aria-hidden className="mt-0.5 shrink-0" />
                <span className="line-clamp-2">{proxima.endereco}</span>
              </p>
            ) : (
              <p className="mt-1 text-[13px] text-warning-fg">{t("Sem endereço cadastrado.")}</p>
            )}
            {distanciaProximaM != null && (
              <p className="mt-1 text-xs font-medium text-accent tabular-nums">
                {t("a")} {formatarDistancia(distanciaProximaM)}
              </p>
            )}
            {(proxima.itens?.length ?? 0) > 0 && (
              <ul className="mt-2 space-y-0.5">
                {proxima.itens!.slice(0, 3).map((it, i) => (
                  <li
                    key={`${it.codigo}-${i}`}
                    className="flex items-baseline gap-1.5 text-[13px] text-text"
                  >
                    <span className="shrink-0 font-semibold tabular-nums">{it.quantidade}×</span>
                    <span className="truncate">{it.nome}</span>
                  </li>
                ))}
                {proxima.itens!.length > 3 && (
                  <li className="text-xs text-muted-foreground">
                    +{proxima.itens!.length - 3} {t("itens")}
                  </li>
                )}
              </ul>
            )}
          </button>

          <div className="mt-2.5 flex gap-2">
            {podeNavegar && (
              <Button
                className="h-12 flex-1 rounded-2xl text-[15px]"
                disabled={calculandoRota}
                onClick={() => void navegar()}
              >
                <NavigationArrow size={17} aria-hidden />
                {calculandoRota ? t("Calculando…") : t("Navegar")}
              </Button>
            )}
            {podeOperar && (
              <Button
                className="h-12 flex-1 rounded-2xl bg-success text-[15px] text-accent-fg hover:bg-success/90"
                onClick={() => {
                  if (alvoDaProxima) void desfecho(alvoDaProxima.order_id, "entregue");
                }}
              >
                <Check className="h-4 w-4" aria-hidden />
                {t("Entregue")}
              </Button>
            )}
          </div>

          {/* O rastreio continua a um toque. Ele mora no cartão completo, que
              agora está atrás do gesto de subir — e publicação de posição é o
              que o escritório usa para acompanhar a carga (§32). Sem esta
              linha, ligar o GPS exigiria descobrir que a folha abre. */}
          {rota.carga.status === "em_rota" && (
            <button
              type="button"
              onClick={() => (rastreando ? pararRastreio() : iniciarRastreio())}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 py-1 text-xs text-muted-foreground"
            >
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  rastreando ? "bg-success" : "bg-muted-foreground/50",
                )}
              />
              {rastreando ? t("Rastreio ligado — só nesta rota") : t("Ligar rastreio")}
            </button>
          )}
        </>
      ) : (
        <div className="flex items-center gap-3 px-1 py-1">
          <Check className="h-6 w-6 shrink-0 text-success-fg" aria-hidden />
          <p className="min-w-0 flex-1 text-sm font-semibold text-success-fg">
            {t("Todas as paradas concluídas.")}
          </p>
          {podeOperar && rota.carga.status === "em_rota" && (
            <Button className="h-10 shrink-0" onClick={() => void transicao("finalizar")}>
              {t("Finalizar rota")}
            </Button>
          )}
        </div>
      )}
    </div>
  );

  /*
   * A CABINE, TELA CHEIA (0292) — o mapa é o aplicativo.
   *
   * O celular fica preso na vertical, no suporte do painel: o que precisa
   * caber é o desenho da rota e a próxima parada. Por isso o mapa ocupa
   * `100%` da altura e os cartões vivem numa folha que sobe do rodapé —
   * exatamente o desenho do app de navegação, com a ação ao alcance do dedo.
   *
   * A folha tem duas posições: fechada (o cartão do destino, com uma ação) e
   * aberta (o roteiro inteiro). Ela rola por dentro; o mapa nunca sai do lugar.
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

      {/* A faixa da navegação: o motorista vê para onde está indo e quanto
          falta, sem sair do app. "Encerrar" volta ao mapa da rota inteira. */}
      {navegacao && (
        <div className="absolute top-14 left-3 z-20 max-w-[70%]">
          <div className="flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1.5 text-white shadow-lg">
            <span className="text-xs font-semibold tabular-nums">
              {formatarDistancia(navegacao.distancia_m)}
            </span>
            <span className="text-[11px] text-white/80 tabular-nums">
              {formatarDuracao(navegacao.duracao_s)}
            </span>
            <button
              type="button"
              onClick={() => setNavegacao(null)}
              className="shrink-0 rounded-full px-1.5 text-[11px] font-medium text-white/90 underline underline-offset-2"
            >
              {t("Encerrar")}
            </button>
          </div>
        </div>
      )}

      {/* O "onde estou" — botão redondo no canto, o gesto de todo app de mapa.
          `aria-pressed` porque ele ALTERNA o modo de seguir, não só centraliza
          uma vez: aceso, cada ping do GPS recentraliza. */}
      <button
        type="button"
        onClick={() => void centralizarEmMim()}
        aria-label={t("Centralizar em mim")}
        aria-pressed={seguir}
        title={t("Centralizar em mim")}
        className={`absolute top-16 right-3 z-20 grid h-11 w-11 place-items-center rounded-full border shadow-lg backdrop-blur transition active:scale-95 ${
          seguir
            ? "border-accent-600 bg-accent-600 text-white"
            : "border-border bg-background/95 text-text"
        }`}
      >
        <Crosshair size={20} weight={seguir ? "fill" : "regular"} aria-hidden />
      </button>

      {/* A folha. `max-h` deixa o mapa respirar em cima; o conteúdo rola. */}
      <div className="absolute inset-x-0 bottom-0 z-20">
        <div
          className={`mx-auto flex w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border-t border-border bg-surface shadow-[0_-18px_50px_rgba(0,0,0,0.28)] ${
            folhaAberta ? "max-h-[80dvh]" : "max-h-[34dvh]"
          }`}
        >
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
            {folhaAberta ? cartoes : cartaoCompacto}
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
