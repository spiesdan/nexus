# AGENTS.md — Nexus

> Contrato para **qualquer** agente de código (Codex, Cursor, Copilot, Amp, Claude Code).
> Este arquivo é o núcleo portável. A **doutrina completa e não-negociável vive em
> [`CLAUDE.md`](CLAUDE.md)** — leia-o antes de tocar em código. Aqui está o mínimo
> para não causar dano.

---

## Remotes — onde commitar (REGRA PERMANENTE)

O repositório canônico deste projeto é **`spiesdan/nexus`**
(`https://github.com/spiesdan/nexus`) — e ele é o **único remote**: repo a
parte, sem fork (decisão do usuário em 2026-09-27, §101 do spec — o repo no
GitHub já nasceu `fork: false`).

- `nexus` → o único remote. **Todo commit, push e PR vai para ele. Sempre.**
  Sem exceção, sem perguntar de novo.

Os remotes `origin` (`melgarafael/DeskcommCRM`, upstream histórico) e `fork`
(`spiesdan/DeskcommCRM`, espelho legado) foram **removidos** em 2026-09-27.
Antes disso as tags da NOSSA linhagem (v1.0.0–v1.14.0, `arquivo/*`,
`nexus-v1-archive`) foram migradas para o `nexus`, então o comando de versão
abaixo não precisa do origin. Se um doc/commit antigo citar `origin/main`,
leia `nexus/main` — os registros históricos em `docs/handoffs/`/`docs/audits/`
mantêm a citação de origem porque descrevem o que foi medido na época.

Antes de `push`/`pr create`, confira com `git remote -v` (só `nexus`) e
`git status -sb` (upstream precisa ser `nexus/...`). Errou o remoto? Não
conserte com push duplo — apague a ref errada e refaça no `nexus`.

## Objetivo do projeto

Sistema operacional de vendas com agentes de IA nativos, multi-nicho,
WhatsApp como canal primário (via WAHA). Multi-tenant com RLS desde o dia 1, LGPD
nativa. Monetização = self-host em VPS, não assinatura. Posicionamento: [`VISION.md`](VISION.md).

**Consequência que muda como você trabalha:** o produto é distribuído como código.
Quem instala numa VPS **é** o usuário. Uma mudança que funciona na máquina do dev e
quebra no clone fresco é um bug de produto, não um detalhe de ambiente.

## Stack (CONFIRMADO em `package.json`)

Next.js 16 (App Router) · React 19 · TypeScript 6 estrito · Tailwind 4 ·
shadcn/ui · Supabase (Postgres + Auth + Realtime + Storage) · Upstash Redis ·
Vercel AI Gateway (`@ai-sdk/anthropic|openai|google`) · WAHA Plus (engine NOWEB) ·
Zod 4 · Vitest 4 · Playwright 1 · Sentry 10.

Só a **major**, de propósito: é onde o idioma muda, e é o que
`tests/unit/agents-md-versoes.test.ts` verifica contra o `package.json`. Declarar a minor
aqui fazia todo bump do Dependabot reprovar o `verify` (5 dos 8 pacotes) e não cobria nada
que a major já não cobrisse — issue #235. Para a versão exata, `package.json` é a fonte.

Runtime: **Node ≥22** (`.nvmrc` = 22; os quatro workflows fixam `node-version: 22` —
`ci` ×2, `perf`, `e2e`). Gerenciador: **pnpm 9.15.9** (`packageManager`).
Versão do produto: **não está escrita aqui, de propósito.** Esta linha afirmava `1.0.0` até a
v1.6.0 — seis minors de atraso, e nenhum teste a vigiava. Afirmação de versão envelhece a cada
release; comando não. A que está publicada agora:

```bash
git ls-remote --tags --refs nexus 'refs/tags/v*' \
  | sed 's#.*refs/tags/v##' | awk '!/-/' | sort -V | tail -1   # awk, nao grep -v -- '-':
                                                                # em maquina com ugrep aquele nao roda
```

