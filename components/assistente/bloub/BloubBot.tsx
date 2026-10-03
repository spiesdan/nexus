"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { NOTIF_BLUE, type ArcRender, type DotRender } from "./decor";
import { BotEngine, type BotFrame } from "./engine";
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID, type ExpressionId } from "./expressions";
import { clamp } from "./math";
import { olharPara } from "./gaze";
import { DEMI_VIEWBOX, RAYON } from "./repere";
import { DEFAULT_SHAPE, SHAPE_BY_ID, mixHex } from "./skins";
import { STATE_BY_ID, type StateId } from "./states";

/**
 * O bloub em React — um cliente da engine de `components/assistente/bloub/`,
 * que é a portagem framework-free do projeto bloub (github.com/jeremy-prt/bloub,
 * MIT, ver `LICENCA-bLoub.txt`). O motor é função PURA do tempo (`sample(t)`),
 * então este componente é só: um relógio de rAF, a mira do cursor e o desenho
 * do frame em SVG — nada de CSS animation, nada de dependência externa.
 *
 * A janela inteira escuta o cursor (normalização pela MEIA-janela, não pelo
 * tamanho do bot: o olhar satura quando o mouse chega na borda da tela, seja
 * qual for o espaço que a bolota ocupa). Estados sem `baseFace` (wink,
 * thinking…) não miram: lá a pose É a animação, e o olhar por cima a borraria.
 *
 * `calmo` congela tudo numa imagem só (`sample(0)`), sem loop e sem olhar —
 * a saída de `prefers-reduced-motion` / ponteiro grosseiro. Em calmo as props
 * `estado`/`expressao` não mudam por construção (o pai as trava), então não há
 * morph a datar e o frame inicial é o definitivo.
 */

/** Mouse parado por isto: o olhar solta e o bot volta ao repouso da expressão. */
const VOLTA_AO_REPOUSO_MS = 5000;

const R = RAYON;
const VB = DEMI_VIEWBOX;

/** Forma padrão do customizador do bloub — igual ao Vue de origem. */
const FORMA_PADRAO = SHAPE_BY_ID.get(DEFAULT_SHAPE)?.radii ?? null;
const EXPRESSAO_PADRAO = EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION) ?? null;

const expressaoDe = (id: ExpressionId) => EXPRESSION_BY_ID.get(id) ?? EXPRESSAO_PADRAO;

export interface BloubBotProps {
  /** Tamanho do quadrado do SVG, em px. */
  tamanho?: number;
  /** Estado narrativo — o motor faz o morph de um para o outro. */
  estado: StateId;
  /** Expressão de repouso, também em morph. */
  expressao?: ExpressionId;
  /** O olhar segue o cursor; desligado, o bot volta ao repouso. */
  seguirMouse?: boolean;
  /** Imagem fixa, sem loop e sem olhar (reduced-motion). */
  calmo?: boolean;
  /** Fundo: miolo dos olhos e névoa das partículas se misturam nele. */
  paper: string;
  /** Tinta: o corpo e os olhos-furos. */
  ink: string;
  ariaLabel?: string;
}

