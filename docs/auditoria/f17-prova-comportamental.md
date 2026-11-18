# F-17 — fechamento da dívida de isolamento (73 tabelas)

> Fase 6 · F-17. Medido em 18/11/2026 sobre `front/db-seguranca` (base `9ddc9005`),
> em Postgres 15 descartável (`pgvector/pgvector:pg15`) com o `baseline.sql`
> aplicado. Nenhum banco remoto foi tocado.
>
> Evidência bruta: [`evidencias/f17/varredura-2026-11-18.txt`](evidencias/f17/varredura-2026-11-18.txt)
> — 367 casos, todos verdes.

## 1. O que estava aberto

`docs/auditoria/12-migrations-e-rls.md` §5.2 media a dívida e era explícita sobre o
que ela significava: das ~169 tabelas tenant-aware, **73** tinham RLS ligado, policy
presente e **nenhum** teste que simulasse o JWT e contasse linha cross-org. A lista
`DEBITO_CONHECIDO` de `tests/invariants/rls-completude-varredura.test.ts` era a
fotografia dessa dívida, e o gate só impedia que ela crescesse.

O cabeçalho daquela varredura também dizia por que a contagem de catálogo não bastava:
`org_guardrail_layers` tinha `relrowsecurity = true` e uma policy — e a policy
devolvia a organização inteira do vizinho (`... or true`). **RLS ligada + policy
presente não é isolamento.**

## 2. O que passou a existir

`tests/invariants/rls-varredura-comportamental.test.ts`: uma linha por organização
em cada uma das 73 tabelas (seed próprio, `session_replication_role = replica` para
não disparar trigger de aplicação), e o JWT de um **admin** da org A — papel que
passa pelos gates `fn_role_at_least(..., 'admin')` que várias dessas policies usam.

Quatro eixos, todos executados por tabela:

| Eixo | Pergunta | Resultado medido |
|---|---|---|
| SELECT da org B | o admin de A vê linha de B? | **0** em 73/73 |
| SELECT da própria org | vê as próprias? (controle positivo) | **≥1** em 71/73; 2 negadas por desenho |
| UPDATE/DELETE da org B | alcança linha de B? | **0** (ou recusa `42501`) em 73/73 |
| INSERT declarando a org B | entra? | **recusado** em 73/73 |

E o par que impede vacuidade: o INSERT na **própria** organização é aceito pela policy
(ou barrado por constraint, o que prova que a policy deixou passar) em 68/73. As 5 que
recusam (`ai_budgets`, `event_log`, `incidents`, `webhook_events_log`,
`calendar_oauth_nonces`) o fazem no **privilégio**: `authenticated` não tem GRANT de
escrita, então a escrita é exclusivamente server-side — recusa mais forte, não menor.
A lista está nomeada em `SEM_INSERT_PARA_AUTHENTICATED`, com a razão.

As duas sem controle positivo de leitura estão em `SEM_LEITURA_POR_DESENHO`:

- `incidents` — a única policy é `platform_admin_only_incidents`
  (`fn_is_platform_admin()`): um admin de tenant lê 0 linhas **inclusive as da própria
  organização**, por desenho de plataforma;
- `calendar_oauth_nonces` — policy `SELECT false` e nenhum GRANT para
  `authenticated`: a leitura é negada no privilégio.

Nenhuma das duas deixa de ser medida: os eixos de escrita continuam valendo para elas.

### 2.1 Papel mais baixo (viewer) — adicionado em 18/11/2026

O eixo de admin prova que a **organização** filtra; não prova que a policy não
deixa um `viewer` atravessar — e foi um `viewer` que, na 0143, desligou a
camada anti-jailbreak pelo PostgREST. Cada uma das 73 passa a ser medida também
com o JWT de um **viewer** da org A:

| Eixo do viewer | Resultado medido |
|---|---|
| SELECT da org B | **0** ou recusa em 73/73 |
| UPDATE da org B | **0** ou recusa em 73/73 |
| INSERT declarando org B | **recusado** em 73/73 |
| SELECT da própria org | **≥1** em todas as tabelas cuja policy **não** cita `fn_role_at_least` (a lista de gates vem do catálogo, não de suposição) |

Nas tabelas com gate de papel, o viewer poder ler 0 da própria org é **correto**
— e o teste não cobra o contrário. O que ele cobra sempre é o eixo cross-org.

