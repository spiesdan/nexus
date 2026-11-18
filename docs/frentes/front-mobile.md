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

### Como confirmar em 3 minutos (pendência verificável, com aparelho)

1. Instalar o APK debug (`apk.yml` → artifact), abrir o app, capturar um pedido offline.
2. Tocar "Abrir o sistema" e, no desktop com o aparelho plugado, abrir
   `chrome://inspect/#devices` → *inspect* na WebView do app.
3. No console da página remota: `window.Capacitor?.isNativePlatform?.()`.
   **Esperado pelo código atual:** `undefined` ou `false`. Se vier `true`, a ponte
   atravessa a navegação e a minha leitura da fonte está errada — este é o teste que
   decide.
4. Se `false`, `await (await import('@capacitor/core')).Capacitor.getPlatform()` responde
   `web` e o banco aberto é o do IndexedDB (`Application` → *IndexedDB* → `jeep-sqlite`),
   **não** o SQLite nativo onde o shell gravou a fila.

Para o backup (F-MOB-8): `adb shell dumpsys backup | grep -A2 tech.billhigiene.crm` não deve
listar o app como elegível, e `adb backup` deve recusar.

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

## 8. Relatório do agente (§2.3 do prompt mestre)

1. **Objetivo e escopo.** Auditar e corrigir o que é verificável em mobile, Capacitor e
   offline; confirmar o que existe e o que é planejado; não declarar aparelho validado sem
   executar nele. Fora do escopo: fiscal, financeiro, tokens/design global, schema de
   servidor.
2. **Arquivos alterados.** `app/app/layout.tsx`, `app/app/_components/SincronizadorOffline.tsx`,
   `app/manifest.ts`, `lib/offline/{db,outbox,sync,catalogo}.ts`, `mobile/src/{shell,novo-pedido}.ts`,
   `mobile/src/estilo.css`, `android/app/src/main/AndroidManifest.xml`,
   `android/app/src/main/res/xml/data_extraction_rules.xml`, `.github/workflows/apk.yml`,
   `tests/e2e/mobile-offline.spec.ts`, `tests/unit/{layout-componentes-montados,sincronizador-offline,manifest-pwa,android-manifest-privacidade,offline-outbox-sync,offline-catalogo}`,
   esta doc. Removidos do índice: `mobile/www/**` (build).
3. **Regras preservadas.** Nenhuma regra de negócio mudou: o servidor continua sendo a
   autoridade de crédito, estoque, preço e aprovação; o dreno continua FIFO; 422 continua
   terminal até decisão humana; 401/403 continua parando tudo; a chave de sincronização
   continua sendo o UUID da fila. **Decisões pendentes:** (a) caminho arquitetural A/B/C do
   §4; (b) origem da marca/URL do shell (§6.4); (c) notificação nativa e deep link (inexistentes).
4. **Testes.** Comandos e resultados no §5. Typecheck da fatia tocada: `tsc -p` com os
   arquivos desta frente → exit 0. A suíte unitária completa e o `tsc` do repo excederam o
   limite desta sessão sob carga de três worktrees (load average > 12); os arquivos
   tocados passam isolados. **O gate final é o CI (`verify`)** e não foi substituído por
   prosa.
5. **Evidências.** Commits nesta branch, com o "antes" medido em cada mensagem
   (`grep -c "<SincronizadorOffline"` = 0; `eslint` warning; `allowBackup="true"`;
   `btn-enviar` sem handler). Os testes novos falham se as correções forem revertidas —
   provado por mutação: removendo a linha `<SincronizadorOffline />` do layout,
   `layout-componentes-montados.test.ts` reprova com "importado e nunca renderizado"
   (exit 1; arquivo restaurado em seguida).
6. **Riscos.** O bloqueio do §4 é de produto: sem decisão, pedido offline não sobe no APK.
   A faixa nova é `sticky top-0` como as demais faixas do shell; sobreposição rara
   documentada (§6.7). A migração de coluna usa `PRAGMA` — se o plugin negar `PRAGMA`,
   a abertura do banco falha alto (não silencioso), o que é o comportamento desejado.
7. **Worktree/branch.** `/private/var/folders/.../aaa-front-mobile`, branch `front/mobile`,
   base `4aa59c83` + merge de `nexus/main` (`ef08450c`). Sem deploy.
8. **Integração.** O único arquivo compartilhado tocado é `app/app/layout.tsx` (uma linha de
   render + comentário) — conflito possível com Agente D/E se mexerem na mesma região.
   `app/manifest.ts` e `android/**` são arquivos de mobile. `mobile/www` saiu do índice:
   quem tinha build local não perde nada; clone novo roda `pnpm mobile:build`.
