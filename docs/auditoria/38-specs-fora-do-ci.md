# 38 — As specs que não rodam em job nenhum: matriz e veredito

> **Pergunta desta matriz:** das specs de E2E fora do `e2e.yml`, **qual roda em algum
> lugar, qual não roda em lugar nenhum, e o que falta para cada uma virar gate?**
> Medido em 19/11/2026 no branch `fix/cidades-ibge` @ `4592ea4d` (que contém
> `nexus/main` @ `4c7cd633`, a tag `v1.58.0`, mais a correção do filtro de cidade), com
> Supabase local `127.0.0.1:54321`, app de produção em `localhost:3001` e o
> fixture `e2e-admin@nexus.test` / `E2E!Test1234`.
>
> **Nada aqui aponta para produção.** WAHA, Redis e Resend não estão no ar neste
> ambiente — é por isso que uma das specs não pode ser medida aqui, e isso está dito.

## 1. O número real

`FORA_DO_CI` no `.github/workflows/e2e.yml` tem **quatro** entradas. Uma delas
(`mobile-offline`) **roda**, em outro workflow. Sobram **três** specs que não são
executadas por job nenhum:

```console
$ ls tests/e2e/*.spec.ts | wc -l
103
$ sed -n '/^      FORA_DO_CI: >-/,/^    steps:/p' .github/workflows/e2e.yml | grep -c '\.spec\.ts'
4
$ grep -n 'playwright.mobile.config.ts' .github/workflows/apk.yml
78:          pnpm exec playwright test -c playwright.mobile.config.ts --reporter=line
```

| Spec | Está em | Roda em |
|---|---|---|
| `vps-fresh-onboarding.spec.ts` | `FORA_DO_CI` | **lugar nenhum** |
| `inbox-tempo-real.spec.ts` | `FORA_DO_CI` | **lugar nenhum** |
| `visual-snapshots.spec.ts` | `FORA_DO_CI` | **lugar nenhum** |
| `mobile-offline.spec.ts` | `FORA_DO_CI` | job `apk-debug` (`apk.yml`), Pixel 7 |

O `AGENTS.md` ainda afirma "2 das 90 specs E2E seguem fora do CI" e cita só as duas
primeiras. A frase envelheceu em dois eixos: o total (103) e a terceira spec. Esta
matriz é a correção do segundo eixo; o número do total continua sendo o comando,
não a prosa.

## 2. Matriz

