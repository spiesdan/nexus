/**
 * Fila de erros da janela entre o primeiro JS e o Sentry carregar.
 *
 * `instrumentation-client.ts` roda antes da hidratação e não pode importar o
 * SDK (ele tem ~164 KB gzip). Ele instala listeners síncronos e empurra o que
 * acontecer aqui. `SentryLazy` (client component do layout raiz) importa o SDK,
 * inicializa, desliga estes listeners e entrega a fila. Nenhum erro da janela
 * inicial é descartado.
 */
type Pendente = unknown;

export const filaDeErros: Pendente[] = [];

let capturando = false;
let aoErro: ((evento: ErrorEvent) => void) | null = null;
let aoRejeitar: ((evento: PromiseRejectionEvent) => void) | null = null;

export function instalarCapturaPendente(): void {
  if (capturando || typeof window === "undefined") return;
  capturando = true;

  aoErro = (evento) => {
    if (capturando) filaDeErros.push(evento.error ?? evento.message);
  };
  aoRejeitar = (evento) => {
    if (capturando) filaDeErros.push(evento.reason);
  };

  window.addEventListener("error", aoErro);
  window.addEventListener("unhandledrejection", aoRejeitar);
}

/** Chamado DEPOIS de `Sentry.init()`: o SDK já instalou os handlers dele. */
export function desinstalarCapturaPendente(): void {
  if (!capturando || typeof window === "undefined") return;
  capturando = false;

  if (aoErro) window.removeEventListener("error", aoErro);
  if (aoRejeitar) window.removeEventListener("unhandledrejection", aoRejeitar);
  aoErro = null;
  aoRejeitar = null;
}
