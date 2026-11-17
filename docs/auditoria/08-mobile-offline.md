# Mobile e offline

> **Gerado por comando**: `pnpm exec tsx scripts/auditoria/inventario-completo.ts`.
> Fonte: `capacitor.config.ts, mobile/, public/sw.js, lib/entregas/outbox.ts`. Gerado em 2026-11-17T16:38:51.452Z. Não editar à mão.

| Peça | Estado medido |
|---|---|
| Capacitor configurado | sim |
| `webDir` | — |
| `appName` declarado no shell | — |
| `appId` | — |
| `mobile/` empacotado | index.html, novo-pedido.html, public, src, vite.config.ts, www |
| Service worker (`public/sw.js`) | 187 linhas |
| Service worker de notificação | ausente |
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
/*
 * ─── BANDEJA E WEB PUSH ─────────────────────────────────────────────────────
 *
 * Estes tratadores moravam em `/notify-sw.js`, registrado com `scope: "/"` — e
 * um escopo só tem UM service worker: ativar notificações SUBSTITUÍA este
 * arquivo e o cache offline morria em silêncio (medido em 17/11/2026). Passam a
 * viver aqui, no mesmo worker, para o escopo ter um dono só.
 */
```

## Achado de marca no shell nativo

O `appName` acima é o nome que aparece **debaixo do ícone no aparelho**. Se ele carrega marca de cliente/revendedor, isso alcança o usuário final — e o gate `tests/unit/branding.test.ts` não vê, porque varre `app|components|lib|workers|hooks` e só o nome legado do produto.

