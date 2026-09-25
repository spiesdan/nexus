"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { NexusConfirmDialog } from "./NexusConfirmDialog";

/**
 * Confirmação imperativa — o substituto do `window.confirm`.
 *
 * O `window.confirm` bloqueava o handler: `if (!window.confirm(msg)) return;`
 * e seguia. Aqui a mesma linha vira `if (!(await confirmar({ ... }))) return;`
 * — o handler continua async (todos os sete call sites já eram), e a mesma
 * superfície visual do `NexusConfirmDialog` abre no meio da tela. Nada mais no
 * produto abre caixa de diálogo do navegador.
 *
 * O provider monta UM `NexusConfirmDialog` (portal, incondicional na prática:
 * só renderiza com pedido pendente) e distribui o `confirmar` por contexto.
 * Ele mora em `app/app/layout.tsx`, dentro do `IdiomaProvider` — a dialog usa
 * `useT()` para os rótulos padrão.
 */
export type Confirmacao = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type Confirmar = (confirmacao: Confirmacao) => Promise<boolean>;

const ConfirmacaoContext = createContext<Confirmar | null>(null);

/**
 * `const confirmar = useConfirmar();` num handler de produto.
 * Resolve `true` (confirmou) ou `false` (cancelou/fechou). Fora do provider
 * lança na hora — um call site sem provider nasceria com a promise pendurada
 * e o handler parado para sempre.
 */
export function useConfirmar(): Confirmar {
  const confirmar = useContext(ConfirmacaoContext);
  if (!confirmar) {
    throw new Error(
      "useConfirmar exige <ConfirmacaoProvider> — ele envolve o /app em app/app/layout.tsx.",
    );
  }
  return confirmar;
}

export function ConfirmacaoProvider({ children }: { children: ReactNode }) {
  const [pendente, setPendente] = useState<Confirmacao | null>(null);
  const resolver = useRef<((valor: boolean) => void) | null>(null);

  const confirmar = useCallback((confirmacao: Confirmacao) => {
    // Um pedido por vez: se um segundo gatilho disparar antes do primeiro
    // responder, o anterior resolve `false` — nunca fica um `await` órfão
    // segurando handler para sempre.
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setPendente(confirmacao);
    });
  }, []);

  const responder = useCallback((valor: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setPendente(null);
    resolve?.(valor);
  }, []);

  return (
    <ConfirmacaoContext.Provider value={confirmar}>
      {children}
      {pendente && (
        <NexusConfirmDialog
          aberto
          aoFechar={responder}
          title={pendente.title}
          description={pendente.description}
          confirmLabel={pendente.confirmLabel}
          cancelLabel={pendente.cancelLabel}
          danger={pendente.danger}
          // `responder(true)` já fecha (limpa `pendente` → desmonta a dialog);
          // o `fechar(false)` que o componente chama logo depois encontra o
          // resolver nulo e vira no-op. Resolve exatamente uma vez.
          onConfirm={() => responder(true)}
        />
      )}
    </ConfirmacaoContext.Provider>
  );
}
