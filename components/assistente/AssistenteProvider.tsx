"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ContextoDaPagina } from "./AssistenteChat";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Assistente {
  aberto: boolean;
  alternar: () => void;
  fechar: () => void;
  contexto: ContextoDaPagina;
}

const AssistenteCtx = createContext<Assistente | null>(null);

/**
 * Estado do assistente compartilhado pela casca.
 *
 * ─── Por que um provedor, e não props ───────────────────────────────────────
 *
 * O gatilho subiu para a TopBar e o painel desce pelo lado direito: são dois
 * IRMÃOS separados pelo conteúdo do `main`. Passar `aberto`/`onToggle` por
 * props obrigaria a TopBar a repassar estado que não é dela e o `AppShell` a
 * intermediar um clique que nasce num filho e termina em outro. Com o contexto,
 * quem abre é quem desenha o botão e quem desenha o painel só lê.
 *
 * `Esc` fecha aqui, não no painel: o atalho vale enquanto o painel existe e o
 * painel é desmontado quando fecha — deixar o ouvinte no painel criaria um
 * ciclo de monta/desmonta do listener a cada `Esc`.
 *
 * Copilot §33: o contexto da página (pathname; contato quando a URL carrega um
 * UUID de contato) também mora aqui — o gatilho não precisa saber da rota e o
 * resumo real continua sendo colado no servidor.
 */
export function AssistenteProvider({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const alternar = useCallback(() => setAberto((v) => !v), []);
  const fechar = useCallback(() => setAberto(false), []);
  const pathname = usePathname();

  const contexto: ContextoDaPagina = useMemo(() => {
    const partes = (pathname ?? "").split("/").filter(Boolean);
    // /app/contacts/<uuid> — o único id de contato que a URL carrega.
    const contato =
      partes[0] === "app" && partes[1] === "contacts" && partes[2] && UUID.test(partes[2])
        ? partes[2]
        : undefined;
    return contato
      ? { pagina: pathname ?? "/app", contact_id: contato }
      : { pagina: pathname ?? "/app" };
  }, [pathname]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, fechar]);

  const valor = useMemo<Assistente>(
    () => ({ aberto, alternar, fechar, contexto }),
    [aberto, alternar, fechar, contexto],
  );

  return <AssistenteCtx.Provider value={valor}>{children}</AssistenteCtx.Provider>;
}

export function useAssistente(): Assistente {
  const valor = useContext(AssistenteCtx);
  if (!valor) {
    throw new Error("useAssistente precisa estar dentro de <AssistenteProvider>");
  }
  return valor;
}
