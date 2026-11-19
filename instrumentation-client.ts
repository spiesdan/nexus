/**
 * Instrumentação do cliente — só a JANELA, sem o SDK.
 *
 * O entry importava `@sentry/nextjs` e chamava `Sentry.init()` no topo: ~164 KB
 * gzip entravam no first load de toda rota, inclusive `/login` (doc 42). Aqui
 * ficam apenas dois listeners síncronos que guardam `error` e
 * `unhandledrejection` até o `SentryLazy` (client component do layout raiz)
 * carregar o SDK com `import()`.
 *
 * Não exportamos `onRouterTransitionStart`: `tracesSampleRate` é 0, então não
 * há span de navegação a gravar. Erro de navegação continua coberto pelos
 * listeners acima e pelo `onRequestError` do servidor.
 */
import { instalarCapturaPendente } from "./lib/sentry/fila";

instalarCapturaPendente();
