# Acessibilidade — leitor de tela no aparelho (TalkBack)

> **Escopo:** a última pendência `[!]` de acessibilidade — o shell offline
> (`mobile/`) com TalkBack no emulador Android.
> **Executado em:** 18/11/2026, worktree `aaa-front-sentinel`, AVD `nexus`.
> **Nada aponta para produção.** Nenhum deploy.

## 1. Ambiente (medido, não suposto)

| Item | Valor |
| --- | --- |
| Emulador | `emulator-5554`, AVD `nexus`, Pixel 7, Android 16 (API 36), 1080×2400 |
| App | `tech.billhigiene.crm` (`versionName=1.0`), APK debug com `mobile/www` reconstruído |
| TalkBack | `com.google.android.marvin.talkback` `16.0.0.738667889` — **instalado** |
| Serviço | `com.google.android.marvin.talkback/.TalkBackService`, `Bound services:{TalkBack}` |
| Voz | Google TTS em `eng-USA` (o AVD está `en-US`) |
| Outros pacotes | `com.google.android.marvin.talkbackoverlay` |

TalkBack **não** estava ativo; foi habilitado por `settings put secure
enabled_accessibility_services` + `accessibility_enabled=1` +
`touch_exploration_enabled=1`. O diálogo de notificação do Android
Accessibility Suite foi aceito (`Allow`).

## 2. O que foi executado

```bash
export ANDROID_HOME=$HOME/android-sdk
adb shell settings put secure enabled_accessibility_services \
  com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService
adb shell settings put secure accessibility_enabled 1
adb shell settings put secure touch_exploration_enabled 1
adb shell dumpsys accessibility   # Bound services:{TalkBack}
adb logcat -c && adb logcat -v time > /tmp/talkback.log
adb shell input keyevent 61       # foco por teclado/TalkBack
adb shell input swipe ...          # rolagem
adb shell input tap ...            # exploração (TalkBack usa toque)
adb shell uiautomator dump /sdcard/ui.xml
```

Evidências em `evidencias/talkback-2026-11-18/`:
`evidencias/talkback-2026-11-18/home.png`,
`evidencias/talkback-2026-11-18/home.xml`,
`evidencias/talkback-2026-11-18/home-fila.xml`,
`evidencias/talkback-2026-11-18/novo-pedido.png`,
`evidencias/talkback-2026-11-18/novo-pedido.xml`,
`evidencias/talkback-2026-11-18/talkback-tts.txt`.

## 3. O que foi verificado

### 3.1 Home (`mobile/index.html`)

- **Estado em palavra, não só cor:** “● com internet” e “Sem conexão com o
  sistema (sem conexão). Os pedidos continuam na fila…” são texto; a fila
  mostra “aguardando envio (4 tentativas)”.
- **Contagem da fila:** “Fila de envio (1)” é texto no `h2`; o `span#conta-fila`
  é `aria-live="polite"` (adição desta rodada).
- **Botões com nome:** “Parear de novo”, “Desconectar este aparelho”,
  “Descartar”, “Baixar catálogo agora”, “Novo pedido offline”, “Abrir o
  sistema”, “Enviar agora”. O link “Novo pedido offline” aparece como
  `content-desc` na árvore.

### 3.2 Novo pedido (`mobile/novo-pedido.html`)

Antes desta rodada, a árvore de acessibilidade expunha os inputs apenas pelo
**placeholder**:

```text
EditText text="" desc="" hint="Digite o nome…"
EditText text="" desc="" hint="Digite o produto…"
EditText text="" desc="" hint="Ex.: entregar após as 14h"
```

Isso lia o exemplo, não o campo. Corrigido com `aria-label` e reconstruído o
APK; a árvore passou a expor:

```text
EditText hint="Buscar cliente Digite o nome…"
EditText hint="Buscar produto Digite o produto…"
EditText hint="Observação (opcional) Ex.: entregar após as 14h"
```

- “nenhum cliente escolhido” e “Total: R$ 0,00” agora são `role="status"`;
  quando mudam, são regiões vivas.
- “Salvar na fila” é botão com texto.
- O total e o estado provisório (`OFF-0003`) aparecem em texto.

### 3.3 Fila

“Fila de envio (1)” está em texto; o pedido mostra “R$ 49,90 · aguardando envio
(2 tentativas)” e o botão “Descartar”. A contagem é uma região viva
(`aria-live="polite"`), então uma mudança de N é anunciada sem o foco sair do
lugar.

## 4. O que continua `[!]` — e por quê

1. **A fala exata não é recuperável pelo logcat.** O log prova que o TalkBack
   sintetizou (`GoogleTTSServiceImpl: Synthesis request`, `SpeechController` e
   foco de áudio), mas o serviço não grava o texto da utterance no log. A prova
   do **conteúdo** é a árvore de acessibilidade (`uiautomator`), que é a fonte
   que o TalkBack lê; a prova da **síntese** é o TTS.
2. **Voz em pt-BR — configuração provada, áudio não.** Com `adb root` (o
   `setprop` sem root falhou com `Failed to set property ... See dmesg`), o AVD
   passou a `persist.sys.locale=pt-BR` e `system_locales=pt-BR`; o TalkBack
   ficou `Bound services:{TalkBack}` e as janelas reportam `locales=[pt_BR]`.
   `tts_default_synth=com.google.android.tts` e
   `tts_default_locale=pt-BR` foram gravados. **Limite declarado:** o AVD foi
   iniciado com `-no-audio`, então não há prova acústica; `ro.product.locale`
   continua `en-US` (propriedade read-only do sistema). A pronúncia falada só
   pode ser julgada com áudio.
3. **Anúncio dinâmico da contagem não foi capturado em áudio.** A região viva
   está no DOM e o TalkBack está ativo; falta uma captura de fala (ou TTS log
   com texto) de uma mudança de fila.
4. **Navegação por gestos do TalkBack** (swipe direita/esquerda, double-tap)
   não foi percorrida de ponta a ponta; a verificação usou foco por teclado,
   toques e dumps. A ordem de foco dos cards não foi medida.
5. **Emulador sem áudio** (`-no-audio`): não há gravação de voz; a prova é
   log + árvore.

## 5. Correções desta rodada (só acessibilidade/estado)

| Arquivo | Mudança |
| --- | --- |
| `mobile/novo-pedido.html` | `aria-label` em “Buscar cliente”, “Buscar produto” e “Observação (opcional)”; `role="status"` no cliente escolhido e no total |
| `mobile/index.html` | `aria-live="polite"`/`aria-atomic` na contagem da fila |
| `tests/unit/mobile-acessibilidade.test.ts` | gate: todo input visível tem nome; contagem é viva; estados são status; toda ação tem texto |

**Prova:** `pnpm exec vitest run tests/unit/mobile-acessibilidade.test.ts` — 4
verdes; APK reconstruído, instalado e a árvore pós-instalação mostra os hints
com o nome do campo.

## 6. O que NÃO foi tocado

- Regra de negócio do pedido offline, catálogo, fila e sincronização.
- Backend, APIs, RLS, fiscal/financeiro.
- TalkBack/TTS do sistema (configuração do AVD, não do produto).
- Nenhum deploy; nenhuma chamada a produção.
