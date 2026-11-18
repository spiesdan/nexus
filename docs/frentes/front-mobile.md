# Frente `front/mobile` — mobile, Capacitor e offline (Agente F)

> Worktree: `/private/var/folders/.../aaa-front-mobile` · branch `front/mobile`
> Baseline: `nexus/main` @ `4aa59c83` · início em 2026-11-18
> Escopo: §11 do `PROMPT-MESTRE-AAA.md`, §2.2 (Agente F) e §7.3–7.12 no que é mobile.
> Nada desta frente toca produção, fiscal, financeiro, tokens de design ou regras de negócio.

## 1. O que existe de fato (medido, não presumido)

| Capacidade | Estado | Evidência no checkout |
|---|---|---|
| Web responsiva | `[x] comprovado` (código + viewport) | `components/shell/MobileDock.tsx` usado por `app/app/_components/AppShell.tsx`; `pb-24 md:pb-6`; `app/layout.tsx` exporta `viewport`. Não houve inspeção visual em aparelho físico. |
| PWA instalável | `[~] parcial` | `app/manifest.ts` (display standalone, ícone 512 gerado em runtime) + `public/sw.js` + `app/app/_components/RegistrarServiceWorker.tsx` (só em produção). Não há teste que instale o PWA. |
| Service worker offline | `[x] comprovado` no código | `public/sw.js` (186 linhas): cache-first para `/_next/static`, network-first para navegação, purga em `/login` e `/api/auth/*`, `push`/`notificationclick`. |
| Notificações web (push) | `[~] parcial` | `lib/notifications/push_client.ts` assina `pushManager`; o `sw.js` exibe. Depende de VAPID/credencial por instalação. |
| Shell Capacitor | `[x] comprovado` no código | `capacitor.config.ts` (`appId tech.billhigiene.crm`, `webDir mobile/www`), `mobile/` (vite, duas páginas, ~zero framework), `android/` (Capacitor 8.5.3, minSdk 24, target 36). |
| SQLite no aparelho | `[x] comprovado` | `lib/offline/db.ts` (nativo = SQLite; navegador = jeep-sqlite/IndexedDB; SSR não abre), schema de fila e catálogo. |
| Fila offline + idempotência | `[x] comprovado` | `lib/offline/outbox.ts`; `chave_sincronizacao` = UUID da fila; servidor relê antes de validar e trata corrida 23505 (`lib/comercial/criar-pedido.ts:74-110, 361-383`); 8 testes em `tests/unit/pedido-chave-sincronizacao.test.ts` + e2e `pedido-idempotencia.spec.ts`. |
| Sync/reconexão | `[x] comprovado` (após esta frente) | `lib/offline/sync.ts` + `app/app/_components/SincronizadorOffline.tsx`. Ver F-MOB-1. |
| Notificações nativas | `[ ] não existe` | Nenhum `@capacitor/push-notifications` ou `local-notifications`; `capacitor.plugins.json` só tem SQLite e Network. |
| Deep links | `[ ] não existe` | `AndroidManifest.xml` só tem MAIN/LAUNCHER; `custom_url_scheme` declarado em `strings.xml` sem `intent-filter`. |
| iOS | `[ ] não existe` | Não há `ios/`; `capacitor.config.ts` só configura `android`. |
| APK | `[~] parcial` | `.github/workflows/apk.yml` compila `assembleDebug` em PR que toque `mobile/`, `lib/offline/`, `capacitor.config.ts` e `SincronizadorOffline.tsx`. **Não** é check obrigatório. Nenhum APK foi executado em aparelho nesta auditoria. |

## 2. Matriz de dispositivos × jornadas × versões

O que foi **executado** e o que é **limitação de equipamento** (`[!]`).

| Ambiente | Versão | Jornadas exercitadas | Resultado |
|---|---|---|---|
| Chromium headless (Playwright 1.64.0), emulação `Pixel 7` — 412×915, `isMobile`, `hasTouch` | vite 8.3.4, jeep-sqlite 2.8.0, SQLite via wasm | shell: catálogo ausente bloqueia captura · captura cliente→item→quantidade→salvar · OFF-0001/OFF-0002 · fila recusada com motivo · tentar de novo · descartar · botão "Enviar agora" | `[x]` 6/6 (`playwright.mobile.config.ts`) |
| Node 22 + jsdom (vitest 4.1.11) | — | transições da fila, dreno (200/201/422/401/500/timeout), chave de sincronização, retomada após reinício | `[x]` ver §5 |
| Android físico (qualquer aparelho) | APK debug do `apk.yml` | abrir shell sem rede, capturar, drenar no sistema, notificação, reinício do processo no meio do POST | `[!]` **não executado** — sem aparelho Android disponível nesta sessão |
| iOS físico/simulador | — | idem | `[!]` não aplicável: não existe projeto iOS |
| Leitor de tela (TalkBack/VoiceOver) no app nativo | — | navegação por foco na shell | `[!]` não executado |
| PWA instalado (Chrome Android) | — | instalar, abrir offline, receber push | `[!]` não executado; coberto apenas por código |

