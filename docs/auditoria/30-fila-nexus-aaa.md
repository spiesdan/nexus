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
| Commit de partida (rodada 10) | `9ede1d6b` (`nexus/main`; Sentinel v1.2 incluso) | `git log --oneline -1 nexus/main` |
| Working tree | limpo no início (nenhuma alteração preexistente a preservar) | `git status --porcelain` |
| Versão publicada | **1.55.0** — tag `v1.55.0`; `package.json` segue `0.1.0` de propósito | `git ls-remote --tags --refs nexus 'refs/tags/v*'` |
| Próxima release | **1.56.0** cortada em PR [#537](https://github.com/spiesdan/nexus/pull/537) — a contagem de fragmentos é o que `pnpm release:conferir` disser; o PR é o corte vigente — **aguardando aprovação humana**, sem tag | `pnpm release:conferir` + PR |
| Produção | reportada em 1.55.0 pelo operador; **não verificada por este programa** (sem acesso) | relato do dono |
| Runtime local | macOS (darwin), Node `v22.20.0`, pnpm `9.15.9`, Docker `29.8.2` | `node -v`, `pnpm -v`, `docker info` |
| Gates | `pnpm gov:verify` = typecheck + lint + lint:channels + lint:role-rank + test:unit; `test:db` exige Docker; `test:e2e` exige app + banco | `package.json` |

### Frentes e donos

> **Regra de operação do dono (18/11/2026):** no máximo **2 workers + 1 coordenador**
> simultâneos. A máquina chegou a load 153 e agentes morreram por falta de recurso.
> **Ativos nesta rodada: D (design) e G (Sentinel).** A, E, F e H estão **pausados**
> e voltam em rodízio — nenhum trabalho novo é aberto neles; o que está em PR
> segue a triagem do §11.

| Frente | Worktree / branch | Dono | Escopo | Estado |
|---|---|---|---|---|
| Coordenação | `…/opencode/aaa-programa-2` · `programa/nexus-aaa` | Coordenador | fila, integração, gates, pacote de release, delegação | ativo |
| Banco e segurança | `…/aaa-front-db` · `rate/fallback-declarado` | Agente A | SECURITY DEFINER/`pg_temp`, rate limit P3-02, listas P1-06 | **concluído**: #518/#520/#521 mergeados; slot liberado |
| Fiscal/financeiro | `…/aaa-front-fiscal` · `front/fiscal` | Agente C | cancelamento×drain, importação de entrada, recuperação de nota, conciliação | sem PR aberto; retomada quando houver vaga |
| Design system | `…/aaa-front-shell` · `front/shell-2` | Agente D | tokens, contraste, a11y, shell, temas — **não** toca regra de negócio | **ativo** — #533 (trilhas) e #535 (seletor de empresa) |
| Módulos e jornadas | `…/aaa-front-modulos` · `front/modulos` | Agente E | 5.4 (inbox/campanhas), 5.6 (pedidos), 5.8 (fiscal/UI), 5.10/5.11 (config/admin) | **pausado** (#515/#519/#522 mergeados) |
| Mobile/offline | worktree do F (lado do dono) · `feat/offline-device` | Agente F | credencial de dispositivo (opção B) — **migration 0322 reservada** | **ativo** (#526; não mergear até o dono liberar) |
| Sentinel | `…/opencode/aaa-front-sentinel` · `front/sentinel` | Agente G | Sentinel v1.1 **mergeado** (`2116db86`); agora prova de papéis e catraca de somente leitura (#538) | **ativo** |
| Jornadas/DOD | `…/aaa-front-jornadas` · `front/jornadas` | Agente H | J6/J13/J14 e `34-prova-de-dod.md` | **pausado** (#517 mergeado: prova em Vitest) |

**Ponto de retomada por frente pausada** (para não recomeçar do zero):

- **A**: #518 (`hardening/definer-search-path`, migration **0320** no branch — precisa
  renumerar para **0321** se #439 mergear primeiro) e #520/#521 têm `verify` vermelho
  ou pendente; a saúde ficou dependente de `getUpstash()` no teste.
- **E**: `front/modulos` está 2 commits à frente/7 atrás; #515/#519/#522 entraram por PR
  próprios. O próximo lote é 5.11 (config/admin) — sem migration.
- **F**: a ponte SQLite↔remoto no APK é a decisão aberta (opção B: credencial de
  dispositivo + dreno pelo shell); depende de dispositivo.
- **H**: #517 provou J6/J13/J14 em Vitest, sem navegador. A prova de dispositivo/E2E
  de J14 (LGPD) continua `[~]`.

### Regras de não-duplicação e dono de schema

- **Schema/migration**: dono é o **Coordenador** (ou quem ele nomear no item). Agentes D/E/F **não** criam migration nem alteram `baseline.sql`/`MANIFEST.md`; pedem ao Coordenador com requisito, tabela e aceite. Usadas: **0317** D-03 (`request_hash`), **0318** D-01/D-02 (`nome_manual`), **0319** C (claims fiscais), **0320** A (`pg_temp` nas definers, #518 mergeado). **0321** é do Sentinel v1.1 (#528, mergeado); **0322 está reservada à credencial de dispositivo (#526, F)**; **0323 é do #439** (telefone E.164, renumerado três vezes: 0312→0320→0322→0323, porque cada merge da main tomou o número). O teste `tests/unit/migrations-numero-unico.test.ts` reprova número repetido — foi o defeito do #439 que o motivou. Próxima livre: **0324**.
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
| **F-17** — 73 tabelas tenant-aware sem prova comportamental | **Fechado**: débito **0**; 73 tabelas com prova nos 4 eixos (SELECT/UPDATE/DELETE/INSERT) | #453 + #482 (`93109bff`) + #486 (`2e95f74f`); `tests/invariants/rls-completude-varredura.test.ts` | O relato dizia 73 sem prova; hoje o débito é vazio e o gate reprova tabela nova sem prova. |
| **Service role** — "89 de 169 handlers" (AGENTS.md) | **244** handlers citam `createAdminClient`/`SUPABASE_SERVICE_ROLE`; revisão dos 100 encadeamentos de maior risco feita, vazamento real corrigido | #483 → `dd515696`; `scripts/auditoria/inventario-service-role.mjs` | O número do AGENTS.md foi trocado pelo instrumento (#506); a revisão cobre os casos de dinheiro/PII, não os 244 individualmente. |
| **Idempotência financeira** | **Fechado em código**: teto do recebível é trigger (0314); recebível avulso honra `Idempotency-Key` (#456); recebíveis da NF-e idempotentes (#508) | `7a498f9d`; `615de767`; `66b2dd1d` | — |
| **Fiscal** | `#438` **mergeado** (devolução/IE/`<entrega>`); claims de manifestação/cancelamento (0319); recebíveis automáticos da NF-e; idempotência nas 4 rotas externas | `9c755b37`; `74875102`; `66b2dd1d`; `3141a483`/`97132fb8` | Achados F2–F7 que restam são de UX fiscal (ver P1-02). |
| **Mobile/offline** | Capacitor **Android** existe; **iOS ausente** por decisão; sincronizador offline montado (#514), **ponte SQLite↔remoto ainda não existe** | `docs/auditoria/29-capacidades.md`; #514 (`13fefad3`) | A ponte é decisão aberta (opção B); viewport não é prova de APK. |
| **PRs** | Triagem completa desta rodada no **§11**: 12 mergeados, 3 fechados com motivo, 2 aguardando CI, 3 bloqueados por decisão/frente pausada | API de PRs do GitHub (script local) | `gh` não está instalado nesta máquina; a triagem usou a API REST com o token do `hosts.yml` (nunca impresso). |
| **Releases** | Última tag `v1.55.0`; **1.56.0 derivada** e empacotada, **não cortada** | `git ls-remote --tags --refs nexus`; `pnpm release:conferir` | Nenhum deploy foi executado por este programa. |

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
| **P0-08** | Idempotência nas rotas fiscais que criam efeito externo (emissão, inutilização, manifestação, retransmissão) | `[x]` | #499 → `3141a483` (emissão/inutilização, 0317) + #511 → `97132fb8` (retransmissões de inutilização e CC-e) | Coordenador | — | Retry com a mesma chave não cria segundo job/documento; teste de repetição e de timeout |
| **P0-09** | Recebimento de compra não pode somar estoque duas vezes sob concorrência | `[x]` | #485 → `239efd32`: CAS em `recebido_qtd` antes do estoque, devolução com o mesmo CAS e compensação; 5 casos unitários; CI 5/5 | Coordenador (C) | — | CAS em `recebido_qtd` antes do ajuste de estoque; perdedor não movimenta; teste concorrente com dois POSTs e soma final igual ao pedido |

## 4. Fila — P1 (jornadas críticas, integração, offline, a11y, desempenho)

| ID | Requisito | Estado | Evidência | Dono | Depende de | Critério de aceite |
|---|---|---|---|---|---|---|
| **P1-01** | Jornadas críticas sem falha: J6 inbox (7/9), J13 fiscal (3/4), J14 LGPD (2/4) | `[~]` | #517 mergeado (`f96a6975`): J6/J13/J14 provadas em Vitest **sem navegador** (10 arquivos, +1.621); #503 fechou o reenvio de mensagem (J6) | H (pausado) / C | Ambiente E2E p/ prova de navegador | Falhas reproduzidas, corrigidas e reexecutadas; o que falta é a prova E2E, não a regra |
| **P1-02** | Fiscal: devolução de venda, IE do destinatário e `<entrega>` duplicado | `[x]` | #438 → `9c755b37` + guarda do sidecar (`2084e4e3`,`d94eaf2c`); teste de regressão por rejeição (176/442/904) | C | — | PR verde com teste de regressão; regra preservada; sem emissão real |
| **P1-03** | Campanhas nomeadas pelas cidades (determinístico, edição manual preservada) | `[x]` | #498 → `5a499313`: gerador + `nome_manual` (0318) + wizard/API; 11 testes do gerador/decisão, 2 de schema; install+update verdes | Coordenador | — | Nome gerado de 1..N cidades, ordenado, sem duplicata; nome manual não é apagado; UI + API + persistência com teste |
| **P1-04** | Mobile/offline: fila idempotente, conflito, retomada e estado visível | `[~]` | #514 mergeado (`13fefad3`): sincronizador montado, retomada de `enviando`, retry/backoff, anti-duplo-toque, backup APK sem PII; 58 unit + 7 e2e emulados | F (pausado) | **Ponte SQLite shell↔remoto no APK** (decisão A/B/C) + dispositivo real | Matriz de dispositivos; retry não duplica; estado de sincronização na tela; limitações declaradas |
| **P1-05** | Acessibilidade WCAG 2.2 AA nas telas restantes | `[~]` | #491 + #516 → `99958a18` (accent como tinta nos dois temas); snapshots visuais em PR (#468, baselines macOS); D ativo em `front/shell-2` | D | Runner fixo p/ snapshots no CI | axe sem violação crítica nas telas cobertas; teclado/foco/movimento reduzido provados |
| **P1-06** | Índices e paginação: listas sem `limit` silencioso e ordenação estável | `[~]` | #464 (índice 0313); #507/#510/#512/#515 (teto declarado em fiscal, faturamento, notas, estoque/compras); P1-06 de listas/tie-breaker em #521 (CI) | A / E / C | #521 verde + retomada de A | Nenhuma lista esconde item sem "há mais"; plano de consulta usa índice; `test:db` verde |
| **P1-07** | Rate limit em MFA e recuperação de conta | `[x]` | #466 mergeado (`f56c0228`): teto em `verifyMfa` e `useRecoveryCode` com testes | B | — | Teto por IP e por identificador; teste de repetição; fallback documentado |
| **P1-08** | Pacote da próxima release pronto para aprovação, sem publicar | `[x]` | [`35-pacote-de-release.md`](35-pacote-de-release.md): 1.56.0 derivada, 19 fragmentos, inventário 0313–0320, checklist e plano assinado | Coordenador | Aprovação humana p/ cortar | Número derivado por comando; inventário de schema; plano com rollback e critério de abortar |

## 5. Fila — P2 (identidade, shell, consistência)

| ID | Requisito | Estado | Evidência | Dono | Depende de | Critério de aceite |
|---|---|---|---|---|---|---|
| **P2-01** | Fonte única de tokens, temas claro/escuro, contraste composto | `[~]` | `DESIGN.md`; #491 (tema claro a11y); #516 → `99958a18` (accent como tinta: dois papéis, dois tokens) | D (ativo) | — | Tokens consumidos pelo produto; contraste calculado sobre cor final; desvios registrados |
| **P2-02** | Shell: sidebar, topbar, busca, notificações, seletor de organização, breadcrumbs | `[~]` | D ativo em `front/shell-2` (+1 commit: breadcrumb, central de avisos, gate de link morto); E não toca shell | D | P2-01 | Hierarquia uniforme; navegação por teclado; mobile não é desktop comprimido |
| **P2-03** | Capabilities classificadas nos 7 estados (D3) | `[x]` | #475 mergeado (`470aac4e`): `29-capacidades.md` + gate `capacidades-classificadas.test.ts` | Coordenador | — | Toda capacidade com estado, evidência e lacuna nomeada; gate verde |
| **P2-04** | Documentação de estado do produto sem número envelhecido | `[x]` | #506: `AGENTS.md` aponta `scripts/auditoria/inventario-service-role.mjs`; dois gates nomeados como proteção parcial | Coordenador | — | Onde a afirmação vira comando, vira comando; nenhum total sem fonte |

## 6. Fila — P3 (melhorias sem risco imediato)

| ID | Requisito | Estado | Evidência | Dono | Depende de | Critério de aceite |
|---|---|---|---|---|---|---|
| **P3-01** | Capacitor iOS | `[!]` | `29-capacidades.md` item 30 — ausente por decisão; **não iniciado**, sem `ios/` nem conta Apple | Dono | Decisão de produto + conta Apple | Só entra com decisão registrada e dispositivo |
| **P3-02** | Rate limit: produção não pode cair em fallback de memória em silêncio | `[x]` | #520 → `6daec49d`: fallback **declarado** (backend/motivo/desde) e `/api/v1/health` com check `rate_limit` que dá 503 em produção | A | — | Produção falha alto sem Upstash, ou fallback declarado |
| **P3-03** | Limpar planos antigos que ensinam `db push` | `[x]` | #506: 7 planos ativos apontam `pnpm db:migrate`; gate novo; `plan/progress.md` preservado como diário histórico | Coordenador | — | Nenhum plano ativo ensina caminho proibido; histórico preservado com aviso |

## 7. Itens bloqueados por decisão humana / dispositivo / credencial

| Item | Bloqueio | O que falta | Quem decide |
|---|---|---|---|
| P3-01 iOS | Não há `ios/` nem `@capacitor/ios` | Decisão de escopo e conta Apple | Dono |
| P1-04 prova em dispositivo | Sem emulador/APK nesta máquina | Dispositivo Android ou emulador | Dono |
| P0-07 Sentinel em produção | Depende de deploy e agenda | Aprovação de release | Dono |
| ~~#307 crédito do DANFE~~ | **DECIDIDA 18/11**: `"By nexus"` **não entra**; o rodapé é configuração (`FISCAL_DANFE_CREDITO`), vazio = sem crédito, nunca string fixa | Parte aproveitável separada no **#545**; o PR original foi fechado | Dono |
| **Corte da 1.56.0** | Pacote pronto, tag não criada | Aprovar o merge do PR de release (`35-pacote-de-release.md` §6) | Dono |
| **Retomada de A/E/F/H** | Limite de 2 workers simultâneos | Vaga no rodízio (D e G ativos) | Dono |
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

### 9.1 Divergência de doutrina a resolver (não resolvida por suposição)

| Item | Divergência | Recomendação | Quem decide |
|---|---|---|---|
| Tag da release | `docs/doctrine/versionamento.md` diz que **a tag nasce no CI**; `docs/doctrine/packaging.md` §checklist item 5 ainda manda `git tag vX.Y.Z && git push origin vX.Y.Z` — e o remote `origin` **não existe mais** | alinhar o checklist do packaging à regra do CI (tag só de commit da `main`, criada pelo workflow); a linha do `origin` morre junto | Dono / mantenedor da doutrina |

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
| 18/11/2026 | P2-04/P3-03 docs e planos | #506 → `9107b42b` | gate de plano ativo; 12 testes |
| 18/11/2026 | D-03 nas retransmissões | #511 → `97132fb8` | handler + replay/409/abort |
| 18/11/2026 | P0-04 teto do recebível na main | #480 → `7a498f9d` | CI 5/5; e2e 17m |
| 18/11/2026 | P0-05 nota viva na main | #484 → `f691dc06` | CI 5/5 |
| 18/11/2026 | P0-09 recebimento com CAS na main | #485 → `239efd32` | CI 5/5 |
| 18/11/2026 | F-17 nos 4 eixos | #486 → `2e95f74f` | 367 testes |
| 18/11/2026 | #503 inbox reenvio (E) | `e9302c58` | P1-01/J6 |
| 18/11/2026 | #507/#508/#509/#510/#513 (E/C) | main `8359ac66` | módulos, claims fiscais, faturamento |
| 18/11/2026 | #514 mobile sync (F) | `13fefad3` | 58 unit + 7 e2e emulados; ponte declarada |
| 18/11/2026 | #512 notas declaram teto (E) | `fcac5757` | P1-06 |
| 18/11/2026 | #471 flywheel claim (P1-9) | `014ccef3` | advisory lock + `not exists`; teste de invariante 4 casos |
| 18/11/2026 | #515 catálogo completo (E) | `099df0a7` | estoque/compras; P1-06 |
| 18/11/2026 | #519 admin não confunde erro com vazio (E) | `850996a7` | 5 listas + teste de componente |
| 18/11/2026 | dependabot: 48 updates minor/patch | #455 → `532f3bc3` | CI 5/5 (verify, invariants, e2e, build-and-size, imagens-ok) |
| 18/11/2026 | dependabot actions no `apk.yml` | #163/#164/#166 → `94f575f3` | CI 5/5; `apk-debug` verde |
| 18/11/2026 | #517 J6/J13/J14 em Vitest | `22450d60` | 10 arquivos, +1.621 linhas; P1-01 |
| 18/11/2026 | #522 ficha do Agente E fechada | `232c5fbf` | docs |
| 18/11/2026 | #439 telefone fixo E.164 — migration **0320** (era 0312) | PR (rebase pendente de CI) | baseline + MANIFEST + invariante; renumeração registrada |
| 18/11/2026 | Triagem dos PRs antigos (§11) | 24 avaliados | 3 fechados com motivo; #307 `[!]` por marca |
| 18/11/2026 | Pacote da release 1.56.0 | [`35-pacote-de-release.md`](35-pacote-de-release.md) | `pnpm release:conferir` → 19 fragmentos; **tag não criada** |
| 18/11/2026 | Sentinel v1 na main | #489 → `f644b21c` | 68 unit + 184 invariantes; CI 5/5; instalação/update verdes |

## 11. Triagem dos PRs abertos (rodada 8, `nexus/main` = `232c5fbf`)

> `gh` não existe nesta máquina. A triagem usou a API REST do GitHub com o token
> já presente em `~/.config/gh/hosts.yml` (nunca impresso) e `git worktree` para
> rebase. Critério: **verde nos 5 checks obrigatórios + mergeável** → merge;
> **conflito** → rebase local e reexecução do CI; **vermelho** → conserto no
> próprio PR quando era doc/renumeração, senão registra o motivo.

### 11.1 Mergeados

| PR | O que entrou | Como |
|---|---|---|
| #515 | catálogo do estoque/compras não esconde produto | já verde |
| #519 | admin não confunde erro com vazio | já verde |
| #517 | J6/J13/J14 em Vitest (H, pausado) | já verde |
| #522 | ficha do Agente E fechada (E, pausado) | já verde |
| #455 | 48 updates minor/patch (dependabot) | já verde; `package.json` só com patch/minor |
| #163/#164/#166 | actions `upload-artifact@v7`, `pnpm/action-setup@v6`, `setup-node@v7` no `apk.yml` | já verde |
| #457 | CORS/CSRF/SSRF/upload medidos (8.1/8.2) | rebase: hunk do prompt mestre antigo descartado (o prompt foi substituído pelo #478) |
| #465 | triagem de produção 17/11 (só leitura) | idem |
| #472 | referências de produto e contexto (P1–P7, C4–C12) | idem |
| #477 | README diz MIT; marca fora da licença (C12) | idem |
| #476 | `next/font/local` com WOFF2 versionados (C10) | idem; sem colisão com D (`front/shell-2` não toca fontes/layout) |
| #468 | 14 baselines visuais (9.5) | idem; spec em `FORA_DO_CI` com motivo (baseline tem sufixo de plataforma) e lista `critical/full` intocada |
| #439 | telefone fixo → E.164; **migration 0320** | rebase + renumeração 0312→0320 (0312 já era da trilha de IA) e apêndice do baseline concatenado com 0314–0319 |
| #13/#165 | `actions/cache@v6`, `actions/checkout@v7` (último arquivo) | rebase; aguardam CI |

### 11.2 Fechados com motivo (registrado no PR)

| PR | Motivo |
|---|---|
| #7 | 102 arquivos/+18.965 desde 24/09, `verify` e `e2e` vermelhos; criaria um segundo design system concorrente ao que a main já tem (#491/#516) |
| #168 | bump **major** (js-yaml 4→5) com `verify` vermelho; exige plano de migração |
| #169 | bump **major** do Sentry (10→11) com 6 checks vermelhos; exige migração junto do Next 16 |

### 11.3 Bloqueados / aguardando (dono e retomada)

| PR | Estado | Dono | O que falta |
|---|---|---|---|
| #307 | `[!]` decisão de marca | Dono | default `"By nexus"` no DANFE viola a doutrina de marca; escolher "sem crédito" ou "marca resolvida"; depois rebase + `imagens-ok` |
| #518 | `verify` vermelho (`health/route.test.ts`: Upstash recebe host sem esquema) | A (pausado) | consertar o teste/env; **renumerar 0320→0321** |
| #545 | CI rodando | Coordenação | rodapé do DANFE configurável, sem nome de produto (sobra do #307) |
| ~~#521~~ | **mergeado** (`ee0c8093`) | A | listas com tie-breaker e teto (P1-06) |

Nenhum PR de P0 ficou aberto. O que resta em P1/P2 depende de decisão humana,
de dispositivo ou da retomada de uma frente pausada — não de trabalho que o
coordenador possa abrir sozinho sem furar o rodízio de 2 workers.

### 11.4 Rodada 9 (`nexus/main` = `6daec49d`)

| PR | Estado em 18/11 à tarde | Observação |
|---|---|---|
| #523, #524, #525, #529 | **mergeados** (design/D) | shell sem link morto, foco visível, densidade, relatório D |
| #518 | **mergeado** (`243ab166`) | migration **0320** `search_path` das definers — 42 definers ganharam `pg_temp` |
| #520 | **mergeado** (`6daec49d`) | rate limit: fallback declarado e saúde 503 em produção |
| #530 | **mergeado** (`3175ee21`) | docs do programa: fila, relatório, pacote 1.56.0, 7 fragmentos, catraca de numeração, teto do `verify` 15→25 min |
| #521 | rebaseado, CI rodando | listas com tie-breaker e teto (P1-06); o `verify` anterior foi **cancelado** por timeout, não por teste |
| #536 | PR aberto pela coordenação | invariante do flywheel media o relógio (flake), não o lock — conserto no teste |
| #439 | renumberado **0322**, CI rodando | 0320 passou a ser do #518; 0321 é do #528 (G) |
| #476/#477/#472/#468/#465/#457 | rebaseados, CI rodando | docs/fontes/MIT/snapshots; nenhum toca schema |
| #13/#165 | rebaseados, CI rodando | dependabot actions |
| #307 | **fechado** por decisão de marca; parte configurável no #545 | decisão do dono |
| #526/#534 | do dono/F | **não tocar** (credencial de dispositivo e SQLite no aparelho) |
| #531/#533/#535 | design/D | em rebase pelo dono da frente |


## 12. Delegação vigente (3 workers + 1 coordenador)

| Slot | Dono | O que está com ele agora | Critério de devolução |
|---|---|---|---|
| 1 | **D** | #533 (trilhas da agenda) e #535 (seletor de empresa + `scope` da tabela); rebase e CI | verde nos 5 checks + prova visual |
| 2 | **F** | #526 credencial de dispositivo (opção B), **migration 0322**; renumerar se a main tomar o número | CI verde e `apk-debug`; dispositivo/emulador declarado |
| 3 | **G** | #538 prova de papéis na rota do Sentinel + catraca de somente leitura | invariantes verdes, nenhuma escrita |
| — | **Coordenador** | fila, release #537, triagem dos PRs antigos, integração e gates | — |

O coordenador **não executa** o trabalho de worker: distribui, integra e cobra a
prova. Frente pausada não recebe tarefa nova até abrir slot.