### 2.2 Volume: 2+ linhas onde a tabela permite

Uma linha só não distingue "a policy filtra por organização" de "a policy
devolve no máximo uma linha". Cinco tabelas sem UNIQUE que impeça a duplicata
ganham **duas linhas por organização** (`event_log`, `lead_notes`,
`conversation_notes`, `orders`, `webhook_events_log`), e o teste exige 2+/2+ e
cross-org = 0 mesmo com multiplicidade. As demais 68 têm UNIQUE por
`(organização, …)` e ficam com uma linha — limite declarado.

## 3. Um caminho que só o teste comportamental pega

`crm_lead_activities` recusa o INSERT cross-org com `23503` (`lead_org_mismatch`), e
não com `42501`. A razão é ordem de execução: o trigger `BEFORE INSERT`
`fn_validate_activity_lead_org()` roda **antes** do `WITH CHECK` da policy e compara a
organização do lead com a da atividade. A linha nunca chega à policy.

Isso importa porque um teste que só olhasse o catálogo diria "policy existe" e um teste
que só olhasse o SQLSTATE esperaria `42501`. O arquivo trata o caso pela propriedade
observável — **a linha cross-org não entra** — e a doc registra o mecanismo. Não é
vacuidade: o INSERT na própria org do mesmo par (lead de A + org A) é aceito quando a
policy permite, como os outros 67.

## 4. Estado da dívida

`DEBITO_CONHECIDO` **deixou de existir**. Duas frentes pagaram a dívida, e a varredura
de completude soma as duas: `rls-camadas-restantes-do-debito.test.ts` provou **39**
tabelas nos eixos de leitura (com `PROVA_PROPRIA` citando o arquivo), e a varredura deste
documento prova **as 73** nos quatro eixos — inclusive as 39, com eixo de escrita.
`TABLES` (teste por tabela em `rls-isolation.test.ts`), `PROVA_PROPRIA` e
`PROVADA_POR_VARREDURA` são as três classes com prova; tabela tenant-aware nova continua
reprovando até entrar em uma delas. A catraca não afrouxou — a dívida que ela protegia
foi paga.

Contagem reconciliada (medida no mesmo banco, via catálogo):

| Medida | Antes | Depois |
|---|---|---|
| Tabelas com `organization_id` | 169* | 169* |
| Com prova comportamental | 96 | **169** |
| Dívida conhecida (`DEBITO_CONHECIDO`) | 73 | **0** |

\* a varredura só exige `>= 90` para não reprovar a cada tabela nova; o número exato é
recontado pelo caso de inventário do arquivo.

## 5. Limites desta prova (declarados)

- **Não cobre caminho indireto de função.** `SECURITY DEFINER` que recebe
  `organization_id` e não valida membership é medido por
  `tests/invariants/definer-valida-membership.test.ts` e
  `hardening-definer-varredura.test.ts`, não aqui.
- **Não cobre job/cron.** O worker e os crons rodam com `service_role` (bypassa RLS por
  definição); o que os protege é o filtro de organização no ponto de uso — item
  separado desta entrega (`service-role-revisao.md`).
- **Export.** A única rota de export é `app/api/v1/audit/export/route.ts` (CSV de
  `api_audit_log`, até 10k linhas). Ela usa `requireRole("manager")` + client de
  usuário (RLS) **e** filtra `.eq("organization_id", activeOrg.orgId)` explicitamente —
  e `api_audit_log` é uma das 73 tabelas provadas aqui.
- **O seed é sintético.** Uma linha por tabela (duas em 5 delas, §2.2) não prova
  ordenação nem paginação — prova o predicado da policy, que é o que vaza entre
  tenants.
- **Os papéis medidos são `admin` e `viewer`.** O `agent` especificamente, e gates
  finos (`manager`), ficam nos arquivos por módulo
  (`catalogo-so-gestor-muda-preco`, `historico-de-captacao-rls`, `gov-*`).

## 6. Reproduzir

```bash
pnpm test:db -- tests/invariants/rls-varredura-comportamental.test.ts
pnpm test:db -- tests/invariants/rls-completude-varredura.test.ts
```

O primeiro imprime, por tabela, `selB`/`selA`/`updB`/`delB`/`insB`/`insA` na mensagem
de falha — um vazamento aponta a tabela e o eixo, não "a suíte ficou vermelha".
