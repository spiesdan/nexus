"use client";

import * as React from "react";

/**
 * Registra o service worker (`/sw.js`) que mantém o app abrindo offline.
 *
 * Só em produção: em `next dev` o service worker cachearia os chunks de
 * desenvolvimento e serviria código velho entre edições, que é o pior lugar
 * para descobrir que o cache está mentindo.
 */
export function RegistrarServiceWorker() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const registrar = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    };
    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });
  }, []);
  return null;
}
