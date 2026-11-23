# Fase 0 — Segurança do trabalho e linha de base

> **Regida por** `docs/auditoria/PROMPT-MESTRE-AAA.md` (autoridade sobre qualquer `.md`).
> Medido em **15/11/2026**, checkout em `docs/auditoria-aaa` (base `9f8e6faa`).
> Comando é a fonte; este texto é o registro. Se divergir, rode de novo.

## 1. Estado do repositório no início

| Item | Valor |
|---|---|
| Branch de trabalho | `docs/auditoria-aaa` (criada de `nexus/main`) |
| Commit base | `9f8e6faa` — *Merge PR #437 — Release 1.53.0* |
| Remote | `nexus` → `https://github.com/spiesdan/nexus.git` (único) |
| Alterações não commitadas do usuário | **preservadas** (ver abaixo) |

Arquivos do usuário que **não** foram tocados, sobrescritos nem commitados:

```
.debug-detalhe.mjs
.probe-cliente.mjs  .probe-cliente2.mjs  .probe-cliente3.mjs
.repara-mercos.mjs  .repara-mercos2.mjs  .repara-mercos4.mjs
docs/PROMPT-V5-EXPEDICAO-ROTEIZACAO.md   (untracked de propósito)
```

Novos artefatos desta frente: `scripts/auditoria/`, `scripts/discord/`,
`docs/auditoria/`, uma seção em `AGENTS.md`, uma variável em `.env.example`.
**Nenhum arquivo de produto foi alterado** — o critério "nenhuma alteração funcional" vale.

Credencial criada fora do git: `.env.local` (ignorado por `.gitignore` linha 19, `.env*`)
guarda `DISCORD_WEBHOOK_URL` e `DISCORD_GUILD_ID`. Nenhum valor é impresso por script.

## 2. Comandos reais (medido em `package.json`, não em documentação)

| Comando | O que faz | Precisa de |
|---|---|---|
| `pnpm dev` | `next dev` | — |
| `pnpm build` | `next build` | rede (fontes Google) |
| `pnpm lint` | `eslint .` | — |
| `pnpm typecheck` | `tsc --noEmit -p tsconfig.typecheck.json` | RAM (~6 GB) |
| `pnpm test:unit` | `vitest run` (exclui `tests/invariants` e `tests/e2e`) | — |
| `pnpm test:db` | invariantes de banco + gate do baseline | **Docker** |
| `pnpm test:e2e` | `playwright test` | app + banco semeado |
| `pnpm test:e2e:smoke/critical/full` | suíte por evento do CI | idem |
| `pnpm test:journeys` | Playwright das jornadas | idem |
| `pnpm test:shell` | gate do kit de instalação | bash |
| `pnpm gov:verify` | typecheck + lint + unit | — |
| `pnpm format:check` | `prettier --check` | — |
| `pnpm db:migrate` | aplica `supabase/baseline.sql` **e verifica** (`scripts/db/aplicar-schema.sh`) — corrigido em 16/11 | Docker/psql |
| `pnpm db:reset` | recria o schema pelo baseline (`scripts/db/resetar-schema.sh`) — corrigido em 16/11 | Docker/psql |

`pnpm gov:verify` **não** cobre `test:db` nem `test:e2e`. Verde nele não prova schema nem UI.

## 3. Linha de base — resultado medido

Executados em paralelo, mesma árvore, sem tocar em banco nem em serviço externo.

| Comando | Saída | Resultado |
|---|---|---|
| `pnpm typecheck` | `EXIT=0` | **verde** |
| `pnpm lint` | `✖ 505 problems (0 errors, 505 warnings)` · `EXIT=0` | **verde com ruído**: 505 avisos, 24 corrigíveis por `--fix` |
| `pnpm test:unit` | `Test Files 1 failed \| 961 passed (962)` · `Tests 1 failed \| 10193 passed \| 1 expected fail` · `421,18 s` · `EXIT=1` | **1 falha por timeout sob carga** — ver abaixo |

### A falha de `test:unit` — diagnosticada, não varrida para baixo do tapete

```
FAIL tests/unit/channel-health-aviso.test.ts > os elos que somem sem barulho
     > o webhook de status AVISA de verdade — não é o texto, é o efeito
Error: Test timed out in 15000ms.   (linha 221)
```

Rodado **isolado**, o mesmo arquivo passa:

```
pnpm exec vitest run tests/unit/channel-health-aviso.test.ts
Test Files 1 passed (1) · Tests 22 passed (22) · Duration 1,50 s
```

Conclusão: **não é defeito de produto**; é o timeout de 15 s estourando quando
lint + typecheck + 962 arquivos de teste disputam a máquina ao mesmo tempo. Fica
registrado como instabilidade de harness (risco R-05), não como bug funcional.
Um teste que demora 1,5 s isolado e 15 s sob carga é sinal de espera real dentro
do teste — vale investigar antes de culpar a máquina (Fase 9).