### Versões que compõem o artefato

`@capacitor/core|android|cli` 8.5.3 · `@capacitor-community/sqlite` 8.1.1 · `@capacitor/network` 8.0.1 ·
`jeep-sqlite` 2.8.0 · `vite` 8.3.4 · `next` 16.4.6 · Android `minSdk 24` / `targetSdk 36`,
`versionCode 1` / `versionName "1.0"` (`android/app/build.gradle`).
Versão do produto: tag `v1.55.0` (a do baseline; esta frente não publica release).

## 3. Defeitos encontrados e corrigidos

### F-MOB-1 `[x]` — o sincronizador da fila nunca foi montado (P0)

`app/app/_components/SincronizadorOffline.tsx` foi criado em `aaff0b51` (10/10/2026),
**importado** em `app/app/layout.tsx:26` e **nunca renderizado**. Medido:

```console
$ grep -c "<SincronizadorOffline" app/app/layout.tsx
0
$ pnpm exec eslint app/app/layout.tsx
26:10  warning  'SincronizadorOffline' is defined but never used.
```

Consequência: a fila de pedidos capturados sem sinal **nunca subia sozinha**. Nenhum
teste pegava, porque os testes mediam `lib/offline/*` (a biblioteca) e o shell (Playwright
do vite) — nunca a ligação entre os dois. E o `eslint` só dá *warning*, que não derruba
`pnpm lint`.

Correções:

- `<SincronizadorOffline />` montado no layout, ao lado de `RegistrarServiceWorker`.
- `tests/unit/layout-componentes-montados.test.ts`: todo import de `./_components/` no
  layout precisa aparecer como JSX. Fecha a classe inteira de defeito, não só esta peça.

### F-MOB-2 `[x]` — linha presa em `enviando` nunca era retomada (P0)

O dreno reservava a linha (`status='enviando'`) **antes** do POST. Se o processo morresse
no meio (Android mata o WebView em segundo plano, o vendedor fecha o app, a bateria acaba),
a linha ficava `enviando` para sempre: `filaPendente` só lê `pendente`. A tela mostrava
"enviando…" eternamente e o pedido nunca mais subia — falha silenciosa.

Correções em `lib/offline/outbox.ts` + `lib/offline/db.ts` + `lib/offline/sync.ts`:

- coluna `reservado_em`, carimbada em `reservarParaEnvio`; migração idempotente por
  `PRAGMA table_info` (o APK anterior já tem a tabela, e `CREATE TABLE IF NOT EXISTS` não
  acrescenta coluna);
- `recuperarTravados` devolve à fila o que passou de 3 min (POST tem timeout de 30 s) ou
  não tem carimbo (banco de versão anterior);
- `drenarFila` chama a recuperação no início e reporta `retomados`.

O reenvio continua seguro: a linha volta com o **mesmo** UUID, que é a
`chave_sincronizacao` do servidor — se o POST anterior commitou, o próximo devolve o
pedido existente (`ja_existia`) em vez de duplicar.

### F-MOB-3 `[x]` — retry dependia de um evento `online` que o caso real não emite

A fila só era drenada na abertura e no evento `online`. Wi-Fi de hotel que "conecta" sem
internet, servidor fora por dez minutos e WebView retomado sem evento nenhum deixavam a
fila parada até o próximo cold start.

Correção: retry com backoff (30 s → 5 min) enquanto houver fila, novo disparo quando a aba
volta a ficar visível, e faixa persistente com contagem, motivo da recusa e ações
("Enviar agora", "Tentar de novo"). Antes o único sinal era um toast de 4 s.

### F-MOB-4 `[x]` — recusado não tinha saída no shell

`reabrirRejeitado` e `descartarPendente` existiam em `lib/offline/outbox.ts` **sem nenhum
chamador**: a linha dizia "precisa de decisão" e não oferecia decisão. Agora cada linha
recusada tem "Tentar de novo" e "Descartar" (com confirmação); `pendente` também pode ser
descartado. Sem isso, limpar a fila exigia desinstalar o app.

### F-MOB-5 `[x]` — `<button id="btn-enviar">` sem handler

