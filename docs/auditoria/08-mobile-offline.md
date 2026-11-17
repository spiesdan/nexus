# Mobile e offline

> **Gerado por comando**: `pnpm exec tsx scripts/auditoria/inventario-completo.ts`.
> Fonte: `capacitor.config.ts, mobile/, public/sw.js, lib/entregas/outbox.ts`. Gerado em 2026-11-17T14:02:06.142Z. Não editar à mão.

| Peça | Estado medido |
|---|---|
| Capacitor configurado | sim |
| `webDir` | — |
| `appName` declarado no shell | — |
| `appId` | — |
| `mobile/` empacotado | index.html, novo-pedido.html, public, src, vite.config.ts, www |
| Service worker (`public/sw.js`) | 110 linhas |
| Service worker de notificação | presente |
| Fila offline (`lib/entregas/outbox.ts`) | presente |
| SQLite nativo usado em | 1 arquivo(s) |

## O que o service worker declara fazer

```
/*
 * SERVICE WORKER — o app continua abrindo sem internet.
 *
 * ─── O QUE ELE FAZ, E O QUE ELE NÃO FAZ ────────────────────────────────────
 *
 * O sistema é Next com dados no servidor: sem rede, a página não é montada de
 * novo. O que dá para garantir é o que o motorista precisa na rua: depois de
 * abrir a cabine UMA vez com internet, o HTML, o JS e o CSS daquela tela ficam
 * no aparelho. Sem sinal, o app abre a última versão visitada e a rota vem do
 * `localStorage` (o `_motorista` já cai em `lerRotaLocal`). A baixa continua
 * entrando na fila local e sobe quando o sinal volta.
 *
 * Ele NÃO intercepta POST nem `/api/auth` — login, logout e mutações nunca são
 * servidos de cache. E, quando o app está online, a navegação é sempre buscada
 * na rede: cache é só o plano B, para não servir tela velha depois de deploy.
 *
 * ─── PRIVACIDADE ────────────────────────────────────────────────────────────
 *
 * O HTML do servidor carrega dados do usuário. Por isso qualquer navegação
 * para `/login` ou `/api/auth/signout` apaga o cache inteiro — o próximo login
 * no mesmo aparelho não enxerga a tela de quem saiu.
 */
```

## Achado de marca no shell nativo

O `appName` acima é o nome que aparece **debaixo do ícone no aparelho**. Se ele carrega marca de cliente/revendedor, isso alcança o usuário final — e o gate `tests/unit/branding.test.ts` não vê, porque varre `app|components|lib|workers|hooks` e só o nome legado do produto.


## Dois service workers no mesmo escopo — medido em 17/11/2026

O app registrava **dois** workers em `scope: "/"`: `/sw.js` (cache offline) e
`/notify-sw.js` (bandeja + Web Push). Um escopo só admite **um** worker: ao
ativar notificações, o segundo **substituía** o primeiro e o cache offline
morria em silêncio — a tela não avisa, o app apenas deixa de abrir sem rede.

**Corrigido:** os tratadores de `push`, `notificationclick` e `message`
(`show-os-notify`) passaram para o próprio `sw.js`; `ensureNotifyServiceWorker()`
registra `/sw.js`; `public/notify-sw.js` foi removido. Gate novo em
`tests/unit/service-worker-unico.test.ts`: só um `*sw.js` em `public/`, o worker
único trata cache **e** bandeja, e o registro aponta para `/sw.js` (o comentário
pode citar o arquivo antigo; o código, não).

**O que continua em aberto (fase 7):**

- `mobile-offline.spec.ts` (5 casos) só roda no job `apk-debug`, que **não é**
  um dos cinco checks obrigatórios — o offline não tem gate no PR;
- `sw.js` e `lib/offline/catalogo.ts` **não têm teste** (a outbox tem 14 casos);
- sem precache e com `CACHE = "nexus-app-v1"` fixo: o offline só existe para
  telas já visitadas, e o fallback é um HTML genérico, não uma página offline;
- `mobile/src/shell.ts` navega para `https://crm.billhigiene.tech` **hardcoded**
  (`server.url` ausente no Capacitor).
