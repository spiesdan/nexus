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
| Coordenação | `…/aaa-programa` · `programa/nexus-aaa` | Coordenador | fila, integração, gates, fiscal/financeiro, arquitetura |
| Banco e segurança | `…/aaa-front-db` · `front/db-seguranca` | Agente A | F-09, F-17, service role, migrations, isolamento |
| Sentinel | `…/aaa-front-sentinel` · `front/sentinel` | Agente G | Nexus Sentinel v1 somente leitura |
| Fiscal/financeiro | `programa/nexus-aaa` (fatias) | Coordenador (Agente C) | idempotência, duplicidade, vínculo pedido×nota |

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
| **P0-01** | F-09-B: `baseline.sql` canônico; `db push`/`migration up` bloqueados em scripts, CI, deploy e doc | `[~]` | Decisão em `20-f09-estrategia.md`; gate `#451` em `main`; `db:migrate`/`db:reset` usam baseline | A / Coordenador | — | Nenhum script/CI/deploy invoca a cadeia; docs de operação dizem o caminho; gate reprova reintrodução; `pnpm test:db` instala e atualiza em Postgres descartável |
| **P0-02** | F-17: provar isolamento comportamental nas **34** tabelas restantes | `[~]` | 39 fechadas no #453 (`e29ecf51`); 34 fechadas no PR #482 (`cbfe15f2`), que deixa `DEBITO_CONHECIDO = []` | A / Coordenador | Merge #482; Docker | Cada tabela tem controle positivo (org A vê a própria linha) e negativo (org B vê 0), com `set role authenticated` |
| **P0-03** | Service role: autorização e filtro de tenant no ponto de uso, não só menção textual | `[~]` | Gate estático em `tests/unit/handlers-service-role-filtram-organizacao.test.ts`; 52 handlers sem menção, 14 exceções | A / B | — | Revisão dos 52; exceções com motivo, dono e teste; nenhum handler de tenant na allowlist; prova de rota com dois tenants nos casos de dinheiro/PII |
| **P0-04** | Idempotência financeira sob concorrência: teto de recebimento não pode ser furado por dois pagamentos simultâneos com chaves diferentes | `[~]` | `registrarPagamento` lê a soma antes do insert; unique só cobre a mesma `idempotency_key` (`financial_payments` baseline:19679–19699). Correção em `fix/aaa-p0-financeiro`: trigger 0314 + teste de concorrência | Coordenador (C) | Migration + baseline + MANIFEST | Dois POSTs concorrentes com chaves distintas não somam mais que o saldo; teste reproduz a corrida; retry com a mesma chave devolve o mesmo pagamento |
| **P0-05** | Emissão fiscal: impedir duas notas vivas para o mesmo pedido sob clique duplo/retry concorrente | `[ ]` | `lib/fiscal/emitir-nota.ts:276-293` — checagem "um pedido, uma nota viva" antes do insert, sem constraint; `invoices` não tem unique por pedido | Coordenador (C) | Migration + baseline + MANIFEST; decisão preservando reemissão após cancelamento | Banco recusa a segunda nota viva; nota cancelada permite nova emissão; teste concorrente e de cancelamento |
| **P0-06** | Deploy aplica schema e falha alto; restore ensaiado | `[x]` | `1d10ff7c` (deploy aplica e verifica schema, sem `\|\| true`); `#462` (F-32 restore, perda de GRANTs); `tests/shell/deploy-aplica-schema.test.sh` | A | — | `pnpm test:shell` verde; ensaio de update e restore documentado em `25-ensaio-de-restauracao.md` |
| **P0-07** | Sentinel v1 somente leitura, sem escrita fiscal/financeira e sem cross-tenant | `[~]` | Frente `front/sentinel` em execução; requisitos na §10 do prompt mestre | G | — | Detectores determinísticos com casos positivos/negativos; reexecução não duplica ocorrência; RLS e kill switch; zero ação de escrita |
| **P0-08** | Idempotência nas rotas fiscais que criam efeito externo (emissão, inutilização, manifestação, retransmissão) | `[ ]` | Achado F5 (`docs/auditoria/17-modulos-5.4-5.11.md`): nenhuma rota fiscal usa `Idempotency-Key` | Coordenador (C) | P0-05; decisão D-03 | Retry com a mesma chave não cria segundo job/documento; teste de repetição e de timeout |
| **P0-09** | Recebimento de compra não pode somar estoque duas vezes sob concorrência | `[ ]` | `app/api/v1/purchase-orders/[id]/receber/route.ts:99-140`: lê `recebido_qtd`, ajusta estoque (CAS) e grava `recebido_qtd` sem CAS — dois POSTs simultâneos ajustam o estoque duas vezes e o segundo sobrescreve a quantidade | Coordenador (C) | — | CAS em `recebido_qtd` antes do ajuste de estoque; perdedor não movimenta; teste concorrente com dois POSTs e soma final igual ao pedido |

## 4. Fila — P1 (jornadas críticas, integração, offline, a11y, desempenho)