9. **Produção.** Nenhum acesso, escrita, deploy ou operação real (fiscal, financeira,
   WhatsApp). Tudo local, em worktree.

---

## 9. Opção B (credencial de dispositivo) — estado em 18/11/2026

**Decisão do dono: B.** Justificativa registrada: o APK é publicado uma vez para
instalações self-host com URLs diferentes; `server.url` fixo (A) amarraria o artefato a um
domínio, e abandonar o SQLite (C) jogaria fora a captura offline que já existe.

> ⚠️ O worktree original (`.../T/aaa-front-mobile`) foi apagado por um reinício do
> servidor. O novo worktree canônico desta fatia é
> **`/Users/bill/Downloads/nexus-worktrees/offline-device`**, branch
> **`feat/offline-device`** (a partir de `nexus/main` @ `014ccef3`).

### 9.1 Entregue nesta parada (fatia B-1: credencial no servidor)

| Peça | Arquivo |
|---|---|
| Tabela + RLS + índices + trigger | `supabase/migrations/20261123150000_0322_credencial_de_dispositivo_offline.sql` |
| Apêndice idempotente | fim de `supabase/baseline.sql` |
| Linha do MANIFEST | `supabase/migrations/MANIFEST.md` (0322) |
| Auth do bearer (hash, expiração, revogação, escopo, papel ao vivo, rate limit, `last_seen`) | `lib/auth/device-token.ts` |
| Schema de criação | `lib/schemas/offline-devices.ts` (+ export em `lib/schemas/index.ts`) |
| Emitir/listar | `app/api/v1/offline-devices/route.ts` |
| Revogar | `app/api/v1/offline-devices/[id]/revoke/route.ts` |
| Validar pareamento | `app/api/v1/device/me/route.ts` |
| Rota do aparelho liberada no proxy | `lib/auth/public-paths.ts` (`/^\/api\/v1\/device\//`) |
| Auditoria | `lib/audit/actions.ts` (`offline_device.created`, `offline_device.revoked`) |
| Teste unitário | `tests/unit/device-token.test.ts` (6/6) |

**Contratos já fixados** (não reabrir sem motivo):

- token `nod_<8 hex>_<32 bytes base64url>`; banco só `sha256` hex; prefixo `nod_ab12cd34` na lista;
- escopos fechados: `offline:pedidos:write`, `offline:catalogo:read`; `scopes` não entra no body;
- emissão `POST /api/v1/offline-devices` (admin; rate limit 10/h/org; plaintext uma vez);
- `POST /api/v1/offline-devices/[id]/revoke` idempotente; `GET /api/v1/device/me` devolve org/nome/prazo;
- 401 `token_expired` × 401 `token_revoked` × 403 `forbidden_scope`/`forbidden` (papel ao vivo);
- uso: 120 req/min por hash+IP; `last_seen_at`/`last_seen_ip` atualizados em toda chamada válida;
- credencial vinculada a `user_id` = **vendedor que assina o pedido** (default: quem cria); papel
  exigido na emissão: `agent|vendedor|manager|admin`; revogar/remover o vínculo corta o aparelho na hora.

### 9.2 Falta (ordem sugerida, uma fatia por PR)

1. **B-2 — pedidos:** `POST /api/v1/device/orders` (auth + `ESCOPO_PEDIDOS` + papel, recusa
   `ignorar_estoque|ignorar_credito`, chama `criarPedidoComercial(admin, admin, {orgId, userId,
   podeIgnorar:false}, entrada)`, 200 em `ja_existia`, audit com `{canal:"offline_device", device_id}`).
   Reaproveita a `chave_sincronizacao` existente — nenhuma regra nova.
2. **B-3 — catálogo:** `GET /api/v1/device/catalog` (auth + `ESCOPO_CATALOGO`; contatos paginados por
   `id` com cursor, 200/página; produtos 500 e tabelas 100 na primeira página; campos
   `{id,nome,documento,cidade,limite_cents}` / `{id,codigo,nome,preco_cents,controla_estoque,quantidade,ativo}`;
   excluir anonimizado/mesclado; nunca CPF/e-mail/telefone).
3. **B-4 — cliente do shell:** `lib/offline/credencial.ts` (meta: `dispositivo_url|token|nome|
   organizacao|usuario|expira_em|estado`; código `NEXUS1.<base64url({u,t})>`),
   `lib/offline/http.ts` (CapacitorHttp nativo + fetch no navegador; Bearer só no header;
   timeout 30 s), `lib/offline/catalogo.ts` (extrair `gravarCatalogo` e somar
   `sincronizarCatalogoDoDispositivo`), `lib/offline/sync.ts` (4º parâmetro `caminhoDoPedido`,
   default `/api/v1/commercial-orders`), `mobile/src/shell.ts` + `mobile/index.html` (pareamento,
   estados pareado/expirado/revogado/sem_rede, dreno com backoff, 401 mantém a fila).
