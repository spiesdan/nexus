"use client";

import { toast, type ExternalToast } from "sonner";

/**
 * PORTA ÚNICA de toast do produto (Fase 3f do redesign §100).
 *
 * Antes havia 3 API em paralelo: `sonner` cru em 128 arquivos (cada um com
 * sua combinação de estilo/duração), `nexusToast` minúsculo (só success/error/
 * info) e `ApiErrorToast` (mapa de código→tom). Agora todo `toast.*` da UI
 * passa por aqui — o import dos 128 virou `import { nexusToast as toast }`,
 * então os ~411 call sites seguem lendo `toast.success(...)`, mas a origem é
 * um módulo só, único lugar para trocar biblioteca ou impor duração/padrão.
 *
 * As DUAS exceções ficam de fora de propósito:
 *  - `lib/notifications/deliver.ts` roda em runtime de servidor (route/cron)
 *    e não pode depender de módulo `"use client"` — segue com `sonner` direto;
 *  - `app/layout.tsx` monta o `<Toaster />` (infraestrutura de renderização,
 *    não API de chamada).
 *
 * Compatibilidade: o segundo argumento aceita `ExternalToast` (o que o sonner
 * espera) OU uma string, que vira `{ description }` — era a assinatura antiga
 * do `nexusToast` e continua válida para os 10 arquivos que já o usavam.
 */
type Argumento = string | ExternalToast;
type Retorno = string | number;

function normalizar(dados?: Argumento): ExternalToast | undefined {
  return typeof dados === "string" ? { description: dados } : dados;
}

/**
 * Repasse TRANSPARENTE: sem segundo argumento, o sonner recebe UM argumento
 * (como antes da migração) — mandar `undefined` explícito mudava a assinatura
 * observada pelos `expect(...).toHaveBeenCalledWith(msg)` dos testes.
 */
function encaminhar(
  fn: (message: string, dados?: ExternalToast) => Retorno,
  message: string,
  dados?: Argumento,
): Retorno {
  return dados === undefined ? fn(message) : fn(message, normalizar(dados));
}

interface PortaDeToast {
  (message: string, dados?: Argumento): Retorno;
  success(message: string, dados?: Argumento): Retorno;
  error(message: string, dados?: Argumento): Retorno;
  warning(message: string, dados?: Argumento): Retorno;
  info(message: string, dados?: Argumento): Retorno;
  loading(message: string, dados?: Argumento): Retorno;
  message(message: string, dados?: Argumento): Retorno;
  dismiss(id?: number | string): Retorno;
}

export const nexusToast: PortaDeToast = Object.assign(
  (message: string, dados?: Argumento): Retorno =>
    encaminhar((m, d) => toast(m, d), message, dados),
  {
    success: (message: string, dados?: Argumento): Retorno =>
      encaminhar(toast.success, message, dados),
    error: (message: string, dados?: Argumento): Retorno =>
      encaminhar(toast.error, message, dados),
    warning: (message: string, dados?: Argumento): Retorno =>
      encaminhar(toast.warning, message, dados),
    info: (message: string, dados?: Argumento): Retorno =>
      encaminhar(toast.info, message, dados),
    loading: (message: string, dados?: Argumento): Retorno =>
      encaminhar(toast.loading, message, dados),
    message: (message: string, dados?: Argumento): Retorno =>
      encaminhar(toast.message, message, dados),
    dismiss: (id?: number | string): Retorno =>
      id === undefined ? toast.dismiss() : toast.dismiss(id),
  },
);