| ID | Requisito | Estado | Evidência | Dono | Depende de | Critério de aceite |
|---|---|---|---|---|---|---|
| **P1-01** | Jornadas críticas sem falha: J6 inbox (7/9), J13 fiscal (3/4), J14 LGPD (2/4) | `[~]` | `docs/auditoria/29-capacidades.md` | E / H | Ambiente E2E | Falhas reproduzidas, corrigidas e reexecutadas; nenhuma marcada "instável" sem causa |
| **P1-02** | Fiscal: devolução de venda, IE do destinatário e `<entrega>` duplicado | `[~]` | PR #438 aberto | C | Revisão fiscal | PR verde com teste de regressão; regra existente preservada; sem emissão real |
| **P1-03** | Campanhas nomeadas pelas cidades (determinístico, edição manual preservada) | `[!]` | §8 do prompt mestre; não existe gerador no código; o wizard exige nome manual (`_campanha-wizard.tsx:696`) | E / Coordenador | **Decisão de produto sobre a regra do nome** (opções abaixo) | Nome gerado de 1..N cidades, ordenado, sem duplicata; nome manual não é apagado; UI + API + persistência com teste |
| **P1-04** | Mobile/offline: fila idempotente, conflito, retomada e estado visível | `[~]` | Capacidades 23–24; `docs/auditoria/08-mobile-offline.md` | F | APK/emulador | Matriz de dispositivos; retry não duplica; estado de sincronização na tela; limitações declaradas |
| **P1-05** | Acessibilidade WCAG 2.2 AA nas telas restantes | `[~]` | `#469` mergeado (axe em 10 telas); `#468` aberto (snapshots) | D | — | axe sem violação crítica nas telas cobertas; teclado/foco/movimento reduzido provados |
| **P1-06** | Índices e paginação: listas sem `limit` silencioso e ordenação estável | `[~]` | `#458` (teto nas listas); `#464` aberto com `invariants` vermelho | A / E | Corrigir #464 | Nenhuma lista esconde item sem "há mais"; plano de consulta usa índice; `test:db` verde |
| **P1-07** | Rate limit em MFA e recuperação de conta | `[~]` | PR #466 verde (aguardando merge) | B | — | Teto por IP e por identificador; teste de repetição; fallback documentado |

## 5. Fila — P2 (identidade, shell, consistência)

| ID | Requisito | Estado | Evidência | Dono | Depende de | Critério de aceite |
|---|---|---|---|---|---|---|
| **P2-01** | Fonte única de tokens, temas claro/escuro, contraste composto | `[~]` | `DESIGN.md`; `docs/design-system/`; `#468` | D | — | Tokens consumidos pelo produto; contraste calculado sobre cor final; desvios registrados |
| **P2-02** | Shell: sidebar, topbar, busca, notificações, seletor de organização, breadcrumbs | `[~]` | `docs/auditoria/05-componentes.md`; `docs/auditoria/11-auditoria-visual.md` | D / E | P2-01 | Hierarquia uniforme; navegação por teclado; mobile não é desktop comprimido |
| **P2-03** | Capabilities classificadas nos 7 estados (D3) | `[~]` | `29-capacidades.md` está no PR #475, não em `main` | Coordenador | Merge #475 | Toda capacidade com estado, evidência e lacuna nomeada; gate verde |
| **P2-04** | Documentação de estado do produto sem número envelhecido | `[~]` | `AGENTS.md` diz 89/169 handlers; medido 244/418 | Coordenador | — | Onde a afirmação vira comando, vira comando; nenhum total sem fonte |

## 6. Fila — P3 (melhorias sem risco imediato)

| ID | Requisito | Estado | Evidência | Dono | Depende de | Critério de aceite |
|---|---|---|---|---|---|---|
| **P3-01** | Capacitor iOS | `[!]` | `29-capacidades.md` item 30: ausente por decisão | Dono | Decisão de produto | Só entra com decisão registrada e dispositivo |
| **P3-02** | Substituir fallback em memória do rate limit por Redis obrigatório em produção | `[~]` | `AGENTS.md` (limitação conhecida) | B | — | Produção falha alto sem Upstash, ou fallback declarado |
| **P3-03** | Limpar `plan/progress.md` e planos antigos que ensinam `db push` | `[ ]` | `plan/progress.md:302`; `docs/superpowers/plans/*` | Coordenador | P0-01 | Nenhum plano ativo ensina caminho proibido; histórico preservado com aviso |

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
| D-01 | Regra do nome automático de campanha por cidade (P1-03) | (a) lista literal: `Bituruna, Cruz Machado, União da Vitória`; (b) primeira + contagem: `Bituruna +2 cidades`; (c) prefixo fixo: `Prospecção — Bituruna, ...` | Nome é o que o operador vê na lista; define duplicata, tamanho máximo (hoje 120) e como voltar ao automático depois de editar | Dono |
| D-02 | Comportamento do nome ao editar manualmente (P1-03) | (a) edição manual desliga o automático até "Usar nome sugerido"; (b) edição manual é sobrescrita a cada mudança de cidade; (c) campo separado "sugestão" ao lado | (b) apaga trabalho do operador — o prompt proíbe apagar em silêncio. Recomendação: (a) | Dono |
| D-03 | Idempotência das rotas fiscais (P0-08): repetir com a mesma `Idempotency-Key` devolve a nota/job original ou 409? | (a) devolver o recurso original (200, como o financeiro); (b) 409 nomeando a nota existente | (a) é retry seguro de verdade; (b) é honesto mas obriga o cliente a tratar | Dono |

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
| 18/11/2026 | P0-05: uma nota viva por pedido | branch `fix/aaa-p0-nota-viva` | `pnpm test:db` em execução |
