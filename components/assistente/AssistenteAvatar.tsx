"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { IconeAssistente } from "./IconeAssistente";

/**
 * O gatilho do assistente na TopBar.
 *
 * ─── O ícone É a marca ─────────────────────────────────────────────────────
 *
 * Ele mora entre o tema e o sino (ver `components/shell/TopBar.tsx`), com as
 * MESMAS medidas dos vizinhos — h-11/w-11 no celular e h-9/w-9 a partir de
 * `md` —, porque um alvo maior no meio de ícones de 36px desalinha o grupo
 * inteiro. Dentro do botão, o símbolo do Grok Bot (ver
 * `IconeAssistente.tsx`) desenhado a 24px, herdando a cor do botão.
 *
 * ─── O que ficou de fora, de propósito ─────────────────────────────────────
 *
 * A versão anterior era o rosto do bloub animado (olhos seguindo o cursor,
 * expressões por estado do painel). "Mais clean" foi o pedido, e o desenho
 * vetorial estático resolve: um símbolo, não um mascote. Também não vieram o
 * balão "Precisa de ajuda?" (cobriria as ações da barra) nem o ponto verde de
 * "online" (o painel já diz o estado).
 *
 * O que ficou: o pulo de 0,38s no clique. Ele é a única reação — o clique abre
 * o painel, e o pulo confirma que o alvo respondeu antes de o painel entrar.
 * Com `prefers-reduced-motion`, o pulo não roda (`motion-reduce:animate-none`):
 * quem desligou animação recebe o painel no lugar, sem coreografia.
 *
 * Reanimar um keyframe exige remontar o elemento — `key={pulos}` faz isso a
 * cada clique, sem timer nem estado de "animando" para limpar no unmount.
 */
interface AssistenteAvatarProps {
  aberto: boolean;
  onToggle: () => void;
}

export function AssistenteAvatar({ aberto, onToggle }: AssistenteAvatarProps) {
  const [pulos, setPulos] = useState(0);

  const clicar = useCallback(() => {
    setPulos((n) => n + 1);
    onToggle();
  }, [onToggle]);

  return (
    <button
      type="button"
      onClick={clicar}
      aria-label={aberto ? "Fechar assistente" : "Abrir assistente"}
      aria-expanded={aberto}
      aria-controls="assistente-painel"
      title={aberto ? "Fechar assistente" : "Abrir assistente"}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-95 lg:h-9 lg:w-9",
        aberto && "bg-muted text-foreground",
      )}
    >
      <IconeAssistente
        key={pulos}
        tamanho={24}
        className={pulos ? "animate-[assistente-pulo_0.38s_ease] motion-reduce:animate-none" : undefined}
      />
    </button>
  );
}
