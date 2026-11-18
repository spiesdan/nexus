# 30 — Fila única do programa NEXUS AAA

> **Autoridade:** `docs/auditoria/PROMPT-MESTRE-AAA.md` (18/11/2026). Esta fila é o
> índice operacional: todo item aponta requisito, estado, evidência, dono, prioridade,
> dependências e critério de aceite. Ela não substitui a evidência — aponta para ela.
>
> **Regra de honestidade:** `[x]` só com prova no commit indicado. Código mergeado não é
> release; release não é deploy; detector do Sentinel não é correção aplicada.

## 0. Baseline do programa

| Campo | Valor | Como foi medido |
|---|---|---|
| Repositório | `spiesdan/nexus` (único remote) | `git remote -v` |
| Branch do programa | `programa/nexus-aaa` | `git status -sb` |
| Commit de partida | `f3ea10d6` (base `nexus/main`, tag `v1.55.0` + #478 + #453 + #464) | `git log --oneline -1` |
| Working tree | limpo no início (nenhuma alteração preexistente a preservar) | `git status --porcelain` |
| Versão publicada | **1.55.0** — tag `v1.55.0`; `package.json` segue `0.1.0` de propósito | `git ls-remote --tags nexus` |
| Produção | reportada em 1.55.0 pelo operador; **não verificada por este programa** (sem acesso) | relato do dono |
| Runtime local | macOS (darwin), Node `v22.20.0`, pnpm `9.15.9`, Docker `29.8.2` | `node -v`, `pnpm -v`, `docker info` |
| Gates | `pnpm gov:verify` = typecheck + lint + lint:channels + lint:role-rank + test:unit; `test:db` exige Docker; `test:e2e` exige app + banco | `package.json` |

### Frentes e donos

| Frente | Worktree / branch | Dono | Escopo |
|---|---|---|---|
| Coordenação | `…/aaa-programa` · `programa/nexus-aaa` | Coordenador | fila, integração, gates, D-01/D-02/D-03, arquitetura |
| Banco e segurança | `…/aaa-front-db` · `f17/papel-e-volume` | Agente A | MCP/guarda no handler, backup/restore, F-17, service role |
| Fiscal/financeiro | `…/aaa-front-fiscal` · `front/fiscal` | Agente C | cancelamento×drain, importação de entrada, recuperação de nota, conciliação |
| Design system | `…/aaa-front-design` · `front/design-tinta` | Agente D | tokens, contraste, a11y, shell, temas — **não** toca regra de negócio |
| Módulos e jornadas | `…/aaa-front-modulos` · `front/modulos` | Agente E | 5.4 (inbox/campanhas), 5.6 (pedidos), 5.8 (fiscal/UI), 5.10/5.11 (config/admin) — **não** toca tokens/design nem schema/migrations |
| Mobile/offline | `…/aaa-front-mobile` · `front/mobile` | Agente F | PWA/Capacitor/offline, fila/retry/conflito, estado de sincronização — **não** declara dispositivo não testado |
| Sentinel | `…/aaa-front-sentinel` · `front/sentinel` | Agente G | Sentinel v1 (na main) e v1.1 (recomendações, sem escrita fiscal) |

### Regras de não-duplicação e dono de schema

- **Schema/migration**: dono é o **Coordenador** (ou quem ele nomear no item). Agentes D/E/F **não** criam migration nem alteram `baseline.sql`/`MANIFEST.md`; pedem ao Coordenador com requisito, tabela e aceite. Reservas atuais: **0317** = D-03 (`idempotency_keys.request_hash`), **0318** = D-01/D-02 (`prospecting_campaigns.nome_manual`).
- **Tokens/design**: dono é **D**. Nenhuma outra frente altera `app/globals.css`, tokens, tipografia, shell ou componentes globais.
- **Nome de campanha (D-01/D-02)**: dono é o **Coordenador**. E não edita `lib/prospeccao/nome-da-campanha.ts`, o wizard de campanha nem a API de campanhas.
- **Idempotência fiscal (D-03)**: dona é a fatia do **Coordenador** em `lib/api/idempotencia.ts` + rotas `invoices`/`fiscal-inutilizacoes`. C atua em cancelamento/drain/importação; se precisar do mesmo contrato, importa o helper, não copia.
- **Sentinel**: G é dono de `lib/sentinel/**`, `app/app/sentinel/**`, `api/v1/sentinel/**` e das tabelas `sentinel_*`; mudança de schema passa pelo Coordenador.
- **Tipos compartilhados/contrato de API**: mudança é anunciada na fila antes de codar; duas frentes não editam o mesmo arquivo.
- **Mobile**: F pode mexer em `mobile/`, `app/sw*`, `lib/entregas/**` e fila offline; não altera regra de negócio do servidor nem promete APK/iOS sem dispositivo.


Regra de convivência: nenhum agente edita arquivo de outro. Mudança em schema,
baseline, tipos compartilhados ou contrato de API tem **um** responsável por vez; o
coordenador integra e roda os gates no código integrado.

## 1. Reconciliação dos relatos com o código real

| Relato anterior | Estado no checkout | Evidência | Divergência registrada |
|---|---|---|---|
| **F-09** — cadeia de 292 migrations não reproduz o schema; `db push` perigoso | **Fechado por decisão (B)**: `baseline.sql` é o caminho canônico; cadeia é histórico morto; gate impede reintrodução | `docs/auditoria/20-f09-estrategia.md`; PR #451 mergeado em `7385b9ad`; `scripts/db/aplicar-schema.sh`; `tests/unit/db-migrate-nao-e-placeholder.test.ts`, `db-reset-aplica-baseline.test.ts` | O relato dizia "aberto". A decisão e o gate chegaram depois da auditoria (17–18/11). |
| **F-17** — 73 tabelas tenant-aware sem prova comportamental | **Parcial**: 39 fechadas (PR #453), **34 restantes** em `DEBITO_CONHECIDO` | `tests/invariants/rls-completude-varredura.test.ts`; `tests/invariants/f17-tabelas-provadas.ts` | O relato dizia 73. A prova de 39 está em PR, não em `main` até o merge. |
| **Service role** — "89 de 169 handlers" (AGENTS.md) | **244** handlers de `app/api/**` citam `createAdminClient`/`SUPABASE_SERVICE_ROLE`; **52** não citam `organization_id`/`orgId`; 14 exceções nomeadas no gate | `tests/unit/handlers-service-role-filtram-organizacao.test.ts`; `grep -rln createAdminClient app/api` | AGENTS.md está velho (169 handlers). O total do inventário é **418** handlers em `app/api`; a contagem real de service role é 244. |
| **Idempotência financeira** | **Parcial**: recebimento em `financeiro/recebiveis/[id]/pagamentos` honra `Idempotency-Key`; recebível avulso tem PR #456 aberto; baixas usam unique + upsert | `lib/comercial/financeiro.ts`; `app/api/v1/financeiro/recebiveis/[id]/pagamentos/route.ts`; `app/api/v1/titulos/baixas/route.ts` | Não há prova de teto sob **concorrência** com chaves diferentes (ver P0-04). |
| **Fiscal** | `#473` mergeado (nota autorizada marca pedido faturado); `#438` aberto (devolução/IE/`<entrega>`); achados F2–F7 da auditoria abertos | `git log`; `docs/auditoria/17-modulos-5.4-5.11.md`; `app/api/v1/invoices/route.ts` | Emissão não usa `Idempotency-Key` e a trava "um pedido, uma nota viva" é leitura seguida de insert (corrida possível — P0-05). |
| **Mobile/offline** | Capacitor **Android** existe (`android/`, `mobile/`); **iOS ausente** por decisão; outbox de entregas parcial | `docs/auditoria/29-capacidades.md` (itens 23–24, 30); `docs/auditoria/08-mobile-offline.md` | J16 segue bloqueada por emulador/dispositivo; viewport de navegador não é prova de APK. |
| **PRs** | Abertos no início: #478 (prompt mestre), #477, #476, #475, #472, #471, #468, #466, #465, #464, #457, #456, #453, #439, #438, #307, dependabot | `gh pr list` | #451 foi mergeado nesta rodada; #453 precisou de rebase (conflito de doc). |
| **Releases** | Última tag `v1.55.0`; nenhuma `v2` | `git ls-remote --tags nexus` | Nenhum deploy foi executado por este programa. |

## 2. Estados

- `[x]` comprovado no código/ambiente indicado, com teste ou medição reproduzível.
- `[~]` parcial: caminho principal existe, falta recorte nomeado.
- `[!]` bloqueado: depende de decisão humana, credencial, dispositivo ou serviço externo.
- `[ ]` não iniciado.

## 3. Fila — P0 (exposição, perda, duplicidade, deploy inseguro)

| ID | Requisito | Estado | Evidência | Dono | Depende de | Critério de aceite |
|---|---|---|---|---|---|---|
| **P0-01** | F-09-B: `baseline.sql` canônico; `db push`/`migration up` bloqueados em scripts, CI, deploy e doc | `[x]` | #451 (catraca) + #481 (`4a9bddc2`, prova por execução: install, update, ACL, reset e restore em Postgres descartável) | A / Coordenador | — | Nenhum script/CI/deploy invoca a cadeia; docs de operação dizem o caminho; gate reprova reintrodução; `pnpm test:db` instala e atualiza |
| **P0-02** | F-17: provar isolamento comportamental nas **34** tabelas restantes | `[x]` | #453 (39) + #482 → `93109bff` (34; débito **vazio**); #486 acrescenta UPDATE/DELETE/INSERT cross nas 73 (367 testes) | A / Coordenador | — | Cada tabela tem controle positivo (org A vê a própria linha) e negativo (org B vê 0), com `set role authenticated` |
| **P0-03** | Service role: autorização e filtro de tenant no ponto de uso, não só menção textual | `[x]` | #483 → `dd515696`: 210 handlers/100 cadeias revisadas, 42 arquivos classificados, vazamento real em `sendMessageHandler` corrigido e provado (cross recusado, própria org envia); 2 gates novos | A / B | — | Revisão dos 52; exceções com motivo, dono e teste; nenhum handler de tenant na allowlist; prova de rota com dois tenants nos casos de dinheiro/PII |
| **P0-04** | Idempotência financeira sob concorrência: teto de recebimento não pode ser furado por dois pagamentos simultâneos com chaves diferentes | `[x]` | #480 → `7a498f9d`: trigger 0314; `test:db` 160/1497; CI 5/5 (e2e 17m) | Coordenador (C) | — | Dois POSTs concorrentes com chaves distintas não somam mais que o saldo; teste reproduz a corrida; retry com a mesma chave devolve o mesmo pagamento |
| **P0-05** | Emissão fiscal: impedir duas notas vivas para o mesmo pedido sob clique duplo/retry concorrente | `[x]` | #484 → `f691dc06`: trigger 0315, advisory lock por org+pedido; `test:db` 160/1497; CI 5/5 | Coordenador (C) | — | Banco recusa a segunda nota viva; nota cancelada permite nova emissão; teste concorrente e de cancelamento |
| **P0-06** | Deploy aplica schema e falha alto; restore ensaiado | `[x]` | `1d10ff7c` (deploy aplica e verifica schema, sem `\|\| true`); `#462` (F-32 restore, perda de GRANTs); `tests/shell/deploy-aplica-schema.test.sh` | A | — | `pnpm test:shell` verde; ensaio de update e restore documentado em `25-ensaio-de-restauracao.md` |
| **P0-07** | Sentinel v1 somente leitura, sem escrita fiscal/financeira e sem cross-tenant | `[x]` | #489 → `f644b21c` (integra #487, migration 0316): 27 detectores, ocorrência idempotente, RLS, kill switch; 68 unit + 184 invariantes; CI 5/5 | G / Coordenador | — | Detectores determinísticos com casos positivos/negativos; reexecução não duplica ocorrência; RLS e kill switch; zero ação de escrita |
| **P0-08** | Idempotência nas rotas fiscais que criam efeito externo (emissão, inutilização, manifestação, retransmissão) | `[x]` | #499 → `3141a483`: reivindicação forte, replay/original, 409 de payload, 0317 (request_hash text); 9 testes + 434 invariantes | Coordenador | — | Retry com a mesma chave não cria segundo job/documento; teste de repetição e de timeout |
| **P0-09** | Recebimento de compra não pode somar estoque duas vezes sob concorrência | `[x]` | #485 → `239efd32`: CAS em `recebido_qtd` antes do estoque, devolução com o mesmo CAS e compensação; 5 casos unitários; CI 5/5 | Coordenador (C) | — | CAS em `recebido_qtd` antes do ajuste de estoque; perdedor não movimenta; teste concorrente com dois POSTs e soma final igual ao pedido |

## 4. Fila — P1 (jornadas críticas, integração, offline, a11y, desempenho)

| ID | Requisito | Estado | Evidência | Dono | Depende de | Critério de aceite |
|---|---|---|---|---|---|---|
| **P1-01** | Jornadas críticas sem falha: J6 inbox (7/9), J13 fiscal (3/4), J14 LGPD (2/4) | `[~]` | `docs/auditoria/29-capacidades.md` | E / H | Ambiente E2E | Falhas reproduzidas, corrigidas e reexecutadas; nenhuma marcada "instável" sem causa |
| **P1-02** | Fiscal: devolução de venda, IE do destinatário e `<entrega>` duplicado | `[~]` | PR #438 aberto | C | Revisão fiscal | PR verde com teste de regressão; regra existente preservada; sem emissão real |
| **P1-03** | Campanhas nomeadas pelas cidades (determinístico, edição manual preservada) | `[x]` | #498 → `5a499313`: gerador + `nome_manual` (0318) + wizard/API; 11 testes do gerador/decisão, 2 de schema; install+update verdes | Coordenador | — | Nome gerado de 1..N cidades, ordenado, sem duplicata; nome manual não é apagado; UI + API + persistência com teste |
| **P1-04** | Mobile/offline: fila idempotente, conflito, retomada e estado visível | `[~]` | Capacidades 23–24; `docs/auditoria/08-mobile-offline.md` | F | APK/emulador | Matriz de dispositivos; retry não duplica; estado de sincronização na tela; limitações declaradas |
| **P1-05** | Acessibilidade WCAG 2.2 AA nas telas restantes | `[~]` | `#469` mergeado (axe em 10 telas); `#468` aberto (snapshots) | D | — | axe sem violação crítica nas telas cobertas; teclado/foco/movimento reduzido provados |
| **P1-06** | Índices e paginação: listas sem `limit` silencioso e ordenação estável | `[~]` | `#458` (teto nas listas); `#464` mergeado (`f3ea10d6`) com o índice 0313 e baseline restaurado | A / E | — | Nenhuma lista esconde item sem "há mais"; plano de consulta usa índice; `test:db` verde |
| **P1-07** | Rate limit em MFA e recuperação de conta | `[x]` | #466 mergeado (`f56c0228`): teto em `verifyMfa` e `useRecoveryCode` com testes | B | — | Teto por IP e por identificador; teste de repetição; fallback documentado |

## 5. Fila — P2 (identidade, shell, consistência)

| ID | Requisito | Estado | Evidência | Dono | Depende de | Critério de aceite |
|---|---|---|---|---|---|---|
| **P2-01** | Fonte única de tokens, temas claro/escuro, contraste composto | `[~]` | `DESIGN.md`; `docs/design-system/`; `#468` | D | — | Tokens consumidos pelo produto; contraste calculado sobre cor final; desvios registrados |
| **P2-02** | Shell: sidebar, topbar, busca, notificações, seletor de organização, breadcrumbs | `[~]` | `docs/auditoria/05-componentes.md`; `docs/auditoria/11-auditoria-visual.md` | D / E | P2-01 | Hierarquia uniforme; navegação por teclado; mobile não é desktop comprimido |
| **P2-03** | Capabilities classificadas nos 7 estados (D3) | `[x]` | #475 mergeado (`470aac4e`): `29-capacidades.md` + gate `capacidades-classificadas.test.ts` | Coordenador | — | Toda capacidade com estado, evidência e lacuna nomeada; gate verde |
| **P2-04** | Documentação de estado do produto sem número envelhecido | `[x]` | #506: `AGENTS.md` aponta `scripts/auditoria/inventario-service-role.mjs`; dois gates nomeados como proteção parcial | Coordenador | — | Onde a afirmação vira comando, vira comando; nenhum total sem fonte |

## 6. Fila — P3 (melhorias sem risco imediato)

| ID | Requisito | Estado | Evidência | Dono | Depende de | Critério de aceite |
|---|---|---|---|---|---|---|
| **P3-01** | Capacitor iOS | `[!]` | `29-capacidades.md` item 30: ausente por decisão | Dono | Decisão de produto | Só entra com decisão registrada e dispositivo |
| **P3-02** | Substituir fallback em memória do rate limit por Redis obrigatório em produção | `[~]` | `AGENTS.md` (limitação conhecida) | B | — | Produção falha alto sem Upstash, ou fallback declarado |
| **P3-03** | Limpar planos antigos que ensinam `db push` | `[x]` | #506: 7 planos ativos apontam `pnpm db:migrate`; gate novo; `plan/progress.md` preservado como diário histórico | Coordenador | — | Nenhum plano ativo ensina caminho proibido; histórico preservado com aviso |

## 7. Itens bloqueados por decisão humana / dispositivo / credencial

| Item | Bloqueio | O que falta | Quem decide |
|---|---|---|---|
| P3-01 iOS | Não há `ios/` nem `@capacitor/ios` | Decisão de escopo e conta Apple | Dono |
| P1-04 prova em dispositivo | Sem emulador/APK nesta máquina | Dispositivo Android ou emulador | Dono |
| P0-07 Sentinel em produção | Depende de deploy e agenda | Aprovação de release | Dono |
| Emissão real de NF-e / pagamento | Proibido pelo prompt | Nunca neste programa | — |

## 8. Gates e definição de pronto

Um item só vira `[x]` quando:

1. está ligado a um requisito/risco real desta fila;
2. preserva a regra existente ou tem decisão de mudança registrada;
3. tem teste adequado ao risco, reproduzível no commit indicado;
4. não regride tenant, fiscal, financeiro, segurança, a11y ou mobile;
5. tem documentação e rollback quando mexe em schema/operação;
6. branch, PR, merge, release e deploy estão em colunas separadas;
7. a evidência aponta commit e ambiente.

Comandos mínimos por tipo de mudança:

```bash
pnpm typecheck && pnpm lint && pnpm test:unit     # sempre
pnpm test:db                                      # schema/RLS/migration (Docker)
pnpm test:e2e:smoke                               # UI/jornada (app + banco)
pnpm test:shell                                   # kit de instalação/deploy
```

## 9. Decisões pendentes (o agente não inventa)

| ID | Decisão | Opções medidas | Impacto | Quem decide |
|---|---|---|---|---|
| D-01 | Regra do nome automático de campanha por cidade (P1-03) | **DECIDIDA 18/11**: trim, dedupe case-insensitive, ordem pt-BR, 1/2–4/5+, teto 80 em palavra | Implementada no #498 | Dono |
| D-02 | Comportamento do nome ao editar manualmente (P1-03) | **DECIDIDA 18/11**: edição grava `nome_manual=true` e nunca é sobrescrita; ação "Voltar ao nome automático" limpa e regenera | Implementada no #498 | Dono |
| D-03 | Idempotência das rotas fiscais (P0-08) | **DECIDIDA 18/11**: mesma chave+payload devolve o recurso original com `Idempotency-Replayed`; payload diferente 409 | Implementada no #499 | Dono |

Enquanto a decisão não vem, o item fica `[!]` e a fila registra a opção recomendada.

## 10. Registro de execução

| Data | Marco | Commit/PR | Evidência |
|---|---|---|---|
| 18/11/2026 | Baseline e reconciliação | `608d1e2d` | este documento |
| 18/11/2026 | Prompt mestre novo na main; programa rebaseado | #478 → `126f4bb3` | CI 5/5 verde |
| 18/11/2026 | F-09 com catraca integrada | #451 → `7385b9ad` | `gh pr view 451`; CI 5/5 verde |
| 18/11/2026 | F-17: 39 tabelas provadas (rebase) | #453 → `c6d6ff75` | CI do PR; `DEBITO_CONHECIDO` 73→34 |
| 18/11/2026 | P0-04: teto do recebível sob concorrência | #480 | `pnpm test:db` 160 arquivos/1497 testes |
| 18/11/2026 | F-17 fecha a dívida (34 restantes) | #482 | arquivo novo: 67 testes; completude: 152 testes com débito vazio |
| 18/11/2026 | P0-05: uma nota viva por pedido | #484 | `pnpm test:db` local: 160 arquivos/1497 testes |
| 18/11/2026 | Índice 0313 e rate limit MFA | #464, #466 | CI 5/5; `f3ea10d6`, `f56c0228` |
| 18/11/2026 | Capacidades classificadas (D3) | #475 | gate `capacidades-classificadas` verde |
| 18/11/2026 | F-09 provado por execução | #481 → `4a9bddc2` | install/update/ACL/reset/restore em pg15 descartável |
| 18/11/2026 | F-17 com débito zero | #482 → `93109bff` | 34 tabelas; `DEBITO_CONHECIDO = []` |
| 18/11/2026 | F-17 nos 4 eixos (escrita) | #486 | 367 testes verdes |
| 18/11/2026 | P0-09 recebimento com CAS | #485 | 5 casos unitários |
| 18/11/2026 | P0-03 service role revisado e vazamento corrigido | #483 → `dd515696` | 210 handlers, 100 cadeias, 42 arquivos; teste cross-org |
| 18/11/2026 | Guarda no handler do MCP (follow-up P0-03) | #490 → `ac0d5e12` | fake encadeável corrigido; CI verde |
| 18/11/2026 | D-01/D-02 nome de campanha | #498 | 11 + 2 testes; install/update verdes |
| 18/11/2026 | D-03 idempotência fiscal | #499 → `3141a483` | 9 testes; 434 invariantes; CI 14/14 |
| 18/11/2026 | D-01/D-02 nome de campanha | #498 → `5a499313` | 13 testes; install/update verdes |
| 18/11/2026 | P2-04/P3-03 docs e planos | #506 | gate de plano ativo; 12 testes |
| 18/11/2026 | P0-04 teto do recebível na main | #480 → `7a498f9d` | CI 5/5; e2e 17m |
| 18/11/2026 | P0-05 nota viva na main | #484 → `f691dc06` | CI 5/5 |
| 18/11/2026 | P0-09 recebimento com CAS na main | #485 → `239efd32` | CI 5/5 |
| 18/11/2026 | F-17 nos 4 eixos | #486 → `2e95f74f` | 367 testes |
| 18/11/2026 | Sentinel v1 na main | #489 → `f644b21c` | 68 unit + 184 invariantes; CI 5/5; instalação/update verdes |
