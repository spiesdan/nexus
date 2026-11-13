"use client";

import * as React from "react";
import type { Map as MapaMaplibre, Marker as MarcadorMaplibre } from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";

import { useT } from "@/hooks/i18n/useT";
import { comoMoeda } from "@/lib/format/moeda";
import { limitesDe, linhaDeRota, poligonoDePrecisao } from "@/lib/mapas/geometria";
import { CENTRO_PADRAO, estiloOsm } from "@/lib/mapas/estilo";

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
  /** Veículo responsável (distribuição por veículo) — aparece no balão. */
  veiculoRotulo?: string | null;
  pedidos: { order_id: string; numero: number; total_cents: number; status: string }[];
}

/** Uma rota POR VEÍCULO, cada uma com a sua cor (prompt §6.1). */
export interface RotaDeVeiculoMapa {
  veiculo_id: string;
  cor: string;
  /** GeoJSON [lng,lat]. */
  geometria: number[][];
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

/**
 * O PINO DO MAPA — gota clássica, com o número da parada dentro.
 *
 * Antes era um círculo achatado com símbolos (▶ ◉ ✓ !) colados ao número: em
 * zoom de rua o símbolo virava um borrão ao lado do algarismo e o marcador
 * não apontava para o endereço — ficava por cima dele. A gota tem ponta, e a
 * ponta é o lugar. A cor continua dizendo o estado, e o número é o que o
 * roteiro e o romaneio usam.
 *
 * Na migração para o MapLibre o desenho foi MANTIDO igual de propósito: o
 * marcador é HTML nosso (`element` do `Marker`), então o que muda é quem
 * posiciona o nó, não o nó. Quem já lê a rota na rua não reaprende nada.
 */
function htmlDoPino(cor: string, conteudo: string, destaque: boolean, titulo: string): string {
  const tamanho = destaque ? 38 : 34;
  return (
    `<div title="${titulo}" style="position:relative;width:${tamanho}px;height:${tamanho + 10}px;` +
    `filter:drop-shadow(0 3px 4px rgba(0,0,0,0.35))">` +
    `<div style="position:absolute;left:0;top:0;width:${tamanho}px;height:${tamanho}px;border-radius:50%;` +
    `background:${cor};border:3px solid #fff;display:flex;align-items:center;justify-content:center;` +
    `color:#fff;font:700 ${destaque ? 15 : 13}px/1 system-ui,sans-serif;` +
    (destaque ? `box-shadow:0 0 0 4px rgba(37,99,235,0.35);` : "") +
    `">${conteudo}</div>` +
    `<div style="position:absolute;left:50%;top:${tamanho - 2}px;transform:translateX(-50%);width:0;height:0;` +
    `border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid ${cor}"></div>` +
    `</div>`
  );
}

const CASA =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>';

/** O que é redesenhado a cada mudança de dado — uma fonte/camada por entrada. */
interface CamadasDoMapa {
  marcadores: MarcadorMaplibre[];
  fontes: string[];
  camadas: string[];
}

/**
 * MAPA DA ROTA — MapLibre GL JS: geometria pelas ruas (OSRM), marcadores
 * numerados com estado (número + símbolo + cor + tooltip, nunca só cor),
 * origem, motorista ao vivo, rastro realizado e modo "marcar no mapa".
 *
 * ═══ POR QUE MAPLIBRE, E O QUE ISSO CUSTOU ═══════════════════════════════
 *
 * A primeira versão deste mapa usava Leaflet, e o ADR-0002 registrou aquela
 * escolha. O dono do produto decidiu trocar por MapLibre — a mesma família de
 * licença (BSD), o mesmo tile do OSM, sem chave e sem custo — e o ADR-0003
 * substitui o 0002 com o motivo e o inventário do que foi reescrito.
 *
 * O que NÃO mudou, porque foi pago com defeito medido em operação:
 *
 *   - enquadramento que não briga com o dedo do motorista (`refArrastou`);
 *   - `ResizeObserver` que corrige o mapa nascido com altura 0;
 *   - popup com as ações de entrega;
 *   - pino arrastável do modo "marcar no mapa";
 *   - "você está aqui" como ponto azul com anel, não caminhãozinho.
 *
 * O que mudou é a FORMA de desenhar: linha virou fonte GeoJSON + camada (o
 * `line-dasharray` do MapLibre é medido em MÚLTIPLOS DA ESPESSURA, não em
 * pixels — 3px de espessura com `[2,2]` desenha traço de 6px), e o círculo de
 * precisão do GPS, que o Leaflet desenhava por projeção, virou polígono em
 * metros calculado em `lib/mapas/geometria.ts` e testado sem browser.
 *
 * Na CABINE (0292) ele é o aplicativo: ocupa a tela toda, não tem botão de
 * zoom (o gesto é pinça, como em qualquer app de mapa) e a posição do
 * motorista é o ponto azul de sempre — anel branco, sem caminhãozinho.
 */
export function MapaRota({
  paradas,
  geometria,
  rotas,
  origem,
  motorista,
  rastro,
  navegacao,
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
  /** GeoJSON [lng,lat] da rota planejada (caminho único/legado). */
  geometria: number[][];
  /**
   * Distribuição por veículo: quando presente, cada rota é desenhada com a
   * cor do seu veículo e `geometria` não é usada — duas linhas para a mesma
   * rua confundiriam qual motorista passa ali.
   */
  rotas?: RotaDeVeiculoMapa[];
  origem: { lat: number; lng: number; endereco: string | null } | null;
  motorista: PontoMotorista | null;
  /** Rastro realizado [[lat,lng]...]. */
  rastro: [number, number][];
  /** Traçado da navegação até a próxima parada (GeoJSON [lng,lat]), se houver. */
  navegacao?: number[][];
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
  // (tests/unit/mapas-em-contexto-de-stack.test.ts) remove comentários por
  // regex e um bloco `/** ... */` aqui fazia a remoção engolir o
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
  const refMapa = React.useRef<MapaMaplibre | null>(null);
  /** O módulo já importado — o desenho é síncrono depois da primeira carga. */
  const refLib = React.useRef<typeof import("maplibre-gl") | null>(null);
  const refCamadas = React.useRef<CamadasDoMapa>({ marcadores: [], fontes: [], camadas: [] });
  const refObservador = React.useRef<ResizeObserver | null>(null);
  // O desenho mora depois dos efeitos (regra do lint): os efeitos iniciais
  // despacham pelo ref, que a atribuição abaixo liga na função real.
  const refRedesenhar = React.useRef<(m: MapaMaplibre) => void>(() => undefined);
  const refProps = React.useRef({ paradas, geometria, rotas, origem, motorista, rastro, navegacao, modoMarcar, pinoPendente, aoClicarMapa, aoAcaoParada, imersivo, seguir, aoArrastar });
  // Quem já arrastou o mapa não quer ser reenquadrado a cada dado novo. Vive em
  // ref porque o MapLibre (fora do React) escreve aqui.
  const refArrastou = React.useRef(false);
  /**
   * O estilo terminou de carregar?
   *
   * `addSource`/`addLayer` antes disso LANÇAM ("Style is not done loading"), e
   * o `isStyleLoaded()` do MapLibre pode ficar `false` por um turno mesmo com
   * o estilo embutido. Em vez de adivinhar, o componente espera o evento
   * `load` uma vez e guarda a resposta — desenho pedido antes disso fica
   * pendente e sai no `load`.
   */
  const refEstiloPronto = React.useRef(false);
  const refDesenhoPendente = React.useRef(false);

  // Props frescas para os callbacks do mapa (ele vive fora do React).
  // Em efeito, não no render: escrever ref no render quebra a atualização.
  React.useEffect(() => {
    refProps.current = { paradas, geometria, rotas, origem, motorista, rastro, navegacao, modoMarcar, pinoPendente, aoClicarMapa, aoAcaoParada, imersivo, seguir, aoArrastar };
  });

  function limparCamadas(m: MapaMaplibre) {
    const { marcadores, fontes, camadas } = refCamadas.current;
    for (const marcador of marcadores) marcador.remove();
    // Camada antes de fonte: o MapLibre recusa remover fonte em uso.
    for (const id of camadas) if (m.getLayer(id)) m.removeLayer(id);
    for (const id of fontes) if (m.getSource(id)) m.removeSource(id);
    refCamadas.current = { marcadores: [], fontes: [], camadas: [] };
  }

  function redesenharCamadas(m: MapaMaplibre) {
    if (!refEstiloPronto.current) {
      refDesenhoPendente.current = true;
      return;
    }
    const lib = refLib.current;
    if (!lib) return;
    const { paradas: ps, geometria: geo, rotas: rotasVeiculo, origem: ori, motorista: mot, rastro: ras, navegacao: nav, pinoPendente: pino, seguir: seguindo } = refProps.current;
    limparCamadas(m);
    // Acumuladores locais: o ref é um só, e cada camada nova precisa entrar
    // nele para o próximo desenho conseguir limpar.
    const fonte = (id: string) => {
      refCamadas.current.fontes.push(id);
      return id;
    };
    const camada = (id: string) => {
      refCamadas.current.camadas.push(id);
      return id;
    };
    const comCoord = ps.filter((p) => p.lat != null && p.lng != null);

    /**
     * A linha da rota: contorno branco embaixo, cor em cima.
     *
     * Duas camadas, não uma: é o desenho de app de navegação (o contorno separa
     * a linha do mapa em rua clara, onde uma linha fina colorida some). A
     * ordem de inserção é a ordem de pintura no MapLibre — branco primeiro.
     */
    const desenharLinha = (
      id: string,
      coords: number[][],
      opcoes: { cor: string; halo: number; espessura: number; tracejado?: boolean },
    ) => {
      const feature = linhaDeRota(coords);
      if (!feature) return; // menos de dois pontos: nada a desenhar
      m.addSource(fonte(id), { type: "geojson", data: feature });
      m.addLayer({
        id: camada(`${id}-halo`),
        type: "line",
        source: id,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": opcoes.halo, "line-opacity": 0.95 },
      });
      m.addLayer({
        id: camada(`${id}-cor`),
        type: "line",
        source: `${id}`,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": opcoes.cor,
          "line-width": opcoes.espessura,
          "line-opacity": 0.95,
          // No MapLibre o tracejado é medido em múltiplos da espessura da
          // linha. 3px de espessura com [2,2] = traço de 6px, que é o mesmo
          // desenho que o Leaflet fazia com dashArray "6 6".
          ...(opcoes.tracejado ? { "line-dasharray": [2, 2] } : {}),
        },
      });
    };

    // ─── A ROTA COM CONTORNO BRANCO ────────────────────────────────────────
    const tracados =
      rotasVeiculo && rotasVeiculo.length > 0
        ? rotasVeiculo.map((r) => ({ cor: r.cor, geometria: r.geometria }))
        : [{ cor: "#7c3aed", geometria: geo }];
    tracados.forEach((tracado, i) => {
      desenharLinha(`rota-${i}`, tracado.geometria, {
        cor: tracado.cor,
        halo: 9,
        espessura: 5,
      });
    });
    // Rastro realizado: tracejado cinza. Vem DEPOIS da rota planejada para
    // pintar por cima dela — é o que aconteceu, não o que foi planejado.
    if (ras.length > 1) {
      desenharLinha("rastro", ras.map(([lat, lng]) => [lng, lat]), {
        cor: "#6b7280",
        halo: 0,
        espessura: 3,
        tracejado: true,
      });
      // O halo do rastro não deve existir: com contorno branco, o tracejado
      // some por baixo dele. A camada branca é escondida aqui.
      const haloRastro = m.getLayer("rastro-halo");
      if (haloRastro) m.removeLayer("rastro-halo");
    }
    // ─── A ROTA DA NAVEGAÇÃO (até a próxima parada) ──────────────────────
    //
    // Azul, por cima da rota planejada (roxa): é a linha que o motorista está
    // seguindo AGORA. O mesmo contorno branco da rota, para não sumir no mapa.
    if (nav && nav.length > 1) {
      desenharLinha("navegacao", nav, { cor: "#2563eb", halo: 10, espessura: 6 });
    }

    /** Cria um marcador HTML nosso ancorado pela PONTA do pino. */
    const criarMarcador = (
      lng: number,
      lat: number,
      html: string,
      opcoes?: { arrastavel?: boolean; centro?: boolean; semEventos?: boolean },
    ): MarcadorMaplibre => {
      const elemento = document.createElement("div");
      elemento.innerHTML = html;
      // O pino é DOM: sem isto o clique atravessa o desenho e cai no canvas.
      elemento.style.cursor = opcoes?.semEventos ? "default" : "pointer";
      if (opcoes?.semEventos) elemento.style.pointerEvents = "none";
      const marcador = new lib.Marker({
        element: elemento,
        anchor: opcoes?.centro ? "center" : "bottom",
        draggable: opcoes?.arrastavel ?? false,
      })
        .setLngLat([lng, lat])
        .addTo(m);
      refCamadas.current.marcadores.push(marcador);
      return marcador;
    };

    /**
     * O balão do marcador.
     *
     * `offset` negativo em Y sobe o balão acima do pino (o pino tem 44px de
     * altura). O `maxWidth` é o que impede o balão de virar uma faixa de 600px
     * com o endereço inteiro numa linha só.
     */
    const novoBaliao = (html: string, deslocamento: number) =>
      new lib.Popup({ offset: [0, -deslocamento], maxWidth: "280px", closeButton: true }).setHTML(html);

    if (ori) {
      const marcador = criarMarcador(ori.lng, ori.lat, htmlDoPino("#16a34a", CASA, false, esc(t("Origem"))));
      marcador.setPopup(
        novoBaliao(
          `<b>${esc(t("Origem"))}</b>${ori.endereco ? `<br>${esc(ori.endereco)}` : ""}`,
          44,
        ),
      );
    }
    for (const p of comCoord) {
      const cor = COR_ESTADO[p.estado];
      const destaque = p.estado === "proxima";
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
      const marcador = criarMarcador(
        p.lng as number,
        p.lat as number,
        htmlDoPino(cor, String(p.ordem), destaque, `#${p.ordem} ${esc(p.cliente)}`),
      );
      const popup = novoBaliao(
        `<b>#${p.ordem} ${esc(p.cliente)}</b>` +
          (p.endereco ? `<br>${esc(p.endereco)}` : "") +
          (p.veiculoRotulo ? `<br><b>${esc(p.veiculoRotulo)}</b>` : "") +
          (p.fone ? `<br>${esc(p.fone)}` : "") +
          `<br>${pedidosHtml}` +
          `<br><b>${esc(comoMoeda(valor, "BRL"))}</b>` +
          botoes,
        destaque ? 48 : 44,
      );
      // O balão do MapLibre é criado no clique e destruído no fechar; o botão
      // é DOM novo a cada abertura, então o ouvinte é ligado no `open` (uma
      // vez por abertura). Delegar no contêiner do mapa não serviria: o balão
      // vive em outro nó da árvore.
      popup.on("open", () => {
        const el = popup.getElement();
        const btn = el?.querySelector<HTMLButtonElement>("button[data-chave][data-acao]");
        if (btn && !btn.dataset.ligado) {
          btn.dataset.ligado = "1";
          btn.addEventListener("click", () => {
            refProps.current.aoAcaoParada(
              btn.dataset.chave ?? "",
              (btn.dataset.acao ?? "cheguei") as "cheguei" | "entregue",
            );
          });
        }
      });
      marcador.setPopup(popup);
    }
    if (mot) {
      // ─── "VOCÊ ESTÁ AQUI", COMO NUM APP DE MAPA ──────────────────────────
      //
      // Círculo de precisão + ponto azul com anel branco. O emoji de caminhão
      // que estava aqui não dizia ONDE no terreno a pessoa está: o ícone tem
      // 30px e a âncora no centro, então em zoom de rua ele cobria meia
      // quadra. O ponto pequeno e o círculo são a convenção que o motorista
      // já conhece do mapa que usa no dia a dia.
      const precisao = poligonoDePrecisao(mot.lat, mot.lng, 60);
      if (precisao) {
        m.addSource(fonte("precisao"), { type: "geojson", data: precisao });
        m.addLayer({
          id: camada("precisao-fill"),
          type: "fill",
          source: "precisao",
          paint: { "fill-color": "#2563eb", "fill-opacity": 0.12 },
        });
        m.addLayer({
          id: camada("precisao-borda"),
          type: "line",
          source: "precisao",
          paint: { "line-color": "#2563eb", "line-width": 1, "line-opacity": 0.45 },
        });
      }
      criarMarcador(
        mot.lng,
        mot.lat,
        `<div title="${esc(t("Você está aqui"))}" style="width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,0.35),0 1px 4px rgba(0,0,0,0.4)"></div>`,
        { centro: true, semEventos: true },
      );
    }
    // Pino pendente: o clique virou alfinete laranja (arrastável) — a
    // posição só vale depois do Confirmar. Sem isso, "marcar no mapa"
    // parecia não fazer nada.
    if (pino) {
      const marcador = criarMarcador(
        pino.lng,
        pino.lat,
        htmlDoPino(
          "#ea580c",
          '<span style="width:8px;height:8px;border-radius:50%;background:#fff;display:block"></span>',
          false,
          esc(t("Posição marcada — arraste para ajustar")),
        ),
        { arrastavel: true },
      );
      marcador.on("dragend", () => {
        const { lat, lng } = marcador.getLngLat();
        refProps.current.aoClicarMapa(lat, lng);
      });
    }
    const todos: [number, number][] = [
      ...comCoord.map((p) => [p.lng as number, p.lat as number] as [number, number]),
      ...(ori ? [[ori.lng, ori.lat] as [number, number]] : []),
      ...(mot ? [[mot.lng, mot.lat] as [number, number]] : []),
      ...((nav ?? []).map((c) => [c[0] as number, c[1] as number] as [number, number])),
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
      m.easeTo({ center: [mot.lng, mot.lat], zoom: Math.max(m.getZoom(), 15) });
    } else if (!refArrastou.current) {
      const caixa = limitesDe(todos);
      if (caixa) m.fitBounds(caixa, { padding: 30, maxZoom: 15 });
    }
  }

  // ─── O DESPACHO VEM ANTES DA CRIAÇÃO DO MAPA, E ISSO É DE PROPÓSITO ───────
  //
  // Efeitos rodam na ordem em que aparecem. Este TEM de vir antes do efeito que
  // cria o mapa: quando ele era declarado depois, o mapa nascia chamando o
  // `refRedesenhar` ainda VAZIO (uma função no-op) e só desenhava porque o
  // `await import(...)` cede o turno e deixava os efeitos seguintes rodarem
  // antes. Correção acidental: bastava um dia o import vir do cache de módulo
  // para o mapa abrir sem pino, sem rota e sem "você está aqui".
  React.useEffect(() => {
    refRedesenhar.current = (m: MapaMaplibre) => redesenharCamadas(m);
  });

  // Mapa nasce uma vez; camadas são redesenhadas a cada mudança.
  React.useEffect(() => {
    let cancelado = false;
    (async () => {
      const modulo = await import("maplibre-gl");
      const lib = (modulo as unknown as { default?: typeof import("maplibre-gl") }).default ?? modulo;
      if (cancelado || !refCaixa.current || refMapa.current) return;
      refLib.current = lib;
      // ─── WORKER DO MAPLIBRE: EM NEXT.JS, O CAMINHO É O DO PUBLIC ───────────
      //
      // O MapLibre resolve o worker a partir de `import.meta.url` do bundle,
      // que num build Next/Turbopack aponta para um chunk sem o worker ao lado.
      // Sem isto, o console enche de "Worker failed to load" e as rotas (GeoJSON)
      // não pintam — o worker é quem indexa os tiles e desenha as camadas.
      // Copiar `maplibre-gl-worker.mjs` para `public/` e apontar `setWorkerUrl`
      // resolve: o Next serve `/maplibre-gl-worker.mjs` com MIME correto.
      lib.setWorkerUrl("/maplibre-gl-worker.mjs");
      const mapa = new lib.Map({
        container: refCaixa.current,
        // O estilo é inline (raster do OSM): sem `style.json` remoto, sem
        // chave, sem requisição extra no boot do mapa.
        style: estiloOsm(),
        center: [CENTRO_PADRAO.lng, CENTRO_PADRAO.lat],
        zoom: CENTRO_PADRAO.zoom,
        minZoom: 3,
        maxZoom: 19,
        // `compact` recolhe a atribuição num "ⓘ" no celular, onde ela cobria
        // a faixa de distância/tempo. A licença continua cumprida: o texto
        // está lá, a um toque.
        attributionControl: { compact: true },
      });
      // Gesto de rotação não existe em mapa de entrega e só atrapalha: o dedo
      // apoiado no celular gira o mapa sem querer e a rota sai de prumo.
      mapa.dragRotate.disable();
      mapa.touchZoomRotate.disableRotation();
      if (!refProps.current.imersivo) {
        // Na cabine o zoom é PINÇA — é o gesto de todo app de mapa no celular,
        // e um par de botões flutuando sobre a rota só tapa o desenho. No
        // painel, onde se usa mouse, o controle continua onde sempre esteve.
        mapa.addControl(new lib.NavigationControl({ showCompass: false }), "top-left");
      }
      mapa.on("click", (e) => {
        if (refProps.current.modoMarcar) refProps.current.aoClicarMapa(e.lngLat.lat, e.lngLat.lng);
      });
      // Arrastar o dedo é o pedido de "para de me seguir": sem isto, o próximo
      // ping do GPS puxaria o mapa de volta e o motorista não conseguiria olhar
      // um trecho da rota.
      mapa.on("dragstart", () => {
        refArrastou.current = true;
        refProps.current.aoArrastar?.();
      });
      // O estilo inline ainda passa pelo pipeline do MapLibre (parse + criação
      // das fontes internas). Só a partir daqui é legal adicionar fonte.
      mapa.on("load", () => {
        refEstiloPronto.current = true;
        refRedesenhar.current(mapa);
      });
      refMapa.current = mapa;
      if (refDesenhoPendente.current) refRedesenhar.current(mapa);
      /*
       * O celular MUDA de tamanho com a tela em uso: a barra do navegador
       * recolhe ao rolar, o teclado abre, o aparelho gira. Sem avisar o mapa,
       * ele segue desenhando no tamanho de quando nasceu e sobra faixa cinza.
       * O `ResizeObserver` avisa nos dois desenhos (painel e cabine em tela
       * cheia); é barato e não mexe em camada nenhuma.
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
              // Era `invalidateSize()` no Leaflet: recalcula o canvas com o
              // tamanho atual da caixa.
              m.resize();
              const tem = caixa ? caixa.clientWidth > 0 && caixa.clientHeight > 0 : false;
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
      // herda o contêiner inicializado e o mapa nasce morto — clique nenhum
      // funciona. O `remove()` do MapLibre também solta o canvas WebGL, que é
      // recurso escasso no celular.
      cancelado = true;
      refObservador.current?.disconnect();
      refObservador.current = null;
      refCamadas.current = { marcadores: [], fontes: [], camadas: [] };
      refEstiloPronto.current = false;
      refDesenhoPendente.current = false;
      refMapa.current?.remove();
      refMapa.current = null;
      refLib.current = null;
    };
  }, []);

  // Redesenha quando os dados mudam (mapa já existe) — o pino pendente
  // incluso: sem ele, o clique não desenharia o alfinete.
  React.useEffect(() => {
    const m = refMapa.current;
    if (m) refRedesenhar.current(m);
  }, [paradas, geometria, rotas, origem, motorista, rastro, navegacao, pinoPendente]);

  return (
    // ─── A ALTURA DA CABINE: A CAUSA DO MAPA INVISÍVEL ─────────────────────
    //
    // Este invólucro era `space-y-2` nos DOIS desenhos. Em tela cheia ele fica
    // dentro de um `absolute inset-0` (altura definida), mas `space-y-2` não
    // tem altura própria: o filho é `h-full`, e 100% de `auto` é zero. O mapa
    // nascia com 795px de pai e 0px de caixa, baixava três tiles, abortava o
    // resto e desenhava tudo fora da vista.
    //
    // Medido em 04/11/2026 no Pixel 7 contra produção:
    //   `.leaflet-container` → { largura: 412, altura: 0 }
    //   tiles no DOM: 3 · carregados: 3 · abortados: 3
    // No painel nunca apareceu porque lá a altura é explícita (`40dvh`).
    //
    // Em tela cheia o mapa herda a altura por `absolute inset-0` — o caminho
    // que não depende de `height: 100%` resolver contra `auto`.
    <div className={imersivo ? "relative h-full w-full" : "space-y-2"}>
      {/* STACKING CONTEXT PRÓPRIO PARA O MAPA.

          O MapLibre posiciona canvas, controles e marcadores DENTRO do
          contêiner, mas a regra que vale aqui é a mesma que valia para o
          Leaflet: um mapa não pode disputar z-index com a página.

          Sem contexto de pilha próprio, os dois lados do sintoma "elemento por
          cima do mapa ou por trás" aparecem:

          - o cabeçalho `sticky -top-6 z-10` desta página (linha 249 de
            `_client.tsx`) fica ABAIXO de popup e marcadores — o mapa invade o
            cabeçalho ao rolar;
          - `Dialog` e `Sheet`, que usam `z-50`, ficam ATRÁS do mapa.

          Aqui não havia NENHUMA das duas classes. O mapa de prospecção
          (`app/app/prospeccao/_mapa.tsx`) já tinha `isolate` desde um conserto
          anterior — mesmo sintoma, outra tela, mesma causa, e o conserto feito
          pela metade. `mapas-em-contexto-de-stack.test.ts` agora trava os três
          juntos, e vale para qualquer mapa novo.

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
          POSICIONADO. O MapLibre já põe `position: relative` inline no container
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
          // atribuição do OpenStreetMap, que o mapa ancora no canto inferior
          // direito e não dá para mover. Do `lg` em diante há largura para ela
          // voltar ao canto inferior esquerdo.
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
