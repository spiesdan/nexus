// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { resolveSentryDsn, isCommunityDsn, integracoesDoCliente } from "./lib/sentry/dsn";
import { sentryScrubHooks } from "./lib/sentry/scrub";

const sentryDsn = resolveSentryDsn(
  typeof window !== "undefined" ? window.__PUBLIC_ENV__?.SENTRY_DSN : undefined,
);
const community = isCommunityDsn(sentryDsn);

Sentry.init({
  dsn: sentryDsn,

  // FORMA DE FUNÇÃO, não de array: array SOMA aos defaults do SDK, e era assim
  // que a `BrowserSession` (default) seguia ligada apesar da política abaixo. A
  // função RECEBE os defaults e o retorno os substitui — é o único jeito de tirar
  // uma integração default sem enumerar as outras dez à mão.
  integrations: (padraoDoSdk) => [
    ...integracoesDoCliente(padraoDoSdk, community),
    Sentry.replayIntegration(),
  ],

  // 0 de TRAÇO e 0 de replay de sessão — decisão de performance, não de
  // diagnóstico (EPIC-12 §S-12.05: bundle raiz medido em 206 KB gz só de Sentry,
  // e `tracesSampleRate: 1` gravava CADA transição de rota no ingest — os docs
  // registram 429 de lá). O que continua ligado é o que explica erro:
  // `replaysOnErrorSampleRate` (replay do momento do crash, com
  // maskAllText/blockAllMedia do `replayIntegration()` sem argumentos) e os
  // próprios eventos de erro. Trace pontual para investigar um incidente
  // específico: suba `tracesSampleRate` temporariamente, meça, volte a 0.
  tracesSampleRate: 0,
  enableLogs: true,

  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  sendDefaultPii: false,

  ...sentryScrubHooks,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