4. **B-5 — UI no sistema:** `app/app/settings/devices/page.tsx` + `_components` (admin; lista,
   criar com vendedor via `/api/v1/team/assignable`, exibir código de pareamento uma vez, revogar),
   entrada em `lib/navigation/registry.ts` (`/app/settings/devices`, grupo `organizacao`,
   seção “Dados e acesso”, `minRole: admin`, ícone `DeviceMobile`).
5. **B-6 — testes/invariantes:** `tests/invariants/offline-devices-rls.test.ts` (dois tenants: token
   de A não lê/revoga aparelho de B; `anon` sem select; hash único; CHECK de formato),
   unit das rotas com dublê, e **`pnpm test:db`**.
6. **B-7 — aparelho:** APK físico provando `CapacitorHttp` + pareamento + dreno + 401/revogação
   (`[!]` até então). Atualizar a matriz do §2.

### 9.3 Como retomar

```bash
cd /Users/bill/Downloads/nexus-worktrees/offline-device
git fetch nexus && git rebase nexus/main      # branch feat/offline-device
pnpm install                                   # já feito neste worktree
pnpm exec vitest run tests/unit/device-token.test.ts
pnpm test:db                                   # quando B-6 existir (Docker)
```

**Revisão de segurança:** pedir ao Agente A no PR — pontos a auditar: hash × plaintext, escopo
fechado, filtro de `organization_id` vindo do token (nunca de body/query), papel lido ao vivo,
`last_seen` como observabilidade e não autorização, `/device/*` público no proxy **com** guard na
rota, e o fato de `/api/v1/offline-devices` (gestão) NÃO ser público.

### 9.4 O que NÃO foi executado

`pnpm test:db` (sem os invariantes de B-6 ainda), build do APK, e qualquer validação em aparelho.
Nada de produção. A suíte completa não rodou nesta saída (ordem de teto de concorrência).

### 9.5 B-2, B-3 e B-4 entregues — com prova no emulador (18/11/2026)

| Fatia | O que entrou | Teste |
|---|---|---|
| **B-2** | `POST /api/v1/device/orders`: Bearer do aparelho + `offline:pedidos:write` + papel ao vivo; recusa `ignorar_estoque/credito`; chama `criarPedidoComercial` (mesma regra) com `chave_sincronizacao`; 200 em `ja_existia`; audit com `device_id`. | `offline-outbox-sync.test.ts`: caminho `/device/orders` e 401 que **mantém a linha** `pendente`. |
| **B-3** | `GET /api/v1/device/catalog`: escopo de catálogo, contatos paginados (200/página), produtos 500 + tabelas 100 na 1ª página, sem CPF/e-mail/telefone. | `offline-catalogo.test.ts`: acumula páginas e grava uma vez; resposta sem lista **não apaga** o aparelho. |
| **B-4** | `lib/offline/credencial.ts` (meta + código `NEXUS1.<base64url({u,t})>`), `lib/offline/http.ts` (CapacitorHttp nativo, fetch no navegador, Bearer só no header, timeout 30 s), `lib/offline/catalogo.ts` (`gravarCatalogo` compartilhado + sync do dispositivo), `drenarFila` com `caminhoDoPedido`, shell com pareamento/estados/backoff/401 sem descartar. | `pareamento.test.ts` (5) + `mobile-offline.spec.ts` (7/7, Chromium/Pixel 7) + fluxo Maestro abaixo. |

**Correções de UX achadas no aparelho (não apareciam no navegador):**

- `adiado` (timeout/DNS/5xx) não gerava aviso — o dreno trata por item e voltava normal; a tela ficava
  idêntica a "nada aconteceu". Agora há aviso próprio. Medido com fila de 1 e host `.invalid`.
- O aviso morava **abaixo** do botão "Enviar agora" e a falha existia fora da tela. Subiu para o topo
  (logo abaixo do sinal).
- O campo do código guardava o token visível quando a confirmação falhava por rede. Agora é limpo ao
  salvar, mesmo em `sem_rede`.
- `appName`/`strings.xml` do APK deixaram de ser "Bill Higiene": o rótulo é **"Pedidos offline"** e a
  URL vem do pareamento. O artefato passou a ser genérico de verdade (white-label).

**Prova no emulador** (AVD `nexus`, Pixel 7 arm64, Android 36, Maestro 2.12.1; APK debug local):

```bash
export JAVA_HOME="$HOME/android-sdk/jdk21/jdk-21.0.13+9/Contents/Home"
export ANDROID_HOME="$HOME/android-sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$HOME/.maestro/bin:$PATH"
pnpm mobile:build && pnpm exec cap sync android && (cd android && ./gradlew assembleDebug)
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
maestro test tests/e2e-mobile/jornada-pareamento.yaml   # exit 0
```