O botão "Enviar agora" existia no HTML do shell e não fazia nada ao ser tocado — o mesmo
defeito do F-MOB-1 em escala menor (peça visível sem ligação). Agora explica cada estado
(sem fila, com recusado, sem sinal) ou abre o sistema, que é quem drena.

### F-MOB-10 `[x]` — PR que muda `android/**` não compilava o APK

O `paths:` do `apk.yml` listava `mobile/**`, `lib/offline/**` e `capacitor.config.ts`. Uma
edição no `AndroidManifest.xml` (permissão, backup, deep link) passava em PR **sem nunca
ser compilada** — o único artefato que o vendedor instala ficava com o manifest antigo.
Incluídos `android/**`, `tests/e2e/mobile-*.spec.ts` e `playwright.mobile.config.ts`.

### F-MOB-9 `[x]` — 200 sem lista apagava o catálogo do aparelho

`baixarProdutos`/`baixarContatos`/`baixarTabelas` liam `corpo.data ?? []`. Uma resposta 200
sem `data` (shape mudado, proxy, erro embrulhado) era interpretada como "catálogo vazio":
o `DELETE` rodava, o aparelho zerava e a tela passava a exigir "abra o sistema com internet"
no meio da rota — sem erro visível. Agora só `data: []` significa vazio; ausência de lista
lança antes de qualquer `DELETE`.

### F-MOB-8 `[x]` — o Android fazia backup do SQLite com CPF/CNPJ dos clientes

`android/app/src/main/AndroidManifest.xml` nascia com `android:allowBackup="true"` (default do
template do Capacitor), e o banco `crm-offline` guarda o catálogo de contatos — nome, cidade
e **documento** — além da fila de pedidos. O sistema operacional copiava isso para a conta
Google do usuário sem nenhuma decisão do produto; não existe backup como funcionalidade.

Correção: `allowBackup="false"` + `fullBackupContent="false"` + `dataExtractionRules`
excluindo `database` e `sharedpref` nas duas portas (nuvem **e** aparelho→aparelho — no
Android 12+, `allowBackup=false` sozinho não bloqueia a segunda). Gate em
`tests/unit/android-manifest-privacidade.test.ts`. Não validado em aparelho: sem Android
SDK/aparelho nesta sessão, a prova é a configuração + teste estático.

### F-MOB-7 `[x]` — toque duplo em "Salvar na fila" enfileirava dois pedidos

Cada clique gerava um UUID novo e enfileirava; a idempotência do servidor não cobre
chaves diferentes — eram dois pedidos legítimos para ele, com `OFF-0001` e `OFF-0002`.
Trava síncrona antes do primeiro `await` (botão `disabled` não emite o segundo clique), e
falha de banco reabilita o botão com o motivo. Regressão coberta no e2e do shell.

### F-MOB-6 `[x]` — comentário do manifest negava o service worker

`app/manifest.ts` dizia que service worker era "fase futura" enquanto `public/sw.js` já
roda em produção. Corrigido, com `id: "/"` explícito (identidade de instalação: sem ele,
mudar `start_url` criaria um segundo app instalado em vez de atualizar o existente).

## 4. Bloqueio arquitetural `[!]` — a ponte SQLite entre shell e sistema não existe no APK como configurado

**Este é o achado mais importante da frente e ele precisa de decisão, não de patch.**

O desenho declarado é: o shell (origem `https://localhost`, empacotado) grava no SQLite
nativo; o sistema (`https://crm.billhigiene.tech`, carregado no mesmo WebView por
`window.location.href`) lê o **mesmo** arquivo e drena.

O que o código do Capacitor 8.5.3 faz:

- `capacitor.config.ts` não define `server.url` nem `android.allowNavigation`;
- `Bridge.java:266-270` injeta a ponte com
  `WebViewCompat.addDocumentStartJavaScript(webView, script, singleton(allowedOrigin))`,
  e `allowedOrigin` é derivado de `appUrl` — ou seja, `https://localhost`;
- `BridgeWebViewClient.shouldInterceptRequest` só serve assets locais; navegação para
  origem externa passa direto, sem ponte.

Consequência: na página remota, `window.Capacitor.isNativePlatform()` é `false` (ou o core
do bundle responde `web`), então

1. `ehNativo()` do sincronizador é `false` → o dreno não roda; e
2. `lib/offline/db.ts` cai em jeep-sqlite/IndexedDB → **outro banco**, com outra fila.

O pedido capturado no shell fica no SQLite nativo e o sistema nunca o vê. Isso é
verificável por leitura de fonte e configuração (feito acima); **confirmar em aparelho é
pendência** — não foi executado por falta de dispositivo.

### Opções (decisão do coordenador)

