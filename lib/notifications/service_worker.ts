/**
 * Garante o service worker do app — o MESMO que guarda o cache offline.
 *
 * ─── O DEFEITO QUE ISTO CORRIGE (medido em 17/11/2026) ─────────────────────
 *
 * Existiam dois workers no escopo `/`: `/sw.js` (cache offline) e
 * `/notify-sw.js` (bandeja + push), cada um registrado com `scope: "/"`. Um
 * escopo tem UM worker: registrar o segundo SUBSTITUI o primeiro, e quem
 * ativasse notificações perdia o offline sem aviso — o app deixava de abrir sem
 * rede e nada na tela dizia por quê.
 *
 * Agora os tratadores de push/bandeja vivem no `sw.js` (mesmo arquivo) e este
 * módulo só garante que ele esteja registrado — a inscrição de push é feita no
 * `registration.pushManager`, como antes.
 */
export async function ensureNotifyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}