Fluxo: sem credencial + fila (1) → cola código com host `https://sistema.invalid` → estado
`sem rede — não deu para confirmar o pareamento` e "Credencial salva" → "Enviar agora" → aviso
"Sem conexão com o sistema (sem conexão)… os pedidos continuam na fila" → **`(1)` e `OFF-0001`
intactos**. Banco conferido após o teste: `status=pendente, tentativas=2,
ultimo_erro=Unable to resolve host "sistema.invalid"`.
Evidências: `docs/auditoria/evidencias/mobile-b-2026-11-18/` (3 capturas).

**Ainda não provado no aparelho:** dreno **aceito** de ponta a ponta (exige instalação real com
banco: o host do teste é deliberadamente inalcançável), 401/403 reais (`token_revoked`) e o catálogo
baixado pelo token. `[!]` — o caminho de rede/DB do servidor está coberto por unit/invariante, não
pelo emulador.

### 9.6 B-5 e B-6 entregues

**B-5 — UI `/app/settings/devices`** (`page.tsx` admin-only + `_components/DevicesClient.tsx`):
lista com prefixo/visto/expira/estado; criação com nome, vendedor (via `/api/v1/team/assignable`)
e validade 30/90/180/365; o código de pareamento aparece **uma vez** (textarea + copiar); revogar
com confirmação e aviso de que a fila local NÃO é apagada. Entrada no `lib/navigation/registry.ts`
(grupo `organizacao`, seção “Dados e acesso”, `minRole: admin`, sem sidebar — o menu já estoura a
dobra em 900px) e ícone `DeviceMobile` em `lib/ui/icons.ts`. Gates: `eslint` 0, `tsc` da fatia 0,
`navegacao-*` + `titulos` + `busca-global` **125/125**.

> `[!]` Não houve **prova visual** da tela: o worktree não tem Supabase/`.env` para subir o sistema.
> A validação foi de tipos, lint e regras de navegação. Antes de considerar a fatia fechada, abrir a
> tela numa instalação e conferir o fluxo criar → copiar código → revogar.

**B-6 — invariante cross-tenant + `test:db`:**
`tests/invariants/offline-devices-rls.test.ts` prova, com `set role authenticated` + JWT simulado:
admin de A lê o aparelho de A (controle positivo) e **zero** de B; `manager` lê zero (a policy é
admin, de propósito); revogar por id de B afeta **zero** linhas; `anon` recebe `permission denied`;
o banco recusa hash fora de sha256 (CHECK), prefixo fora de `nod_<8 hex>` e hash duplicado (UNIQUE).
A varredura `rls-completude-varredura` foi satisfeita por `PROVA_PROPRIA` (a tabela fica fora de
`TABLES` porque a policy é admin e o usuário semeado lá é `agent`).

```bash
pnpm test:db tests/invariants/offline-devices-rls.test.ts \
             tests/invariants/rls-completude-varredura.test.ts
# 2 arquivos, 168 testes, exit 0 (inclui install/update do baseline)
```

### 9.7 B-7 — harness pronto, prova pendente de emulador

O harness já está na `main` (entrou junto do #526):

- `android/app/src/debug/` libera cleartext **só** para `10.0.2.2`/`localhost` na build de
  debug — a release continua só HTTPS;
- `tests/e2e-mobile/stub-device-api.mjs` responde `/device/me`, `/device/catalog` e
  `/device/orders` com os contratos reais, inclusive replay idempotente e `REVOKED=1` (401);
- `jornada-dreno-aceito.yaml` e `jornada-token-revogado.yaml` cobrem os dois estados;
- `tests/e2e-mobile/README.md` documenta o `adb reverse` e a semente da credencial.

O que falta é **rodar** os fluxos num aparelho. Precisa de:

1. emulador de pé (`emulator -avd nexus -no-window -no-audio -no-boot-anim -no-snapshot -gpu
   swiftshader_indirect`) — a máquina tem 8 GB e o AVD anterior morreu por OOM;
2. nada mais para o caminho do CLIENTE (stub + APK debug + semente local).

Para provar também o **servidor real** (regra de negócio no aparelho), precisa de uma
instalação local acessível do emulador: Supabase local + `pnpm dev` + org/usuário/produto
semeados e uma credencial emitida — ou uma instalação de teste preparada pelo coordenador.
**Não** aponta para produção; o stub cobre o comportamento do shell e o servidor já tem
unit + invariante.

Outros pendentes: prova visual da B-5 (sem Supabase local no worktree) e trocar o token em
SQLite por Keystore/Keychain (plugin nativo).