(Em 2026-09-27 o remote `origin` saiu de cena — §101: repo a parte, sem
fork — e as tags da nossa linhagem (v1.0.0–v1.14.0) migraram para o
`nexus`, então este comando não perde nada. As 52 tags da linhagem PARALELA
do upstream (`melgarafael/DeskcommCRM`, v1.15.0–v1.56.0 — 4.582 commits
fora do nosso histórico) foram trazidas junto e **removidas no mesmo dia,
por decisão do usuário**: manter faria este comando responder `1.56.0`
(código alheio ao nosso CHANGELOG) e faria o agente de atualização da VPS
oferecer a linhagem upstream por cima da instalação. Elas continuam no
`melgarafael/DeskcommCRM` para consulta. Nenhuma tag v2 existe ainda: a
NEXUS 2.0 ainda não publicou release.)

O `package.json` **não** é a fonte da versão do produto (segue em `0.1.0`, e é assim de
propósito). A fonte é a tag `v*` mais a seção do `CHANGELOG.md` — que é tela de produto, lida
pelo dono da VPS. Como o número é decidido: [`docs/doctrine/versionamento.md`](docs/doctrine/versionamento.md).

## Estrutura que importa

| Path | O quê |
|---|---|
| `app/api/v1/` | route handlers REST (versionado por path). Conte em vez de citar: `find app/api/v1 -name route.ts \| wc -l` (**421** em 2026-11-18) e `find app/api -name route.ts \| wc -l` (**424**). A linha anterior dizia "166 … 169", errada por ~2,5× |
| `app/api/internal/`, `app/api/mcp/`, `app/api/v1/cron/` | superfícies não-cookie (secret/bearer próprio) |
| `app/app/` | UI autenticada do tenant · `app/admin/` UI de plataforma |
| `app/actions/` | Server Actions (auth, onboarding, team, settings) |
| `lib/agent-engine/`, `lib/ai/` | runtime do agente, guardrails, RAG, dispatcher |
| `lib/api/wrappers.ts` | `ok()` / `fail()` — **use sempre**, não monte Response na mão |
| `lib/auth/require-role.ts` | `requireRole()` — guard canônico de RBAC |
| `lib/supabase/{browser,server,admin}.ts` | clients canônicos |
| `workers/` | workers de `event_log` + crons |
| `supabase/migrations/` | schema versionado · `supabase/baseline.sql` = o que o self-host aplica |
| `proxy.ts` | middleware do Next 16 (auth de borda, `X-Request-Id`) |

## Comandos (CONFIRMADO em `package.json`)

```bash
pnpm install          # deps (frozen-lockfile no CI)
pnpm dev              # dev server
pnpm build            # next build
pnpm lint             # eslint
pnpm typecheck        # tsc --noEmit (estrito)
pnpm test:unit        # vitest — EXCLUI tests/invariants e tests/e2e
pnpm test:db          # invariantes de banco + gate do baseline (PRECISA de Docker)
pnpm test:e2e         # Playwright (PRECISA de app rodando + banco semeado)
pnpm test:e2e:smoke   # só a suíte smoke — o que o CI roda em PR (tests/e2e/suites/smoke.txt)
pnpm test:e2e:critical  # a suíte critical — o que o CI roda na main (critical.txt)
pnpm test:e2e:full    # o conjunto completo (full.txt)
pnpm gov:verify       # typecheck + lint + test:unit  ← verificação única atual
```

⚠️ **`pnpm gov:verify` NÃO cobre tudo.** Ele omite `test:db` e `test:e2e`. Se sua
mudança toca schema, RLS ou UI, `gov:verify` verde **não** é prova — rode `pnpm test:db`
(exige Docker) e/ou `pnpm test:e2e` você mesmo. Ver [`docs/harness-audit.md`](docs/harness-audit.md).

