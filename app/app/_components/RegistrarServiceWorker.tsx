"use client";

import * as React from "react";

import { urlDoServiceWorker } from "@/lib/service-worker/url";

/**
 * Registra o service worker (`/sw.js`) que mantém o app abrindo offline.
 *
 * Só em produção: em `next dev` o service worker cachearia os chunks de
 * desenvolvimento e serviria código velho entre edições, que é o pior lugar
 * para descobrir que o cache está mentindo.
 *
 * A URL leva `?v=<versão do build>`: é o que faz o navegador ver um worker
 * NOVO a cada atualização e o cache antigo morrer (ver `urlDoServiceWorker`).
 */
export function RegistrarServiceWorker() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const registrar = () => {
      void urlDoServiceWorker()
        .then((url) => navigator.serviceWorker.register(url, { scope: "/" }))
        .catch(() => undefined);
    };
    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });
  }, []);
  return null;
}