function Ponto({ dot, paper, ink }: { dot: DotRender; paper: string; ink: string }) {
  const cor = dot.color ?? (dot.depth === undefined ? ink : mixHex(paper, ink, dot.depth));
  if (dot.d) {
    // Forma não circular (a gota do "!" inclinado): o path vem em unidades
    // de raio de bolota, centrado na origem, então se aplica com translate/
    // rotate/scale.
    return (
      <path
        d={dot.d}
        fill={cor}
        opacity={dot.opacity}
        transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${R})`}
      />
    );
  }
  return <circle cx={dot.x} cy={dot.y} r={dot.r} fill={cor} opacity={dot.opacity} />;
}

function Anel({ arc, uid, metade }: { arc: ArcRender; uid: string; metade: "back" | "front" }) {
  return (
    <path
      d={metade === "back" ? arc.back : arc.front}
      stroke={`url(#${uid}-${arc.id})`}
      strokeWidth={arc.width}
      opacity={arc.opacity}
    />
  );
}

export function BloubBot({
  tamanho = 320,
  estado,
  expressao = DEFAULT_EXPRESSION,
  seguirMouse = false,
  calmo = false,
  paper,
  ink,
  ariaLabel,
}: BloubBotProps) {
  // A engine é ESTÁVEL (uma por montagem): criada no inicializador, nunca
  // lida como ref em render — ela é estado, não segredo de efeito.
  const [engine] = useState(
    () => new BotEngine(R, estado, FORMA_PADRAO, expressaoDe(expressao)),
  );
  const [frame, setFrame] = useState<BotFrame>(() => engine.sample(0));

  const svgRef = useRef<SVGSVGElement | null>(null);
  const clockRef = useRef(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const ultimoMovRef = useRef(0);
  const aimingRef = useRef(false);
  const seguirRef = useRef(seguirMouse);

  const uid = "bloub" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const maskId = `${uid}mask`;

  const soltar = useCallback(() => {
    if (!aimingRef.current) return;
    engine.setLook(null, clockRef.current);
    aimingRef.current = false;
  }, [engine]);

  /**
   * Mira o cursor no frame corrente. Relê o retângulo a cada frame (o botão
   * pode estar tiltando) e normaliza pela meia-janela. Sem ponteiro, ou com o
   * mouse parado além do repouso, o olhar SOLTA e o motor volta à pose da
   * expressão.
   */
  const mirar = useCallback(() => {
    if (!STATE_BY_ID.get(engine.state)?.baseFace) {
      soltar();
      return;
    }
    const p = pointerRef.current;
    const ocioso = performance.now() - ultimoMovRef.current > VOLTA_AO_REPOUSO_MS;
    if (!p || ocioso) {
      soltar();
      return;
    }
    const box = svgRef.current?.getBoundingClientRect();
    // Caixa sem área não dá para mirar — e a normalização viraria 0/0 (NaN),
    // que o motor guarda para sempre.
    if (!box || box.width === 0 || box.height === 0) return;
    const demiLargura = Math.max(1, window.innerWidth / 2);
    const demiAltura = Math.max(1, window.innerHeight / 2);
    engine.setLook(
      olharPara({
        nx: clamp((p.x - (box.left + box.width / 2)) / demiLargura, -1, 1),
        ny: clamp((p.y - (box.top + box.height / 2)) / demiAltura, -1, 1),
      }),
      clockRef.current,
    );
    aimingRef.current = true;
  }, [engine, soltar]);

  // Estado/expressão vêm de fora, datados no relógio da cena: o motor faz o
  // morph sozinho. Em calmo não há o que datar (props travadas no mount, ver
  // o docstring), então o frame inicial já é o definitivo.
  useEffect(() => {
    if (calmo) return;
    engine.setState(estado, clockRef.current);
    engine.setExpression(expressaoDe(expressao), clockRef.current);
  }, [estado, expressao, calmo, engine]);

  // Relógio. Delta limitado: um aba que fica escondido e volta não pula em
  // frente (o rAF fica suspenso nesse meio-tempo).
  useEffect(() => {
    if (calmo) return;
    let raf = 0;
    let ultimo = 0;
    const passo = (ms: number) => {
      raf = requestAnimationFrame(passo);
      const dt = ultimo ? Math.min((ms - ultimo) / 1000, 0.064) : 0;
      ultimo = ms;
      clockRef.current += dt;
      if (seguirRef.current) mirar();
      setFrame(engine.sample(clockRef.current));
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [calmo, mirar, engine]);

  useEffect(() => {
    seguirRef.current = seguirMouse;
    if (!seguirMouse) soltar();
  }, [seguirMouse, soltar]);

  // Ouvinte do ponteiro vive só enquanto o seguir está ligado. Toque não
  // conta: um dedo levado deixaria o olhar preso no último ponto, o que se
  // lê como defeito.
  useEffect(() => {
    if (calmo || !seguirMouse) return;
    const aoMover = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      pointerRef.current = { x: e.clientX, y: e.clientY };
      ultimoMovRef.current = performance.now();
    };
    const aoSair = () => {
      pointerRef.current = null;
    };
    window.addEventListener("pointermove", aoMover, { passive: true });
    document.addEventListener("pointerleave", aoSair);
    return () => {
      window.removeEventListener("pointermove", aoMover);
      document.removeEventListener("pointerleave", aoSair);
      soltar();
    };
  }, [calmo, seguirMouse, soltar]);

  return (
    <svg
      ref={svgRef}
      width={tamanho}
      height={tamanho}
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        {/*
          Os olhos são BURACOS REAIS no corpo (como no x.ai), não formas
          brancas pousadas por cima: assim eles recortam sozinhos na borda da
          silhueta. Um buraco deixa ver o que está atrás — e os anéis/estilhaços
          que passam atrás da bolota são exatamente o que não pode aparecer
          dentro dos olhos.
        */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((olho, i) => (
            <path key={i} d={olho.d} transform={olho.matrix} opacity={olho.alpha} fill="#000" />
          ))}
          {frame.notch && (
            <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />
          )}
        </mask>
        {frame.arcs.map((arc) => (
          <linearGradient
            key={arc.id}
            id={`${uid}-${arc.id}`}
            gradientUnits="userSpaceOnUse"
            x1={arc.grad.x1}
            y1={arc.grad.y1}
            x2={arc.grad.x2}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((cor, i) => (
              <stop key={i} offset={i / (arc.grad.stops.length - 1)} stopColor={cor} />
            ))}
          </linearGradient>
        ))}
      </defs>

      {/* metade de trás dos anéis: desenhada antes do corpo, logo, oculta */}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <Anel key={arc.id} arc={arc} uid={uid} metade="back" />
        ))}
      </g>

      {/* partículas da explosão: passam por trás do núcleo */}
      {frame.dotsBehind &&
        frame.dots.map((ponto, i) => <Ponto key={i} dot={ponto} paper={paper} ink={ink} />)}

      <g opacity={frame.bodyAlpha}>
        {/*
          Fundo opaco na forma exata do corpo, embaixo do próprio corpo: sem
          ele, um anel que passa por trás reapareceria DENTRO dos olhos. Preenchido
          com `paper` e não branco puro — é exatamente o que os olhos deixavam
          ver (o fundo do botão).
        */}
        <path d={frame.bodyPath} fill={paper} />
        <g mask={`url(#${maskId})`}>
          <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill={ink} />
        </g>
      </g>

      {!frame.dotsBehind &&
        frame.dots.map((ponto, i) => <Ponto key={i} dot={ponto} paper={paper} ink={ink} />)}

      {frame.notif && (
        <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={NOTIF_BLUE} />
      )}

      {/* metade da frente dos anéis */}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <Anel key={arc.id} arc={arc} uid={uid} metade="front" />
        ))}
      </g>
    </svg>
  );
}

