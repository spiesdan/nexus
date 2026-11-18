# F-17 — o eixo de ESCRITA do isolamento (as 73 tabelas da antiga dívida)

> Medido em 18/11/2026 por execução, em Postgres 15 descartável
> (`pgvector/pgvector:pg15`) com o `baseline.sql` aplicado. Evidência bruta:
> [`evidencias/f17/varredura-2026-11-18.txt`](evidencias/f17/varredura-2026-11-18.txt)
> — 367 casos, todos verdes. Nenhum banco remoto foi tocado.

## 1. O que já estava fechado — e o que faltava

A dívida de isolamento de 73 tabelas tenant-aware foi paga em duas frentes:

| PR | Tabelas | Eixos provados |
|---|---|---|
| #453 (`rls-camadas-restantes-do-debito.test.ts`) | 39 | **leitura**: 0 linhas cross-org + controle positivo na própria org |
| #482 (`f17-restantes-do-debito.test.ts`) | 34 | **leitura**: idem |
| `DEBITO_CONHECIDO` | — | ficou **vazio** |

O escopo de F-17 pede **leitura e escrita**. Nenhum dos dois arquivos tenta
escrita cross-org (`writeCountAs`, `update … where organization_id`, `delete`
ou `insert` com a org vizinha): medido por `grep` nos dois arquivos em `main`.

Este documento e o teste que ele descreve cobrem o eixo que faltava — nas
mesmas 73 tabelas, com seed próprio.

## 2. O que este teste prova

`tests/invariants/rls-varredura-comportamental.test.ts` semeia uma linha por
organização em cada uma das 73 (replica mode: mede a **policy**, não o trigger)
e, com o JWT de um **admin** da org A, mede cinco coisas por tabela:

| Eixo | Pergunta | Resultado medido |
|---|---|---|
| SELECT da org B | o admin de A vê linha de B? | **0** em 73/73 |
| SELECT da própria org | vê as próprias? (controle positivo) | **≥1** em 71/73; 2 negadas por desenho |
| **UPDATE da org B** | alcança linha de B? | **0** (ou recusa `42501`) em 73/73 |
| **DELETE da org B** | apaga linha de B? | **0** (ou recusa `42501`) em 73/73 |
| **INSERT declarando a org B** | entra? | **recusado** em 73/73 |

E o par que impede vacuidade: o INSERT na **própria** organização é aceito pela
policy (ou barrado por constraint, o que prova que o WITH CHECK deixou passar)
em 68/73. As 5 que recusam (`ai_budgets`, `event_log`, `incidents`,
`webhook_events_log`, `calendar_oauth_nonces`) o fazem no **privilégio**:
`authenticated` não tem GRANT de escrita — recusa mais forte, não menor. A
lista está nomeada em `SEM_INSERT_PARA_AUTHENTICATED`, com a razão.

As duas sem controle positivo de leitura estão em `SEM_LEITURA_POR_DESENHO`:

- `incidents` — a única policy é `platform_admin_only_incidents`
  (`fn_is_platform_admin()`): um admin de tenant lê 0 linhas **inclusive as da
  própria organização**, por desenho de plataforma;
- `calendar_oauth_nonces` — policy `SELECT false` e nenhum GRANT para
  `authenticated`: a leitura é negada no privilégio.

## 3. Por que o eixo de escrita não é redundante

Os dois vazamentos medidos neste repositório foram **de escrita** e de
predicado que devolvia a organização inteira:

- `org_guardrail_layers` (migration 0143): `relrowsecurity = true`, policy
  presente, e um `viewer` conseguia **desligar** a camada anti-jailbreak pelo
  PostgREST — `UPDATE 1 + INSERT 1`. Nenhuma checagem de catálogo pegava.
- `sendMessageHandler` (corrigido nesta mesma rodada): com service role, o
  `conversation_id` de outro tenant virava envio real para o cliente dele.

Um teste só de `SELECT` teria passado nos dois. O eixo de escrita é o que pega
`WITH CHECK` ausente, `UPDATE` sem `USING` ou policy `ALL` com predicado pela
metade.

## 4. Um caso que só o teste comportamental explica

`crm_lead_activities` recusa o INSERT cross-org com `23503`
(`lead_org_mismatch`), não com `42501`: o trigger `BEFORE INSERT`
`fn_validate_activity_lead_org()` roda **antes** do `WITH CHECK` e compara a
organização do lead com a da atividade. A linha nunca chega à policy.

O arquivo trata o caso pela propriedade observável — **a linha cross-org não
entra** — e registra o mecanismo. Não é vacuidade: o INSERT na própria org do
mesmo par é aceito quando a policy permite, como nos outros 67.

## 5. Limites declarados

- **Leitura cross-org** é provada em dois eixos aqui (SELECT de B = 0 e
  controle positivo), mas a cobertura canônica de leitura das 73 é a de
  #453/#482 — esta entrega não as substitui, soma o eixo de escrita.
- **Não cobre `SECURITY DEFINER`**: medido em `definer-valida-membership.test.ts`
  e `hardening-definer-varredura.test.ts`.
- **Não cobre worker/cron** com `service_role` (bypassa RLS por definição): o
  que os protege é o filtro no ponto de uso — ver `service-role-revisao.md`.
- **O seed é sintético**: uma linha por tabela prova o predicado da policy, não
  comportamento sob volume.
- **O papel medido é `admin`**: gates de papel mais baixo (`agent`, `viewer`)
  ficam nos arquivos por módulo (`catalogo-so-gestor-muda-preco`,
  `historico-de-captacao-rls`, `gov-*`). Aqui o alvo é o eixo **organização**.

## 6. Reproduzir

```bash
pnpm test:db -- tests/invariants/rls-varredura-comportamental.test.ts
```

O caso imprime, por tabela, `selB`/`selA`/`updB`/`delB`/`insB`/`insA` na
mensagem de falha — um vazamento aponta a tabela e o eixo, não "a suíte ficou
vermelha".
