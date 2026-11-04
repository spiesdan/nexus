"use client";

import * as React from "react";
import type { Layer, Map as MapaLeaflet } from "leaflet";

import "leaflet/dist/leaflet.css";

import { useT } from "@/hooks/i18n/useT";
import { comoMoeda } from "@/lib/format/moeda";

export interface PontoParadaMapa {
  chave: string;
  cliente: string;
  contact_id: string | null;
  endereco: string | null;
  fone: string | null;
  lat: number | null;
  lng: number | null;
  /** Posição 1-based na ordem atual. */
  ordem: number;
  estado: "pendente" | "proxima" | "atendimento" | "entregue" | "problema";
  pedidos: { order_id: string; numero: number; total_cents: number; status: string }[];
}

export interface PontoMotorista {
  lat: number;
  lng: number;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const COR_ESTADO: Record<PontoParadaMapa["estado"], string> = {
  pendente: "#7c3aed",
  proxima: "#2563eb",
  atendimento: "#d97706",
  entregue: "#16a34a",
  problema: "#dc2626",
};

const SIMBOLO_ESTADO: Record<PontoParadaMapa["estado"], string> = {
  pendente: "",
  proxima: "▶",
  atendimento: "◉",
  entregue: "✓",
  problema: "!",
};

/**
 * MAPA DA ROTA — Leaflet de verdade: geometria pelas ruas (OSRM), marcadores
 * numerados com estado (número + símbolo + cor + tooltip, nunca só cor),
 * origem, motorista ao vivo, rastro realizado e modo "marcar no mapa".
 *
 * Na CABINE (0292) ele é o aplicativo: ocupa a tela toda, não tem botão de
 * zoom (o gesto é pinça, como em qualquer app de mapa) e a posição do
 * motorista é o ponto azul de sempre — anel branco, sem caminhãozinho.
 */
export function MapaRota({
  paradas,
  geometria,
  origem,
  motorista,
  rastro,
  altura,
  modoMarcar,
  pinoPendente,
  aoClicarMapa,
  aoAcaoParada,
  sobreposicao,
  imersivo = false,
  seguir = false,
  aoArrastar,
}: {
  paradas: PontoParadaMapa[];
  /** GeoJSON [lng,lat] da rota planejada. */
  geometria: number[][];
  origem: { lat: number; lng: number; endereco: string | null } | null;
  motorista: PontoMotorista | null;
  /** Rastro realizado [[lat,lng]...]. */
  rastro: [number, number][];
  altura?: string;
  modoMarcar: boolean;
  /** Pino pendente (aguardando confirmação — ainda NÃO salvo). */
  pinoPendente: { lat: number; lng: number } | null;
  aoClicarMapa: (lat: number, lng: number) => void;
  aoAcaoParada: (chave: string, acao: "cheguei" | "entregue") => void;
  // Conteúdo flutuante sobre o mapa (distância, tempo, legenda). Fica DENTRO
  // do contêiner do mapa para não escorregar para cima da legenda abaixo dele;
  // `pointer-events-none` no invólucro garante que o mapa continue clicável.
  // Em `//` e não em JSDoc de propósito: o leitor de stacking context
  // (tests/unit/leaflet-isolado-em-contexto-de-stack.test.ts) remove comentários
  // por regex e um bloco `/** ... */` aqui fazia a remoção engolir o
  // `ref={refCaixa}` mais abaixo, reprovando o teste sem defeito nenhum.
  sobreposicao?: React.ReactNode;
  /**
   * Tela cheia (0292 — cabine do entregador): sem canto arredondado nem borda,
   * porque o mapa é o fundo da tela e não um cartão dentro dela.
   */
  imersivo?: boolean;
  /**
   * Modo "seguindo você": a cada posição nova do GPS o mapa centraliza no
   * motorista, no zoom de rua. É o comportamento de app de navegação — e é
   * DESLIGADO quando o dedo arrasta o mapa, senão o mapa briga com quem olha
   * outra parte da rota.
   */
  seguir?: boolean;
  /** O dedo arrastou o mapa: quem chamou desliga o modo "seguindo você". */
  aoArrastar?: () => void;
}) {
  const t = useT();
  const refCaixa = React.useRef<HTMLDivElement>(null);
  const refMapa = React.useRef<MapaLeaflet | null>(null);
  const refCamadas = React.useRef<Layer[]>([]);
  const refObservador = React.useRef<ResizeObserver | null>(null);
  // O desenho mora depois dos efeitos (regra do lint): os efeitos iniciais
  // despacham pelo ref, que a atribuição abaixo liga na função real.
  const refRedesenhar = React.useRef<(m: MapaLeaflet) => void>(() => undefined);
  const refProps = React.useRef({ paradas, geometria, origem, motorista, rastro, modoMarcar, pinoPendente, aoClicarMapa, aoAcaoParada, imersivo, seguir, aoArrastar });
  // Quem já arrastou o mapa não quer ser reenquadrado a cada dado novo. Vive em
  // ref porque o Leaflet (fora do React) escreve aqui.
  const refArrastou = React.useRef(false);

  // Props frescas para os callbacks do Leaflet (mapa vive fora do React).
  // Em efeito, não no render: escrever ref no render quebra a atualização.
  React.useEffect(() => {
    refProps.current = { paradas, geometria, origem, motorista, rastro, modoMarcar, pinoPendente, aoClicarMapa, aoAcaoParada, imersivo, seguir, aoArrastar };
  });

  function redesenharCamadas(m: MapaLeaflet) {
    const { paradas: ps, geometria: geo, origem: ori, motorista: mot, rastro: ras, pinoPendente: pino, seguir: seguindo } = refProps.current;
    void import("leaflet").then(({ default: L }) => {
      // Limpa só as camadas de dados (o tile fica): lista própria, sem
      // fuçar `options` do Leaflet.
      for (const c of refCamadas.current) m.removeLayer(c);
      refCamadas.current = [];
      const por = (camada: Layer): Layer => {
        refCamadas.current.push(camada);
        return camada;
      };
      const comCoord = ps.filter((p) => p.lat != null && p.lng != null);

      // ─── A ROTA COM CONTORNO BRANCO ────────────────────────────────────────
      //
      // Duas polilinhas: uma branca mais grossa embaixo, a colorida em cima.
      // É o desenho de app de navegação (o contorno separa a linha do mapa em
      // rua clara, onde uma linha fina colorida some). Antes era uma linha só,
      // de 4px, que desaparecia sobre o bege do OSM.
      if (geo.length > 1) {
        const pontos = geo.map((c) => [c[1] as number, c[0] as number] as [number, number]);
        por(L.polyline(pontos, { color: "#ffffff", weight: 9, opacity: 0.95, lineCap: "round", lineJoin: "round" })).addTo(m);
        por(L.polyline(pontos, { color: "#7c3aed", weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round" })).addTo(m);
      }
      if (ras.length > 1) {
        por(L.polyline(ras, { color: "#6b7280", weight: 3, opacity: 0.7, dashArray: "6 6" })).addTo(m);
      }
      if (ori) {
        por(
          L.marker([ori.lat, ori.lng], {
            icon: L.divIcon({
              className: "",
              html: `<div title="${esc(t("Origem"))}" style="background:#16a34a;color:#fff;border-radius:6px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;border:2px solid #fff">⌂</div>`,
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            }),
          }),
        )
          .addTo(m)
          .bindPopup(`<b>${esc(t("Origem"))}</b>${ori.endereco ? `<br>${esc(ori.endereco)}` : ""}`);
      }
      for (const p of comCoord) {
        const cor = COR_ESTADO[p.estado];
        const sim = SIMBOLO_ESTADO[p.estado];
        const valor = p.pedidos.reduce((s, x) => s + x.total_cents, 0);
        const pedidosHtml = p.pedidos
          .map((x) => `#${x.numero} · ${esc(comoMoeda(x.total_cents, "BRL"))}`)
          .join("<br>");
        const botoes =
          p.estado === "entregue" || p.estado === "problema"
            ? ""
            : `<div style="margin-top:6px;display:flex;gap:6px">` +
              `<button data-chave="${esc(p.chave)}" data-acao="cheguei" style="background:#d97706;color:#fff;border:0;border-radius:4px;padding:4px 8px;font-size:12px">${esc(t("Cheguei"))}</button>` +
              `<button data-chave="${esc(p.chave)}" data-acao="entregue" style="background:#16a34a;color:#fff;border:0;border-radius:4px;padding:4px 8px;font-size:12px">${esc(t("Entregue"))}</button>` +
              `</div>`;
        por(
          L.marker([p.lat as number, p.lng as number], {
            icon: L.divIcon({
              className: "",
              html:
                `<div title="#${p.ordem} ${esc(p.cliente)}" style="background:${cor};color:#fff;border-radius:9999px;` +
                `min-width:26px;height:26px;padding:0 4px;display:flex;align-items:center;justify-content:center;` +
                `font-size:11px;font-weight:700;border:${p.estado === "proxima" ? "3px solid #111827" : "2px solid #fff"}">` +
                `${p.ordem}${sim ? ` ${sim}` : ""}</div>`,
              iconSize: [30, 26],
              iconAnchor: [15, 13],
            }),
          }),
        )
          .addTo(m)
          .bindPopup(
            `<b>#${p.ordem} ${esc(p.cliente)}</b>` +
              (p.endereco ? `<br>${esc(p.endereco)}` : "") +
              (p.fone ? `<br>${esc(p.fone)}` : "") +
              `<br>${pedidosHtml}` +
              `<br><b>${esc(comoMoeda(valor, "BRL"))}</b>` +
              botoes,
          );
      }
      if (mot) {
        // ─── "VOCÊ ESTÁ AQUI", COMO NUM APP DE MAPA ──────────────────────────
        //
        // Círculo de precisão + ponto azul com anel branco. O emoji de caminhão
        // que estava aqui não dizia ONDE no terreno a pessoa está: o ícone tem
        // 30px e a âncora no centro, então em zoom de rua ele cobria meia
        // quadra. O ponto pequeno e o círculo são a convenção que o motorista
        // já conhece do mapa que usa no dia a dia.
        por(
          L.circle([mot.lat, mot.lng], {
            radius: 60,
            color: "#2563eb",
            weight: 1,
            opacity: 0.45,
            fillColor: "#2563eb",
            fillOpacity: 0.12,
            interactive: false,
          }),
        ).addTo(m);
        por(
          L.marker([mot.lat, mot.lng], {
            interactive: false,
            zIndexOffset: 1000,
            icon: L.divIcon({
              className: "",
              html: `<div title="${esc(t("Você está aqui"))}" style="width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,0.35),0 1px 4px rgba(0,0,0,0.4)"></div>`,
              iconSize: [18, 18],
              iconAnchor: [9, 9],
            }),
          }),
        ).addTo(m);
      }
      // Pino pendente: o clique virou alfinete laranja (arrastável) — a
      // posição só vale depois do Confirmar. Sem isso, "marcar no mapa"
      // parecia não fazer nada.
      if (pino) {
        por(
          L.marker([pino.lat, pino.lng], {
            draggable: true,
            icon: L.divIcon({
              className: "",
              html: `<div title="${esc(t("Posição marcada — arraste para ajustar"))}" style="background:#ea580c;color:#fff;border-radius:9999px 9999px 9999px 0;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;border:2px solid #fff;transform:rotate(-45deg)"><span style="transform:rotate(45deg)">📍</span></div>`,
              iconSize: [30, 30],
              iconAnchor: [4, 26],
            }),
          }),
        )
          .addTo(m)
          .on("dragend", (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
            const ll = e.target.getLatLng();
            refProps.current.aoClicarMapa(ll.lat, ll.lng);
          });
      }
      const todos: [number, number][] = [
        ...comCoord.map((p) => [p.lat as number, p.lng as number] as [number, number]),
        ...(ori ? [[ori.lat, ori.lng] as [number, number]] : []),
        ...(mot ? [[mot.lat, mot.lng] as [number, number]] : []),
      ];
      // ─── QUEM MANDA NO ENQUADRAMENTO ───────────────────────────────────────
      //
      // 1. "seguindo você" ligado → centraliza no motorista, zoom de rua. É o
      //    modo de navegação: a cada ping o mapa acompanha.
      // 2. ninguém arrastou ainda → enquadra a rota inteira (o primeiro olhar
      //    precisa mostrar o dia, não só a esquina).
      // 3. arrastou → NÃO mexe. Antes cada atualização de GPS reenquadrava a
      //    rota e o mapa puxava o dedo de volta; quem quisesse conferir um
      //    trecho não conseguia.
      if (seguindo && mot) {
        m.setView([mot.lat, mot.lng], Math.max(m.getZoom(), 15), { animate: true });
      } else if (!refArrastou.current && todos.length > 0) {
        m.fitBounds(L.latLngBounds(todos), { padding: [30, 30] });
      }
    });
  }

  // ─── O DESPACHO VEM ANTES DA CRIAÇÃO DO MAPA, E ISSO É DE PROPÓSITO ───────
  //
  // Efeitos rodam na ordem em que aparecem. Este TEM de vir antes do efeito que
  // cria o mapa: quando ele era declarado depois, o mapa nascia chamando o
  // `refRedesenhar` ainda VAZIO (uma função no-op) e só desenhava porque o
  // `await import("leaflet")` cede o turno e deixava os efeitos seguintes
  // rodarem antes. Correção acidental: bastava um dia o import vir do cache de
  // módulo para o mapa abrir sem pino, sem rota e sem "você está aqui".
  React.useEffect(() => {
    refRedesenhar.current = (m: MapaLeaflet) => redesenharCamadas(m);
  });

  // Mapa nasce uma vez; camadas são redesenhadas a cada mudança.
  React.useEffect(() => {
    let cancelado = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !refCaixa.current || refMapa.current) return;
      const mapa: MapaLeaflet = L.map(refCaixa.current, {
        // Na cabine o zoom é PINÇA — é o gesto de todo app de mapa no celular,
        // e um par de botões flutuando sobre a rota só tapa o desenho. No
        // painel, onde se usa mouse, o controle continua onde sempre esteve.
        zoomControl: false,
      }).setView([-26.17, -50.39], 11);
      if (!refProps.current.imersivo) L.control.zoom({ position: "topleft" }).addTo(mapa);
      // ─── A URL SEM `{s}` NÃO É DETALHE ─────────────────────────────────────
      //
      // O padrão antigo (`{s}.tile.openstreetmap.org`) resolve TRÊS nomes DNS
      // (a/b/c) no celular. A própria OSM recomenda o domínio único desde que
      // desativou o balanceamento por subdomínio: uma conexão reaproveitada é
      // mais rápida que três handshakes numa rede móvel. Medido no Pixel 7 em
      // 04/11/2026: os tiles de `a.` e `b.` voltavam `ERR_ABORTED` no primeiro
      // desenho, e a cabine abria com o mapa pela metade.
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        minZoom: 3,
      }).addTo(mapa);
      mapa.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        if (refProps.current.modoMarcar) refProps.current.aoClicarMapa(e.latlng.lat, e.latlng.lng);
      });
      // Arrastar o dedo é o pedido de "para de me seguir": sem isto, o próximo
      // ping do GPS puxaria o mapa de volta e o motorista não conseguiria olhar
      // um trecho da rota.
      mapa.on("dragstart", () => {
        refArrastou.current = true;
        refProps.current.aoArrastar?.();
      });
      // Botões dentro do popup: delegação no abrir (o popup é DOM do Leaflet).
      mapa.on("popupopen", (e: { popup: { getElement: () => HTMLElement | undefined } }) => {
        const el = e.popup.getElement();
        const btn = el?.querySelector<HTMLButtonElement>("button[data-chave][data-acao]");
        if (btn && !btn.dataset.ligado) {
          btn.dataset.ligado = "1";
          btn.addEventListener("click", () => {
            refProps.current.aoAcaoParada(btn.dataset.chave ?? "", (btn.dataset.acao ?? "cheguei") as "cheguei" | "entregue");
          });
        }
      });
      refMapa.current = mapa;
      refRedesenhar.current(mapa);
      /*
       * O celular MUDA de tamanho com a tela em uso: a barra do navegador
       * recolhe ao rolar, o teclado abre, o aparelho gira. Sem avisar o
       * Leaflet, ele segue desenhando no tamanho de quando nasceu e sobra
       * faixa cinza. O `ResizeObserver` avisa nos dois desenhos (painel e
       * cabine em tela cheia); é barato e não mexe em camada nenhuma.
       *
       * E, quando a caixa SAI DO ZERO, as camadas são redesenhadas. Sem isso
       * o `fitBounds` calculado com altura 0 escolhe um zoom absurdamente
       * próximo (a caixa cabia "nada"), e o mapa abre num quarteirão só mesmo
       * depois de ganhar 795px. Só o primeiro crescimento dispara: reaproveitar
       * todo resize refaria o enquadramento quando o teclado abre e apagaria o
       * zoom que a pessoa escolheu.
       */
      let jaTinhaTamanho = false;
      const caixa = refCaixa.current;
      const observador =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => {
              const m = refMapa.current;
              if (!m) return;
              m.invalidateSize();
              const agora = m.getSize();
              const tem = agora.x > 0 && agora.y > 0;
              if (!jaTinhaTamanho && tem) {
                jaTinhaTamanho = true;
                refRedesenhar.current(m);
              }
            });
      if (caixa && observador) observador.observe(caixa);
      refObservador.current = observador;
    })();
    return () => {
      // StrictMode monta/desmonta em dev: sem remover, a segunda montagem
      // herda o contêiner inicializado ("map container is already
      // initialized") e o mapa nasce morto — clique nenhum funciona.
      cancelado = true;
      refObservador.current?.disconnect();
      refObservador.current = null;
      refMapa.current?.remove();
      refMapa.current = null;
    };
  }, []);

  // Redesenha quando os dados mudam (mapa já existe) — o pino pendente
  // incluso: sem ele, o clique não desenharia o alfinete.
  React.useEffect(() => {
    const m = refMapa.current;
    if (m) refRedesenhar.current(m);
  }, [paradas, geometria, origem, motorista, rastro, pinoPendente]);


  return (
    // ─── A ALTURA DA CABINE: A CAUSA DO MAPA INVISÍVEL ─────────────────────
    //
    // Este invólucro era `space-y-2` nos DOIS desenhos. Em tela cheia ele fica
    // dentro de um `absolute inset-0` (altura definida), mas `space-y-2` não
    // tem altura própria: o filho é `h-full`, e 100% de `auto` é zero. O
    // Leaflet nascia com 795px de pai e 0px de caixa, baixava três tiles,
    // abortava o resto e desenhava tudo fora da vista.
    //
    // Medido em 04/11/2026 no Pixel 7 contra produção:
    //   `.leaflet-container` → { largura: 412, altura: 0 }
    //   tiles no DOM: 3 · carregados: 3 · abortados: 3
    // No painel nunca apareceu porque lá a altura é explícita (`40dvh`).
    //
    // Em tela cheia o mapa herda a altura por `absolute inset-0` — o caminho
    // que não depende de `height: 100%` resolver contra `auto`.
    <div className={imersivo ? "relative h-full w-full" : "space-y-2"}>
      {/* STACKING CONTEXT PRÓPRIO PARA O LEAFLET.

          O Leaflet escreve z-index nos próprios panes, em pixels, na MESMA pilha
          da página: 400 overlay, 600 marcadores, 700 popup, 800/1000 controle.

          Sem contexto de pilha próprio, os dois lados do sintoma "elemento por
          cima do mapa ou por trás" aparecem:

          - o cabeçalho `sticky -top-6 z-10` desta página (linha 249 de
            `_client.tsx`) fica ABAIXO de popup e marcadores — o mapa invade o
            cabeçalho ao rolar;
          - `Dialog` e `Sheet`, que usam `z-50`, ficam ATRÁS do mapa.

          Aqui não havia NENHUMA das duas classes. O mapa de prospecção
          (`app/app/prospeccao/_mapa.tsx`) já tinha `isolate` desde um conserto
          anterior — mesmo sintoma, outra tela, mesma causa, e o conserto feito
          pela metade. `leaflet-isolado-em-contexto-de-stack.test.ts` agora trava
          os dois juntos, e vale para qualquer mapa novo.

          Por que as DUAS classes, `isolate` e `z-0`, se uma resolve:

          - `isolate` → o Tailwind 4.3.3 gera `isolation: isolate` para o
            utilitário (verificado no CSS compilado). Repare no NOME DA
            PROPRIEDADE: `isolation`, o apelido antigo. Escrever `isolate` (o
            nome novo da padronização) à mão em CSS é outra coisa — o browser de
            verificação não reconhece a propriedade nova e DESCARTA a declaração
            em silêncio, sem aviso. Como utilitário do Tailwind, está correto.
          - `z-0` → cria o mesmo stacking context pelo caminho mais fundamental
            (elemento posicionado com `z-index` diferente de `auto`), sem
            depender do apelido da propriedade.

          Medido no browser, com o CSS real do `node_modules` e o CSS compilado
          do Tailwind, rolando o mapa até o controle de zoom cair no meio de um
          cabeçalho `sticky z-10`:

            sem nada → MAPA por cima do cabeçalho  ❌
            isolate  → CABEÇALHO por cima             ✅
            z-0      → CABEÇALHO por cima             ✅

          Duas rotas independentes para a mesma garantia: se uma deixar de
          funcionar por qualquer motivo, a outra ainda segura. Custa uma
          palavra no className.

          `relative` está declarado porque `z-index` só vale em elemento
          POSICIONADO. O Leaflet já põe `position: relative` inline no container
          ao montar (medido), então `z-0` funcionaria sozinho — mas depender
          disso é depender de detalhe de runtime de terceiro.

          O aviso de "nenhuma parada no mapa" logo abaixo do contêiner existe
          porque um retângulo cinza não diz se o mapa falhou, se os endereços
          não têm coordenada ou se a carga está vazia. Ele é
          `pointer-events-none`: o clique para soltar o alfinete continua indo
          para o mapa. */}

      <div className={imersivo ? "absolute inset-0" : "relative"}>
        <div
          ref={refCaixa}
          className={`relative isolate z-0 overflow-hidden bg-muted ${
            imersivo ? "h-full w-full" : "rounded-2xl border"
          }`}
          style={
            imersivo
              ? { cursor: modoMarcar ? "crosshair" : undefined }
              : { height: altura ?? "50vh", cursor: modoMarcar ? "crosshair" : undefined }
          }
        />
        {paradas.every((p) => p.lat == null || p.lng == null) &&
          !origem &&
          !motorista &&
          !pinoPendente && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
              <div className="max-w-xs rounded-xl border border-border bg-background/95 px-4 py-3 text-center shadow-xs backdrop-blur">
                <p className="text-sm font-medium text-text">{t("Nenhuma parada no mapa")}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {t("Geocodifique os endereços ou marque a posição no mapa para desenhar a rota.")}
                </p>
              </div>
            </div>
          )}
        {sobreposicao ? (
          // No celular a faixa fica no alto à direita: embaixo ela cobria a
          // atribuição do OpenStreetMap, que o Leaflet ancora no canto
          // inferior direito e não dá para mover. Do `lg` em diante há
          // largura para ela voltar ao canto inferior esquerdo.
          <div className="pointer-events-none absolute top-3 right-3 z-10 flex max-w-[75%] flex-col items-end gap-1.5 lg:inset-x-3 lg:top-auto lg:bottom-3 lg:max-w-none lg:flex-row lg:flex-wrap lg:items-end">
            {sobreposicao}
          </div>
        ) : null}
      </div>
      {modoMarcar && (
        // O mapa só fala do que é dele: o alfinete. O estado da rota (ruas,
        // aproximada, sem cálculo) e as paradas sem localização vivem na
        // legenda de quem chamou — antes eles apareciam aqui E lá embaixo,
        // duas vezes a mesma frase.
        <p className="text-xs text-muted-foreground">
          {pinoPendente
            ? t("Arraste o alfinete para ajustar e confirme abaixo.")
            : t("Clique no mapa para soltar o alfinete.")}
        </p>
      )}
    </div>
  );
}
