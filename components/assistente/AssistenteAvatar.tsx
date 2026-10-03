"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BloubBot, useCoresDoTema } from "./bloub/BloubBot";
import type { ExpressionId } from "./bloub/expressions";
import type { StateId } from "./bloub/states";

/**
 * O bloub — a bolota do x.ai recriada em SVG (github.com/jeremy-prt/bloub,
 * MIT) — como rosto do ajudante. A engine é DADO versionado em
 * `components/assistente/bloub/` (portada sem framework nem dependência
 * externa; licença em `LICENCA-bLoub.txt`): nada é baixado em runtime,
 * funciona offline e no self-host. `bloub.test.ts` e `gaze.test.ts` quebram
 * no CI se a portagem se perder de algo que este componente usa. Ver
 * `public/assistente/README.md`.
 *
 * Reações:
 * - cursor: o olhar segue o mouse em graus contínuos (o motor é função pura
 *   do tempo e interpola sozinho), e o botão inclina junto; mouse parado 5s
 *   ou fora da janela, o olhar solta e o bot volta ao repouso;
 * - chat aberto: expressão `attentif`; chat fechado: `neutre`;
 * - clique: o estado `wink` pisca, sorri (`heureux` ~1,8s) e o botão dá o
 *   pulo — a abertura do chat é decidida pelo pai via `onToggle`, aqui é só
 *   o charme;
 * - `prefers-reduced-motion` ou ponteiro grosso: imagem fixa em `neutre`,
 *   sem loop nem olhar — só o botão, parado.
 *
 * `estado` e `expressao` são DERIVADOS, não estado: o rosto do bloub é um
 * motor datado, então o render diz o que deveria estar na tela e o
 * `BloubBot` data a troca. Em `calmo` as duas ficam fixas por construção —
 * é o combinador do efeito de redução.
 *
 * Sem fallback: o Strobi antigo caía numa SVG de reserva porque a lib podia
 * recusar a definição em runtime. Aqui a fonte é um módulo versionado e
 * determinístico — não há estado externo que recuse.
 */

interface AssistenteAvatarProps {
  aberto: boolean;
  onToggle: () => void;
}

const INCLINACAO_MAX = 7;
const ALEGRIA_DO_CLIQUE_MS = 1800;

export function AssistenteAvatar({ aberto, onToggle }: AssistenteAvatarProps) {
  const botaoRef = useRef<HTMLButtonElement>(null);
  const cliqueTokenRef = useRef(0);
  const rafRef = useRef(0);
  /** true durante a alegria do clique — de onde saem `wink` e `heureux`. */
  const [alegre, setAlegre] = useState(false);
  const [inclinacao, setInclinacao] = useState(0);
  const [pulando, setPulando] = useState(false);
  const [mostrarDica, setMostrarDica] = useState(false);
  const cores = useCoresDoTema();
  const [calmo] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        window.matchMedia("(pointer: coarse)").matches),
  );

  const estado: StateId = !calmo && alegre ? "wink" : "idle";
  const expressao: ExpressionId = calmo
    ? "neutre"
    : alegre
      ? "heureux"
      : aberto
        ? "attentif"
        : "neutre";

  // Dica "Precisa de ajuda?" aparece uma vez, 2s após montar, e some no
  // primeiro clique ou após 10s — sem storage, sem rastreio.
  useEffect(() => {
    const mostrar = setTimeout(() => setMostrarDica(true), 2000);
    const esconder = setTimeout(() => setMostrarDica(false), 10000);
    return () => {
      clearTimeout(mostrar);
      clearTimeout(esconder);
    };
  }, []);

  // O botão inclina na direção do cursor — ele é a parte de sempre do
  // charme, não depende do rosto.
  useEffect(() => {
    if (typeof window === "undefined" || calmo) return;
    const aoMover = (e: MouseEvent) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const el = botaoRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const dist = Math.hypot(dx, dy) || 1;
        const força = Math.min(1, dist / 320);
        setInclinacao(
          Math.max(-INCLINACAO_MAX, Math.min(INCLINACAO_MAX, (dx / dist) * INCLINACAO_MAX * força)),
        );
      });
    };
    window.addEventListener("mousemove", aoMover, { passive: true });
    return () => {
      window.removeEventListener("mousemove", aoMover);
      cancelAnimationFrame(rafRef.current);
    };
  }, [calmo]);

  const clicar = useCallback(() => {
    setMostrarDica(false);
    if (!calmo) {
      // Token anti-sobreposição: cliques rápidos não embaralham a coreografia.
      const token = ++cliqueTokenRef.current;
      setAlegre(true);
      setPulando(true);
      setTimeout(() => setPulando(false), 380);
      // A alegria é curta: volta ao estado do chat (atento/aberto ou
      // repouso/fechado) em vez de travar sorrindo.
      setTimeout(() => {
        if (cliqueTokenRef.current !== token) return;
        setAlegre(false);
      }, ALEGRIA_DO_CLIQUE_MS);
    }
    onToggle();
  }, [calmo, onToggle]);

  return (
    <div className="relative">
      {mostrarDica && !aberto && (
        <div
          role="status"
          className="absolute -top-11 right-0 w-max max-w-55 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-text shadow-lg"
        >
          Precisa de ajuda? Clique em mim!
          <span className="absolute -bottom-1 right-8 h-2 w-2 rotate-45 border-r border-b border-border bg-background" />
        </div>
      )}
      <button
        ref={botaoRef}
        type="button"
        onClick={clicar}
        aria-label={aberto ? "Fechar ajuda" : "Abrir ajuda"}
        aria-expanded={aberto}
        title={aberto ? "Fechar ajuda" : "Abrir ajuda"}
        className={cn(
          "group grid h-20 w-20 place-items-center overflow-hidden rounded-full border-2 border-border bg-background shadow-xl transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-95",
          pulando && "animate-[assistente-pulo_0.38s_ease]",
          aberto && "ring-2 ring-accent ring-offset-2",
        )}
        style={{ transform: `rotate(${inclinacao}deg)` }}
      >
        <BloubBot
          tamanho={68}
          estado={estado}
          expressao={expressao}
          seguirMouse={!calmo}
          calmo={calmo}
          paper={cores.paper}
          ink={cores.ink}
          ariaLabel="Assistente de ajuda"
        />
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-background bg-emerald-400" />
        </span>
      </button>
    </div>
  );
}