**O que o CI cobre.** `.github/workflows/ci.yml`: `verify` = typecheck + lint + test:unit;
`invariants` = `pnpm test:db` (isolamento RLS + invariantes de governança contra Postgres
efêmero pg15). `.github/workflows/perf.yml`: `build-and-size` = `pnpm build`.
`.github/workflows/e2e.yml` roda as specs Playwright contra um Supabase local de
verdade com o `baseline.sql` aplicado — o mesmo banco que o self-hoster tem —, **exceto as
declaradas em `FORA_DO_CI`** (o workflow é a fonte; não cite o total). **É check
obrigatório desde 2026-08-08.** A suíte de cada evento é escolhida pelo env `SUITE` do job:
`pull_request` = **smoke**, `push` na main = **critical**, `schedule` noturno e
`workflow_dispatch` = **full** (em duas invocações). Ou seja, **`e2e` verde em PR
prova o smoke, não a suíte inteira** — a hierarquia smoke ⊆ critical ⊆ full e a fidelidade
do full às listas `SPECS_PARTE_*` são cobradas por `tests/unit/e2e-suices-aderentes.test.ts`.
As de fora hoje estão em `FORA_DO_CI` com o motivo escrito ao lado: `vps-fresh-onboarding`
(WAHA + Redis + Resend + Nuvemshop; é a P0 da doutrina de QA), `inbox-tempo-real` (o caso com
chave precisa de
conta Google de teste com consentimento pré-aprovado; sem ela o job pendura no login — motivo
medido no bloco `FORA_DO_CI`) — ou seja, `e2e` verde não prova a jornada de
instalação fresca. `followup-journey`, `webhooks` e `capacidades-do-agente` estiveram fora e
**voltaram**: rodam hoje (`e2e.yml`, listas `SPECS_PARTE_1`/`SPECS_PARTE_2`).

`.github/workflows/publish-image.yml`: `imagens-ok` = as três imagens Docker constroem. **Obrigatório
desde 2026-08-13.**

**A proteção da `main` se MEDE, não se lembra.** Ela não está no repositório: não viaja
com `git push`, não aparece em PR e não é copiada quando se cria o repo — vive na configuração
do GitHub daquele repositório. Este bloco afirma o estado de lá, então a única forma honesta de
escrevê-lo é com o comando que responde:

```bash
gh api repos/spiesdan/nexus/branches/main/protection \
  --jq '{checks: .required_status_checks.contexts, pr: (.required_pull_request_reviews != null), admins: .enforce_admins.enabled}'
```

Em **2026-11-26**, depois de aferir que o repo `spiesdan/nexus` (criado em 22/09/2026) estava
com `protected: false` e **zero** checks exigidos:

```console
$ gh api repos/spiesdan/nexus/branches/main/protection --jq '.required_status_checks.contexts|join(", ")'
verify, invariants, e2e, build-and-size, imagens-ok, fragmento
```

Com PR obrigatório (0 aprovações — o dono trabalha sozinho), force-push proibido e
`enforce_admins: true`, para que a régua valha também para quem tem o token do dono. Prova:
`git push origin HEAD:main` de um clone novo devolve
`protected branch hook declined — 6 of 6 required status checks are expected`.

> O bloco anterior dizia "os cinco são checks obrigatórios, medido em 14/08/2026" — e era
> **falso desde 22/09/2026**: a proteção mora no GitHub, o repo nasceu depois da medição e não
> herdou nada. Três releases falharam DEPOIS do merge por fragmento ausente, porque nada
> segurava o merge. Se este parágrafo um dia envelhecer, o conserto é rodar o comando acima —
> nunca reescrever o texto de memória.

## Padrões de código (observados no repo, não inventados)

- **Route handler:** valida input com Zod → guard (`requireRole` / `requirePlatformAdmin` /
  secret) → query com `organization_id` explícito → `audit()` se mutação → `ok()` / `fail()`.