## 4. Ambiente de teste e destino do banco — protegidos

| Peça | Valor |
|---|---|
| Supabase local (`supabase/config.toml`) | API `54321` · DB `54322` · Studio `54323` · Inbucket `54324` |
| Credenciais E2E | `.env.e2e` (no repo, sem segredo de produção) |
| Guardrail contra banco remoto | `scripts/lib/env-de-teste.ts` → `recusarSeRemotoVindoDoArquivo()` |
| Comportamento do guardrail | `process.env` vence; fallback para `.env.local` **lança** se o destino for remoto |

O guardrail nasceu do incidente de 07/10/2026 (1.483 linhas de teste escritas em 63
tabelas de produção). Ele é **exceção**, não aviso — e foi preservado. Testes com
banco só rodam via `pnpm test:db`/`test:e2e`, com Docker local. Nada foi executado
contra VPS, WAHA, Nuvemshop, Google ou provedor de IA.

## 5. Achados da Fase 0

| # | Achado | Evidência | Severidade |
|---|---|---|---|
| F-01 | **Licença contraditória**: `LICENSE` é **MIT** (`Copyright (c) 2026 Rafael Melgaço`), mas o README diz "produto **proprietário** self-hosted" | `head -5 LICENSE` × `README.md` §Licença | **Alta (jurídica)** |
| F-02 | `db:migrate` é **placeholder** — não migra nada · **CORRIGIDO em 16/11**: `bash scripts/db/aplicar-schema.sh` aplica o `baseline.sql` com `ON_ERROR_STOP=1` e **verifica** (sai 1 se faltar objeto ou se o psql não conectar). `deploy.sh` deixou de chamá-lo com `\|\| true`. Gate: `tests/unit/db-migrate-nao-e-placeholder.test.ts` | `package.json` × `scripts/db/aplicar-schema.sh` · [`12-migrations-e-rls.md`](12-migrations-e-rls.md) §6 | Alta (operacional) |
| F-03 | Build depende de rede: `next/font/google` busca Inter e IBM Plex Mono | `app/layout.tsx:2` | Média |
| F-04 | **Fechado em 22/11 — dúvida documental, não defeito visual**: `#7e77f0` é o canônico **operacional** (`--color-accent`, rampa e semente de branding); `#67885d` é o grau 500 da paleta Sage opcional. Contraste medido: 3,63:1 vs 4,00:1 sobre branco; ambos no regime de componente, com `accent-ink` para texto. Nenhuma cor trocada | [`59-f04-token-canonico.md`](59-f04-token-canonico.md) · `app/globals.css:107,112` · `app/design/lib/tokens.ts:47` | — (resolvido) |
| F-05 | Teste com timeout apertado sob carga (ver §3) | `tests/unit/channel-health-aviso.test.ts:221` | Média |
| F-06 | 505 avisos de lint, 0 erros | `pnpm lint` | Baixa (ruído) |
| F-07 | Sem hook local de pré-push (não há `.husky/`) | `ls .husky` → vazio | Baixa |
| F-08 | Offline existe e é **parcial por desenho**: `public/sw.js` guarda HTML/JS/CSS da tela já visitada (cache-só-como-plano-B) e a fila de entregas é local — mas um aparelho que **nunca abriu** o app não abre offline | `public/sw.js` (109 linhas) · `capacitor.config.ts` · `lib/entregas/outbox.ts` | Baixa (é a promessa certa) |

> **Correção de 15/11/2026.** A primeira versão deste quadro dizia que o offline
> "exige service worker (não existe)". Errado: `public/sw.js` existe, é registrado em
> `app/app/_components/RegistrarServiceWorker.tsx` e tem 109 linhas de comentário
> explicando exatamente o limite real (cache da última tela visitada, nunca de POST
> nem de `/api/auth`). O achado virou outro, menor e verdadeiro — o texto antigo foi
> escrito antes de olhar. Registro o erro em vez de apagá-lo: auditoria que reescreve
> a própria memória não é auditável.

Nenhum desses é corrigido nesta fase — Fase 0 mede, não conserta.

## 6. Critérios de aceitação da Fase 0

| Critério | Estado | Evidência |
|---|---|---|
| Mudanças locais anteriores identificadas e preservadas | `[x]` | §1 |
| Comandos de validação e efeitos documentados | `[x]` | §2 |
| Ambiente de teste e destino do banco claros e protegidos | `[x]` | §4 |
| Nenhuma alteração funcional nesta fase | `[x]` | só `docs/`, `scripts/auditoria/`, `scripts/discord/`, `.env.example` |

**Fase 0: concluída.** A linha de base está registrada com os erros que já existiam —
inclusive o que passou e o que falhou.