| Opção | O que muda | Custo/risco |
|---|---|---|
| A. `server.url` = sistema + `allowNavigation` | o app abre direto o sistema (ponte na origem remota); o shell vira fallback de erro | perde "shell abre sempre offline"; amarra a URL da instalação no build; precisa validar `errorPath`/assets locais em aparelho |
| B. shell drena sozinho com credencial de dispositivo | shell ganha token de dispositivo (pareamento) e usa `CapacitorHttp`; sistema só consulta | exige endpoint novo + revisão de segurança (Agentes A/B); é a arquitetura offline-first canônica |
| C. abandonar SQLite nativo e usar IndexedDB + service worker na origem do sistema | a fila vive onde a sessão vive; shell passa a ser só captura de emergência | reescreve a captura; depende de SW no WebView; perde o "abre sempre" para quem nunca abriu online |

Nenhuma delas é "só código mobile": A muda o artefato de instalação, B muda contrato de
API/segurança, C muda o modelo de dados local. Por isso **não** foi implementada aqui.

## 5. Gates executados

| Comando | Resultado |
|---|---|
| `pnpm exec vitest run tests/unit/offline-outbox-sync.test.ts tests/unit/offline-catalogo.test.ts tests/unit/pedidos-offline.test.tsx tests/unit/service-worker-unico.test.ts tests/unit/pedido-chave-sincronizacao.test.ts tests/unit/layout-componentes-montados.test.ts` | ver §5.1 |
| `pnpm exec playwright test -c playwright.mobile.config.ts` | 7/7 (Pixel 7 emulado, Chromium) |
| `pnpm exec eslint <arquivos alterados>` | 0 erro, 0 warning |
| `pnpm exec tsc --noEmit` | ver §5.1 |
| `pnpm test:unit` (suíte inteira) | ver §5.1 |

### 5.1 Números (preenchidos na execução)

<!-- medido em 2026-11-18, worktree aaa-front-mobile -->
- unit offline + wiring + faixa + manifests + catálogo: **58/58** em 9 arquivos.
- e2e shell: **7/7**.
- typecheck/lint/suíte completa: registrados no PR desta frente (o comando não cabe em
  prosa que envelhece).

## 6. Limitações e pendências verificáveis

1. `[!]` Nenhum APK executado em aparelho Android físico; nenhuma prova de ícone, splash,
   permissão, ciclo de vida ou morte de processo.
2. `[!]` Nenhum teste de leitor de tela no shell nativo (TalkBack). O shell usa HTML
   semântico (`role="status"`, `aria-label` nos botões de quantidade), mas isso é código,
   não prova de leitor.
3. `[!]` iOS não existe — não há o que validar.
4. `[~]` O shell e o `android/` carregam marca de uma instalação específica
   (`appName "Bill Higiene"`, `URL_DO_SISTEMA https://crm.billhigiene.tech`, `h1` do shell).
   Isso contraria a doutrina white-label e o `tests/unit/branding.test.ts` não vê (varre
   `app|components|lib|workers|hooks`). Precisa de decisão: o label do ícone e a URL só
   podem ser resolvidos em build/emparelhamento, não do banco. **Não alterado aqui** para
   não quebrar o APK de debug sem definir a origem da configuração.
5. `[x]` `mobile/www/` **não é mais versionado** (era, apesar do `.gitignore`): todo build
   do shell virava diff de assets com hash. O `apk.yml` já roda `pnpm mobile:build` antes
   de `cap sync`; quem clona precisa rodar o build uma vez. Verificado: `pnpm mobile:build`
   continua gerando `mobile/www/` (agora ignorado).
6. `[ ]` Notificação nativa (app fechado) não existe; o push web cobre o PWA, não o APK.
7. `[~]` A faixa da fila e a faixa de "WhatsApp desconectado" são ambas `sticky top-0` e
   podem se sobrepor no caso raro (fila pendente + canal caído). Não é falha silenciosa:
   a de conexão fica por cima (z-50) e a da fila continua logo abaixo ao rolar. Ajuste
   visual fica para o Agente D, dono do shell.
8. `[ ]` Deep link (`tech.billhigiene.crm://`) declarado em `strings.xml` sem
   `intent-filter` — não abre nada.

## 7. Próximas fatias seguras (sem decisão pendente)

- Teste de instalação do PWA em Chromium (o manifest já tem gate estático; falta o
  evento `beforeinstallprompt` numa build de produção), sem declarar "instalado em
  aparelho".
- Marca do shell por configuração de build (`CAPACITOR_APP_NAME` / `VITE_SYSTEM_URL`),
  com default neutro e entrada no `.env.example` — só depois da decisão do item 4.