- Erro: `fail(code, message, status)` com código de `lib/api/errors.ts`. Nunca `throw` cru na borda.
- JSON **snake_case** na API. Dinheiro em `_cents` + `currency`. Datas ISO-8601 UTC.
- Log: `lib/logger.ts` (estruturado). **`console.log` é proibido** em código merged.
- Testes ao lado do código (`lib/foo/bar.test.ts`) ou em `tests/{unit,api,invariants,e2e}/`.
- Comentários em PT-BR são a norma neste repo — mantenha o idioma do arquivo que editar.

### Marca própria (white-label) — o produto é revendido, e o nome não é seu

- **Nunca escreva o nome do produto nem o de um revendedor em código que alcança o usuário.** A marca resolve do banco; `tests/unit/branding.test.ts` vigia a reintrodução do nome legado e a allowlist **só encolhe**.
- A marca resolve do **banco** (`platform_branding` para a instalação, `organizations.settings.branding` para a organização). `APP_NAME`/`APP_LOGO_URL`/`APP_ACCENT_HEX` no `.env` são **semente e piso de rollback**, não a fonte.
- Precisa da marca **fora do DOM** (e-mail, remetente, ícone, `issuer` do MFA)? Use `marcaDaSaida()` de `lib/branding/saida.ts` — um hex e uma frente legível, tema claro. Nunca entregue `MarcaResolvida` a um template de e-mail.
- Resolvedor de marca **nunca lança**: ele roda em `app/layout.tsx`, e um throw ali é 500 em todas as telas.
- **O PDF de LGPD não leva marca** — ele nomeia o controlador (`organizations.legal_name`) e o DPO. Isso é decisão, não omissão; há gate no mapa de arquitetura.
- Contexto de venda em `docs/white-label.md`; mapa em `docs/architecture/marca-propria.architecture.json`.

## Diretórios e arquivos SENSÍVEIS

- **`supabase/baseline.sql`** — é o que o `install.sh`/`update.sh` do self-host aplicam.
  Toda mudança de schema tem que aparecer aqui **como apêndice idempotente**, senão
  não chega em quem instalou. Ver doutrina de Migrations em `CLAUDE.md`.
- **`supabase/migrations/*.sql` já aplicadas** — nunca edite. Corrija com migration nova.
- **`lib/supabase/admin.ts`** — service role **bypassa RLS**. Quase todos os handlers o usam — conte,
  não cite (o comando está em §Limitações conhecidas); toda
  query precisa filtrar `organization_id` manualmente, resolvido de fonte confiável
  (cookie/JWT/webhook secret/path token), **nunca do body**.
- **`lib/auth/public-paths.ts`** — adicionar path aqui remove a checagem de auth de borda.
  Só com guard próprio dentro da rota.
- **`.env*`** — não abra, não copie valor, não logue. Só `.env.example` é template.
- **`docker-compose.traefik.yml`** — numa VPS que já tem proxy reverso próprio
  (Hostinger, Coolify, Dokploy…), é o único lugar que dá ao contêiner `app` as labels
  de roteamento. Todo `up -d` leva os **dois** arquivos de compose:
  `docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml --env-file .env up -d app`.
  Esquecer o segundo `-f` recria o contêiner sem labels: o proxy deixa de enxergá-lo e o
  domínio inteiro responde `404`, com o contêiner `healthy` — o healthcheck é um probe TCP
  interno e não sabe nada de roteamento. Runbook: `docs/runbooks/deploy.md`.

## Arquivos GERADOS — não editar à mão

- `lib/database.types.ts` (6.1k linhas — gerado do schema Supabase)
- `graphify-out/` (grafo de conhecimento; regenerado por `/graphify .`)
- `pnpm-lock.yaml`, `tsconfig.tsbuildinfo`, `next-env.d.ts`, `.next/`

## Como validar uma alteração

1. `pnpm typecheck` e `pnpm lint` zerados.
2. `pnpm test:unit` verde.
3. Tocou schema/RLS/tabela tenant-aware → `pnpm test:db` (sobe Postgres efêmero via Docker,
   aplica `baseline.sql` em modo install **e** update, roda os invariantes).
