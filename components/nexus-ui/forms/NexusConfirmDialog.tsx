"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

/**
 * Confirmação destrutiva única. Substitui os `AlertDialog` de excluir
 * espalhados (webhooks, templates, admin, contatos) e os `window.confirm`
 * soltos no produto.
 *
 * DOIS MODOS, um só componente:
 *
 *  - **Gatilho interno** (`triggerLabel`): o botão que abre vive aqui dentro.
 *    Serve quando a confirmação é um botão de ação de verdade na página.
 *  - **Controlado** (`aberto`/`aoFechar`): quem abre é o chamador — guarda o
 *    estado dele e renderiza este componente ao lado. Serve para gatilhos de
 *    lista/menu (ícone com `aria-label`) e para o `useConfirmar()` do
 *    `ConfirmacaoProvider`, que precisa abrir a mesma superfície a partir de
 *    um handler imperativo.
 *
 * `description` é opcional: o Radix desta versão só liga o `aria-describedby`
 * quando existe `AlertDialogDescription`, e sem ela não há aviso no console.
 * Os `window.confirm` migrados usam a mensagem inteira como TÍTULO, para não
 * inventar copy de cabeça de diálogo.
 */
export type NexusConfirmDialogProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Texto do botão de confirmação enquanto `busy` — preserva copy local ("Excluindo…"). */
  busyLabel?: string;
  danger?: boolean;
  busy?: boolean;
  /** Desabilita o botão de confirmação enquanto `true` (validação do chamador: campo obrigatório, mínimo de caracteres…). */
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  /** Conteúdo entre o cabeçalho e o rodapé (resumo de diff, detalhes, etc.). */
  children?: React.ReactNode;
} & (
  | {
      /** Modo gatilho interno: o botão que abre a dialog. */
      triggerLabel: React.ReactNode;
      aberto?: undefined;
      aoFechar?: undefined;
    }
  | {
      /** Modo controlado: quem abre é o chamador. */
      triggerLabel?: undefined;
      aberto: boolean;
      aoFechar: (aberto: boolean) => void;
    }
);

export function NexusConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  busyLabel,
  danger = true,
  busy = false,
  confirmDisabled = false,
  triggerLabel,
  onConfirm,
  children,
  aberto,
  aoFechar,
}: NexusConfirmDialogProps) {
  const t = useT();
  const [interno, setInterno] = useState(false);
  const controlado = aberto !== undefined;

  function fechar(valor: boolean) {
    if (controlado) aoFechar?.(valor);
    else setInterno(valor);
  }

  async function confirmar() {
    try {
      await onConfirm();
    } catch {
      // O erro é do chamador (o toast é dele): a dialog fica ABERTA para o
      // usuário tentar de novo, e a rejeição não vaza como unhandled.
      return;
    }
    fechar(false);
  }

  return (
    <AlertDialog
      open={aberto ?? interno}
      onOpenChange={(o) => (busy ? undefined : fechar(o))}
    >
      {triggerLabel !== undefined && (
        <AlertDialogTrigger asChild>
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => setInterno(true)}
          >
            {triggerLabel}
          </Button>
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description !== undefined && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {cancelLabel ?? t("Cancelar")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || confirmDisabled}
            onClick={(e) => {
              e.preventDefault();
              void confirmar();
            }}
            className={danger ? "bg-error text-white hover:brightness-95" : undefined}
          >
            {busy ? (busyLabel ?? t("Aguarde…")) : (confirmLabel ?? t("Excluir"))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