| Spec | Testes | O que prova | Por que está fora | Roda hoje? | Veredito |
|---|---:|---|---|---|---|
| `vps-fresh-onboarding` | 12 | J1.1–J1.13: bootstrap do dono, wizard, WAHA/QR, convite sem Resend, MFA, pular WhatsApp | Exige banco **fresco** do `baseline.sql`, dono criado por `scripts/bootstrap-owner.ts`, **WAHA** com QR real e **Redis** | **não** — só num stack dedicado | **JOB PRÓPRIO** (`vps-install`), não no `e2e.yml` de PR |
| `inbox-tempo-real` | 1 | mensagem chega ao inbox **sem F5**, por fora do browser | (a) não discrimina o conserto — passa com e sem a correção do token; (b) reprovou duas vezes o mesmo sha de PR que não toca inbox (issue #347) | **sim** — 1/1 em 28 s, medido nesta rodada | **MANTER FORA** até a #347; a cerca que discrimina é unitária |
| `visual-snapshots` | 14 | faixa superior de login + 4 telas, desktop escuro/claro e celular, com baseline versionado | baselines têm sufixo de plataforma (`…-darwin.png`, 1% de tolerância); o runner do CI é ubuntu | **sim** — 14/14 em 5,4 min, medido nesta rodada | **INCORPORAR** com runner fixo (container oficial do Playwright) |

## 3. Veredito por spec

### 3.1 `vps-fresh-onboarding` — JOB PRÓPRIO

O que a spec exige está no cabeçalho dela e foi reconfirmado no código:

- banco **zerado** do `baseline.sql`, com o primeiro usuário criado por
  `scripts/bootstrap-owner.ts` — a mesma sequência do `install.sh`;
- `WAHA_API_BASE_URL`/`WAHA_API_KEY` com sessão de verdade (J1.5 espera o `<img>`
  do QR com `naturalWidth > 0`, timeout de 60 s);
- Redis local;
- `RESEND_API_KEY` **vazio de propósito** (é a realidade do primeiro deploy e o
  que prova J1.8: a UI não pode mentir que enviou convite).

Rodá-la no `e2e.yml` atual seria pior que não rodar: o banco do job já foi semeado
por dezenas de specs, o `beforeAll` derrubaria o `onboarding_state` da organização
compartilhada (**quebrando as specs seguintes**, que dependem dela onboardada) e
J1.5 falharia ou ficaria pendurada esperando um QR que não existe. **Não é uma
spec que "só precisa de mais timeout"** — ela precisa de outro ambiente.

**O que falta para virar gate:** um job `vps-install` no `e2e.yml` (ou workflow
próprio) com:

1. **instância Supabase própria** (porta/volume separados do job `e2e`), aplicando
   `baseline.sql` em modo install — não a cadeia de migrations;
2. serviço **WAHA Core** com healthcheck (o QR não é recurso Plus; o `HANDOFF-vps-qa`
   já rodou J1 inteira com WAHA Core local em 20/07/2026, 11/11);
3. serviço **Redis**;
4. `RESEND_API_KEY=""`;
5. `pnpm exec playwright test tests/e2e/vps-fresh-onboarding.spec.ts`.

Custo estimado: 10–15 min de job. **Recomendação:** `schedule` noturno primeiro;
promover a obrigatório quando tiver 10 execuções sem flake. Enquanto não existir,
a jornada que o produto **vende** (instalação fresca) continua sem gate — e o
release checklist precisa carregar o runbook `docs/testing/HANDOFF-vps-qa.md` como
item explícito, com evidência anexada.

### 3.2 `inbox-tempo-real` — MANTER FORA (até a #347)

A própria spec documenta duas medições que a desqualificam como gate de merge:

- **não discrimina**: com o conserto de `lib/supabase/browser.ts` → 1 passed;
  revertendo só o conserto → **1 passed também**. O `refetchOnWindowFocus` da tela
  oferece um segundo caminho até a mesma mensagem;
- **reprova por moeda**: #327 pass, #343 pass, #344 FAIL, rerun do **mesmo sha**
  FAIL — e o #344 não toca inbox, realtime nem socket.

Nesta rodada ela rodou local e passou (1/1, 28 s, com o seed da fila e
`e2e-chega-mensagem.ts`). Isso confirma que o caminho de ponta a ponta **funciona**;
não muda o veredito, porque o defeito medido é de **determinismo e discriminação**,
não de produto.

**Condição de saída (issue #347):** um caminho só até a mensagem durante a asserção
(desligar o `refetchOnWindowFocus` no teste) **e** a matriz de sabotagem ficando
vermelha sem o conserto. Até lá, o gate que discrimina é
`tests/unit/realtime-token-do-socket.test.ts` (reprova 6 de 7 casos quando a
callback some) — e a spec de navegador continua sendo a cerca local contra o
sintoma relatado. **Não resolvê-la com `retries`.**

### 3.3 `visual-snapshots` — INCORPORAR com runner fixo

Medido nesta rodada, `next build` de produção no HEAD atual, macOS/darwin:

```console
$ AUTH_RATE_LIMIT_LOGIN_IP=1000 pnpm exec playwright test --workers=1 \
    --reporter=line tests/e2e/visual-snapshots.spec.ts
  14 passed (5.4m)
```

Os 14 baselines (`tests/e2e/visual-snapshots.spec.ts-snapshots/*-darwin.png`) batem
no ambiente em que foram gerados. O motivo declarado em `FORA_DO_CI` é honesto:
baseline de pixel é **por plataforma**; rodar o job ubuntu sem baselines linux
reprovaria por fonte/antialiasing, não por regressão — e ensinaria o time a rodar
`--update-snapshots` sem olhar, que é pior que não ter gate.

**O que falta para virar gate:** fixar o runner e gerar o baseline **nele**:

1. job `visual` com a imagem oficial `mcr.microsoft.com/playwright:v<versão do
   package.json>-noble` (a mesma versão do `@playwright/test`, não `latest`);
2. `--update-snapshots` **uma vez**, dentro do container, com revisão humana das
   14 imagens no PR (o cabeçalho da spec já manda revisar antes de commitar);
3. rodar o job no `schedule` por duas semanas; depois promover a obrigatório.

Alternativa recusada: manter dois conjuntos de baselines (darwin + linux). Dobra o
artefato e transforma divergência de plataforma em manutenção — o container é uma
plataforma só, que é o que um gate precisa.

## 4. O que esta matriz não prova

- **Nada foi medido em produção** nem em VPS; os números de `vps-fresh-onboarding`
  são pré-condição lida do código, não execução.
- `inbox-tempo-real` passou **uma** vez nesta rodada; uma passagem não refuta a
  flakiness medida no CI. O veredito vem da medição de discriminação (com/sem
  conserto) documentada na spec, não desta execução.
- `visual-snapshots` passou no macOS; **não** prova que passaria no ubuntu. É
  exatamente por isso que o veredito é "incorporar **com runner fixo**", e não
  "já pode entrar no `e2e.yml`".
- O job `apk-debug` não foi executado nesta rodada: `mobile-offline` está correta
  na matriz por configuração (`apk.yml` o invoca), não por medição local.

## 5. Evidências

| Medição | Comando | Resultado |
|---|---|---|
| specs no disco | `ls tests/e2e/*.spec.ts \| wc -l` | 103 |
| entradas em `FORA_DO_CI` | parser de bloco do workflow | 4 |
| `mobile-offline` roda | `grep playwright.mobile apk.yml` | job `apk-debug` |
| snapshots visuais | `playwright test tests/e2e/visual-snapshots.spec.ts` | **14 passed** (5,4 min) |
| inbox tempo real | `playwright test tests/e2e/inbox-tempo-real.spec.ts` | **1 passed** (28 s) |

Logs locais: `/tmp/visual-local.txt`, `/tmp/inbox-local.txt` (não versionados —
o que fica é o comando e o número).