4. Tocou UI ou fluxo de usuário → `pnpm test:e2e` com evidência visual. **`curl` não conta**
   como prova de UX (doutrina de QA Visual em `CLAUDE.md`).
5. Mudou schema → migration versionada em `supabase/migrations/` **+** apêndice idempotente
   em `supabase/baseline.sql` **+** linha em `supabase/migrations/MANIFEST.md`. Os três juntos.
6. Criou função em `public` → `revoke execute on function ... from public, anon;` e depois
   `grant` só a quem precisa. São **duas** origens de `EXECUTE` e revogar uma só deixa a
   função exposta como RPC alcançável pela anon key. Detalhe em `CLAUDE.md`, item 9 da
   doutrina de Migrations.

### CI vermelho no SETUP — leia o step antes de reexecutar

Job `e2e`/`e2e-pos-deploy` vermelho tem dois significados: se parou num step de
**setup** ("Instalar o browser", "Subir Supabase local", "Build"), a suíte **não
rodou** e o problema é infraestrutura; se parou em **"E2E — a suíte do evento"**,
é teste reprovado e é código.

Em 2026-11-11 o `e2e` ficou vermelho em 5 execuções seguidas porque o apt do
runner não resolvia `azure.archive.ubuntu.com` no `playwright install-deps`
(`exit 100`), e nenhum teste rodou. **Não reexecute no escuro**: nomeie o step e a
linha de erro com `gh run view <run> --log-failed`. A instalação de browser hoje
mora em `scripts/ci/instalar-chromium.sh` (dry-run offline → retry → prova que o
Chromium abre → reprova listando libs faltando), com teste em
`tests/shell/instalar-chromium.test.sh` dentro de `pnpm test:shell`. Lei completa:
`CLAUDE.md` § "O `e2e` vermelho no SETUP".



Medido em 2026-11-18 @ `232c5fbf`. **Os números saíram de propósito** — conte, não cite:

- Arquivos de teste unitário em `tests/unit/`: `git ls-files 'tests/unit/*.test.ts' 'tests/unit/*.test.tsx' | wc -l`. O total do repo: `git ls-files '*.test.ts' '*.test.tsx' | wc -l` — a diferença vive junto ao código, fora de `tests/`, e também roda em `test:unit`.
- Arquivos de invariante de banco em `tests/invariants/` — RLS/isolamento cross-tenant, RBAC,
  governança (G1–G6). Excluídos do `test:unit` de propósito; rodam via `pnpm test:db` **e no job
  `invariants` do CI**. Quantos: `git ls-files 'tests/invariants/*.test.ts' | wc -l`.
- Specs Playwright em `tests/e2e/`: `ls tests/e2e/*.spec.ts | wc -l`. Quais ficam fora do CI:
  os nomes em `FORA_DO_CI`, dentro de `.github/workflows/e2e.yml`, cada um com o motivo escrito.

> **Os números saíram daqui de propósito.** Estavam em 102 e 46/45 quando o
> medido era 114 e 51/50, e voltaram a envelhecer (hoje o comando acima mede 685 e 1.225) —
> nenhum gate lê prosa. Onde a afirmação pode virar comando, ela vira: comando não envelhece.
> O que continua vigiado por gate é o que importa — `tests/unit/e2e-cobertura-completa.test.ts`
> reprova toda spec nova que não esteja em `SPECS_PARTE_*` ou em `FORA_DO_CI` com motivo escrito.

## Limitações conhecidas (estado em 2026-07-29, contra `origin/main` @ 789dfa6)

