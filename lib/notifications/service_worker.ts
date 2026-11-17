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
import { urlDoServiceWorker } from "@/lib/service-worker/url";

export async function ensureNotifyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return null;
  try {
    // Reusa o worker já registrado: ele carrega `?v=<versão>` (ver
    // `lib/service-worker/url`), e registrar `/sw.js` "puro" aqui forçaria o
    // navegador a voltar para a URL sem versão — o cache voltaria a nunca
    // morrer em cada atualização.
    const existente = await navigator.serviceWorker.getRegistration("/");
    if (existente) return existente;
    return await navigator.serviceWorker.register(await urlDoServiceWorker(), { scope: "/" });
  } catch {
    return null;
  }
}
