# 43 — Sentry fora do first load (primeira etapa do #602)

**Data:** 19/11/2026 · **Base:** `nexus/main` pós-1.59.0 · **Método:** o mesmo do
doc 42 — build de produção **uma vez** (`pnpm e2e:build`, Turbopack, Next
16.4.6), `.next/diagnostics/route-bundle-stats.json`, gzip nível 9 por chunk.
Medição local; não é produção.

## Resultado

| Rota | Antes (gz) | Depois (gz) | Δ |
|---|---:|---:|---:|
| `/app/inbox` | **592 KB** | **503 KB** | **−89 KB (−15%)** |
| `/app/notas` | 547 KB | 458 KB | −89 KB |
| `/app/pedidos` | 524 KB | 435 KB | −89 KB |
| `/app/fiscal` | 512 KB | 423 KB | −89 KB |
| `/app/financeiro` | 499 KB | 410 KB | −89 KB |
| `/app/sentinel` | 495 KB | 406 KB | −89 KB |
| `/login` | 318 KB | **228 KB** | **−90 KB (−28%)** |
| base compartilhada (6 rotas) | 472 KB | **383 KB** | **−89 KB (−19%)** |

**Nada regrediu:** todas as seis rotas e o login caíram; nenhuma subiu. O ganho
é uniforme porque o SDK estava na casca compartilhada.

**Alvo do #602:** inbox ≤ **400 KB gz**. Medido: **503 KB**. **Faltam 103 KB**
para a primeira etapa — o ganho foi entregue e a distância está registrada.

## O que mudou

1. **SDK fora do grafo estático.** `instrumentation-client.ts` não importa mais
   `@sentry/nextjs`; ele só instala listeners síncronos de `error` e
   `unhandledrejection` (`lib/sentry/fila.ts`). O `SentryLazy` (client component
   sem DOM no layout raiz) faz `import("@/lib/sentry/cliente")` no `useEffect`,
   inicializa o SDK e entrega a fila.
2. **Boundaries de erro deixaram de importar o SDK estaticamente.**
   `app/global-error.tsx` e `components/feedback/SegmentError.tsx` fazem
   `import("@sentry/nextjs")` **dentro do `useEffect`**, só quando a tela de erro
   aparece. Eles entram no grafo de toda rota; era o segundo caminho estático.
3. **`onRouterTransitionStart` foi removido.** `tracesSampleRate` é 0, então não
   existe span de navegação a gravar; erro de navegação continua coberto pela
   fila e pelo `onRequestError` do servidor.
4. **`replayIntegration` continua ligado, mas no chunk lazy.** O produto usa
   replay-no-erro (`replaysOnErrorSampleRate: 1.0`); desligar seria perder
   diagnóstico. Como o SDK inteiro é lazy, o Replay não pesa no first load.
5. **`date-fns`:** `lib/i18n/datas.ts` passou a importar
   `date-fns/locale/pt-BR` em vez do barrel `date-fns/locale`. **Delta medido:
   0 KB** — o barrel já era tree-shaken. A mudança fica como guarda contra
   regressão, não como ganho.

## Correção de método do doc 42

O doc 42 atribuiu **164 KB gz** ao Sentry somando o chunk de 151 KB + 13 KB. O
before/after mostra que o custo **atribuível ao SDK** é **~89 KB gz**: o chunk de
151 KB também carregava o bootstrap do Next, que continua no first load (agora
num chunk de 73 KB identificado por `_sentryRouteManifest`, mas sem
`captureException`/`replayIntegration`). A conclusão do doc 42 — Sentry era o
maior ofensor — continua válida; o número era um teto, não o custo do SDK.

## Onde estão os 103 KB que faltam

| Ofensor restante | Gzip | Observação |
|---|---:|---|
| bootstrap do Next + manifesto de rotas do Sentry | 73 KB | não é o SDK; o manifesto pode sair com `routeManifestInjection: false` (ganho pequeno, perde nome parametrizado no Sentry) |
| cliente Supabase | 61 KB | sessão/auth no browser; lazy é decisão de arquitetura, não desta fatia |
| casca (sidebar, command palette etc.) | 35 KB | componentes do produto |
| `date-fns` no inbox | 33 KB | funções + locale; trocar por `Intl` muda texto de data |
| `zod` em 4/6 rotas | 31 KB | validação de formulário no cliente |
| gravador de áudio do inbox | 27 KB | `AudioRecorder` estático no `Composer`; lazy sob clique é o próximo candidato barato |

**Próximo passo sugerido (não feito):** lazy do `AudioRecorder` (−27 KB →
476 KB) e troca de `date-fns` por `Intl` no inbox (−33 KB → 443 KB). Ainda não
fecha 400; fechar exige mexer em `zod`/Supabase ou aceitar o alvo revisado.

## Prova de que a captura de erro não sumiu

- `instrumentation-client.ts` roda antes da hidratação e guarda a janela.
- `SentryLazy` inicializa, **desliga os listeners temporários** e entrega a fila
  com `captureException`; nenhum erro da janela é descartado e não há captura
  dupla.
- `components/app/SentryLazy.test.tsx`: 2 casos (fila de erro + rejeição é
  entregue; chunk indisponível não quebra e limpa a fila).
- `lib/api/wrappers.test.ts` segue verde (5xx observável).
- `typecheck` e eslint zerados; build de produção verde.

## Limitações

Medição local, uma máquina, sem LCP/INP/TBT; o número é first load de JS, não
experiência de campo. O chunk lazy do Sentry ainda é baixado logo após a
hidratação; o que mudou é que ele não bloqueia mais o first load.