- **As specs de `FORA_DO_CI` seguem fora do CI** (hoje `vps-fresh-onboarding`,
  `inbox-tempo-real` e `mobile-offline`; a lista e o motivo moram no workflow), e o
  `e2e` **é** check
  obrigatório desde 2026-08-08. Ou seja: um PR que quebre o `e2e` não entra — mas a jornada de
  instalação fresca, que é o produto que se vende, continua sem gate. Se você mexeu nela, a
  prova é sua. *(Corrigido em 2026-08-14; a redação anterior — "4 das 32, não-obrigatório" —
  mudava a régua de qualquer triagem que a lesse. Recontado em 2026-11-18, sem número: a lista
  é do workflow.)*
- Rate limit HTTP: `lib/auth/rate-limit.ts` cobre **login, signup, recuperação de senha e
  aceite de convite** (contando por IP **e** por identificador hasheado); `checkRateLimit` cobre
  o webhook de captação e o dispatcher de IA. **Crons e MCP seguem sem.** Meça antes de agir:
  `grep -rln 'authRateLimited\|checkRateLimit(' app lib --include='*.ts' --include='*.tsx'`.
  Esta linha dizia "existe em 2 pontos; login e signup estão sem" — era o estado anterior à
  issue #64, e o `docs/threat-model.md` ainda carrega a versão velha, com nota de reauditoria.
- Fallback do rate limit é **em memória** e **declarado**: sem Redis alcançável o contador é por processo, o log da transição é `error` em produção e `/api/v1/health` responde **503** (`rate_limit.backend = memoria`) em produção e `degraded` em dev. Ver `docs/auditoria/p3-02-rate-limit-declarado.md`.
- `Idempotency-Key` implementado em poucas rotas, apesar de o contrato prometer nos POSTs de criação. Quantas: `git grep -l 'Idempotency-Key' -- 'app/api/**/route.ts' | wc -l` (medido em 26/11/2026: 8).
- **`.env.example` está completo** — medido em 2026-08-14: das 45 chaves de `lib/env.ts`, a
  única ausente é `NODE_ENV`, que não é configuração do operador. Esta linha dizia que faltavam
  6, "incluindo 3 secrets"; os três (`IMPERSONATE_COOKIE_SECRET`, `INTERNAL_CRON_SECRET`,
  `LGPD_SIGNING_KEY`) estão lá. Se você adicionar env var, adicione nos dois lugares (item 9 do
  DoD) — a regra continua valendo, o que caiu foi a dívida.
- `lib/auth/invite-token.ts` cai em `"dev-fallback"` como secret HMAC se nenhum secret existir
  (inalcançável em produção, porque `INTERNAL_SECRET` é obrigatório e derruba o boot).
- **Handlers de `app/api/**` com service role**: não cite um total aqui — ele envelhece. Meça:
  `node scripts/auditoria/inventario-service-role.mjs`. O instrumento imprime handlers de rota,
  arquivos com service role (inclui `_handler`/`_shared`), cadeias `.from()` em tabela tenant-aware
  e as que não filtram `organization_id` na própria cadeia. Nenhum gate automático prova o filtro;
  `tests/unit/handlers-service-role-tem-guard.test.ts` cobra a porta de entrada e
  `handlers-service-role-filtram-organizacao.test.ts` cobra a menção à organização — os dois são
  **proteção parcial**. Escrevendo handler novo, o filtro e a autorização são sua responsabilidade.
- Detalhes e prioridade: [`docs/harness-audit.md`](docs/harness-audit.md),
  [`docs/current-state.md`](docs/current-state.md) e [`docs/threat-model.md`](docs/threat-model.md).

## Regras de segurança

- Sempre `getUser()` no backend. **Nunca `getSession()`** (confia no cookie sem revalidar).
- API key/token **nunca** em query string — só header. Plaintext do bearer é mostrado
  **uma vez**; no banco só hash SHA256.
- HMAC de webhook com `crypto.timingSafeEqual`. Fail-closed quando o secret falta.
- Nunca logue segredo, token, CPF, telefone ou e-mail. Sentry tem `beforeSend` que
  higieniza — não confie nele como única camada.
- Não commite screenshot/dump com dado real de cliente.