const CORES_PADRAO = { paper: "#f6f7f9", ink: "#181925" };
let coresCache: { paper: string; ink: string } | null = null;

/**
 * As cores do tema lidas da raiz: o `paper` é o fundo do botão (nele os olhos
 * furam) e o `ink` é a tinta. Externo de verdade — a raiz troca de classe e
 * o valor muda fora do React, então o sincronismo é de `useSyncExternalStore`,
 * não de efeito com setState.
 *
 * O retorno é MEMOIZADO por valor: `getSnapshot` precisa devolver a MESMA
 * referência enquanto o valor não muda, senão o React enxerga "mudou" para
 * sempre e re-renderiza em ciclo (medido: React error #185 na home).
 */
export function coresDoTema(): { paper: string; ink: string } {
  if (typeof window === "undefined") return CORES_PADRAO;
  const raiz = getComputedStyle(document.documentElement);
  const paper = raiz.getPropertyValue("--color-bg").trim() || CORES_PADRAO.paper;
  const ink = raiz.getPropertyValue("--color-text").trim() || CORES_PADRAO.ink;
  if (coresCache && coresCache.paper === paper && coresCache.ink === ink) return coresCache;
  coresCache = { paper, ink };
  return coresCache;
}

function subscreverTema(aoMudar: () => void) {
  const observador = new MutationObserver(aoMudar);
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  return () => observador.disconnect();
}

export function useCoresDoTema() {
  return useSyncExternalStore(subscreverTema, coresDoTema, () => CORES_PADRAO);
}