## Packaging — se você tocou `Dockerfile*`, `docker-compose*.yml` ou `hostgator-setup-kit/`

Lei completa em [`docs/doctrine/packaging.md`](docs/doctrine/packaging.md). O não-negociável:

- **Nenhum serviço de `docker-compose.prod.yml` constrói na máquina do cliente.** Todo serviço
  declara `image:` de uma imagem publicada; `build:` só existe **ao lado**, como escape.
  Serviço `build:`-only é pulado por `docker compose pull` e imune a `up -d` sem `--build` —
  ele não é só caro de instalar, ele **nunca é atualizado**.
- **Publicação é ato do CI**, nunca da sua máquina: build ARM local não roda na VPS amd64.
- **Instalação de cliente aponta para número de versão**, nunca para tag móvel. Aqui `latest`
  significa **topo da `main`**, não última release — quem quer a última release usa `stable`.
- **Dependência upstream é referenciada com tag fixa, nunca republicada** (WAHA é licenciado).
- **Bump de versão não pode exigir que o operador da VPS edite arquivo à mão.**

`pnpm test:shell` é o único gate que exercita o kit. Rode-o.

## Auditoria AAA — o prompt mestre é vinculante

A frente **NEXUS AAA** é regida por
[`docs/auditoria/PROMPT-MESTRE-AAA.md`](docs/auditoria/PROMPT-MESTRE-AAA.md). Esse arquivo
guarda o prompt do usuário **íntegro e verbatim** e tem **autoridade sobre qualquer `.md`
deste repositório** — `AGENTS.md`, `CLAUDE.md`, doutrina, PRD, runbook, doc de arquitetura.
Onde houver divergência, **vale o prompt**; o outro documento é que está errado. Uma cópia
byte a byte em
[`docs/auditoria/PROMPT-MESTRE-NEXUS-AAA.md`](docs/auditoria/PROMPT-MESTRE-NEXUS-AAA.md)
serve de leitura/backup; se as duas divergirem, vale `PROMPT-MESTRE-AAA.md`.

Nenhum item do prompt pode ser omitido, resumido, reordenado ou pulado. O estado de cada
requisito (`[x]`, `[~]`, `[!]`, `[ ]`) e a evidência vivem no inventário, nos PRs e no
relatório final — nunca em prosa que envelhece. O gate de integridade é
`pnpm exec tsx scripts/auditoria/verificar-prompt.ts`.

## Critério de conclusão

Vale a **Definition of Done em [`CLAUDE.md`](CLAUDE.md)** — conte lá em vez de confiar num número aqui (`sed -n '/^## Definition of Done/,/^Um staff engineer/p' CLAUDE.md | grep -cE '^[0-9]+\. '`; esta linha já disse 15 e o DoD tem 16). A régua tem que DELIMITAR a seção: a primeira versão desta linha oferecia `grep -c '^[0-9]\+\. \*\*' CLAUDE.md`, que devolve **25** — casa toda linha numerada em negrito do arquivo (anti-patterns, packaging, higiene de branches, migrations) e perde os itens 1–10 do próprio DoD, que não são negrito. Trocar o número pelo comando só ajuda se o comando responder à pergunta. Não declare pronto
sem: typecheck/lint zerados, testes relevantes verdes, RLS testada se tocou tabela
tenant-aware, migration + baseline + MANIFEST se mudou schema, prova visual se mudou UI, e a
regra de packaging acima se mudou o artefato que o self-hoster instala.

## Regra final — não invente

Este repositório tem PRDs, specs, regras de negócio e doutrina escritos
(`docs/prd/`, `docs/specs/`, `docs/business-rules/`, `docs/doctrine/`).
**Nunca invente regra de negócio, número, SLA ou comportamento de produto.**
Se a regra não está escrita, diga que não está e pergunte — não preencha a lacuna com
suposição plausível. Ao documentar, marque o que é `CONFIRMADO` (provado por código) e o
que é `INFERIDO`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
