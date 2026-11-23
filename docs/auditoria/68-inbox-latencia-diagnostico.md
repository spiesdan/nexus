# P0-8 — Diagnóstico de latência de `/api/v1/conversations` (23/11/2026)

> **Não otimizei nada.** Sem `EXPLAIN (ANALYZE, BUFFERS)` em produção, propor
> índice ou reescrever query seria mexer no escuro. O que segue é o diagnóstico
> com o EXPLAIN que **consegui rodar** (banco local do seed), com o volume
> declarado — e o que falta medir na VPS.

## Sintoma medido pelo dono

`/api/v1/conversations`: **259 amostras, p95 2673 ms** (p50 ≈ 2 s), 0 erros.
É 97% das 267 amostras do SLO; p95 geral 2660 ms contra alvo 800 ms.

## O caminho da rota

`GET /api/v1/conversations` → `listConversationsHandler` (client de sessão,
RLS) → `comNomeDoAtendente` na borda:

- `SELECT_COLS` traz 25 colunas, incluindo `metadata` (jsonb),
  `last_message_preview`, `tags` e **dois embeds** (`contacts`, `channel_sessions`);
- ordenação: `last_message_at DESC NULLS LAST, id DESC`, `limit = q.limit + 1`;
- policy de leitura: `conversations_select` =
  `fn_can_view_conversation(organization_id, assigned_to_user_id)` **E**
  `fn_can_view_channel(organization_id, channel_session_id)`;
- ambas são `STABLE SECURITY DEFINER` e chamam `fn_user_role_in_org(p_org)`
  (duas vezes em `fn_can_view_conversation`) — ou seja, **por linha candidata**.

## EXPLAIN (ANALYZE, BUFFERS) — banco local do seed (61 conversas)

Como `postgres` (sem RLS), query equivalente com os dois joins:

```
Limit (actual time=0.011..2.147 rows=51)
 -> Sort (actual time=2.143..2.149 rows=51)  Sort Key: c.last_message_at DESC NULLS LAST, c.id DESC
    -> Hash Left Join (actual 0.527..1.239 rows=61)
       -> Hash Right Join (actual 0.271..0.966 rows=61)
          -> Seq Scan on contacts (rows=222)
          -> Seq Scan on conversations (rows=61)  Buffers: shared hit=3
       -> Seq Scan on channel_sessions (rows=8)
 Execution Time: 2.161 ms
```

Como `authenticated` com JWT de membro (RLS ligada), **mesmo banco, mesmas 61
linhas**:

```
Limit (actual time=67.158..67.170 rows=51)   Buffers: shared hit=772
 -> Sort (actual time=67.156..67.164 rows=51)
    -> Seq Scan on conversations (actual time=23.954..65.480 rows=61)
       Filter: (organization_id = ... AND
                fn_can_view_conversation(organization_id, assigned_to_user_id) AND
                fn_can_view_channel(organization_id, channel_session_id))
       Buffers: shared hit=766
 Planning Time: 6.184 ms   Execution Time: 67.278 ms
```

Com os embeds e RLS:

```
Limit (actual 24.822..24.840 rows=51)  Buffers: shared hit=841
 -> Sort (actual 24.820..24.832)  Sort Key: c.last_message_at DESC NULLS LAST, c.id DESC
    -> Nested Loop Left Join (actual 22.442..24.622 rows=61)
       Rows Removed by Join Filter: 214
       -> Hash Right Join ... Seq Scan on conversations (rows=61, Buffers hit=754)
       -> Materialize on channel_sessions (loops=61, Buffers hit=71)
 Execution Time: 35.719 ms
```

**O que o EXPLAIN mostrou:** com RLS, o mesmo conjunto de 61 linhas custa
**67 ms contra 2 ms** sem RLS (~31×) e consome ~766 buffers na varredura — as
duas funções de policy rodam **por linha candidata**. O planejador estima
`rows=6` onde há 61 (subestima o seletivo por causa das funções), escolhe
`Seq Scan` + `Nested Loop`/`Materialize` e faz o **Sort depois dos joins**, em
vez de usar o índice. É uma forma de plano que degrada linearmente com o número
de conversas da organização — compatível com ~2 s de p50 em produção.

Índice existente: `idx_conversations_org_last_msg (organization_id,
last_message_at DESC NULLS LAST)` — cobre a ordenação, **mas não o desempate
`id DESC`**, e o plano com RLS não o escolheu nem localmente. **Não mexer nele
sem o EXPLAIN de produção.**

## Segunda hipótese (fora do banco): fallback de nome

`comNomeDoAtendente` chama `nomesDosAtendentes` **só** para linhas com
`assigned_to_user_id` preenchido e `assigned_to_user_name` nulo. O helper faz
**uma chamada HTTP ao GoTrue Admin API por id único**; o próprio arquivo mediu
~60 ms para 1, ~350 ms para 10, ~1,2 s para 50. No seed local, 0 de 14 linhas
atribuídas estão nessa condição — mas em produção isso pode ser a diferença
entre 300 ms e 2 s se o backfill da 0202 não alcançou linhas antigas.

## O que PRECISO medir na VPS (read-only) antes de propor conserto

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U postgres -d postgres <<'SQL'
-- 1) o plano real, com a policy e o volume de produção
explain (analyze, buffers)
select c.id, ct.display_name, cs.phone_number
from public.conversations c
left join public.contacts ct on ct.id = c.contact_id
left join public.channel_sessions cs on cs.id = c.channel_session_id
where c.organization_id = '<org da medição>'
order by c.last_message_at desc nulls last, c.id desc
limit 51;

-- 2) quantas linhas pagam o fallback de nome por GoTrue
select count(*) filter (where assigned_to_user_id is not null) as atribuidas,
       count(*) filter (where assigned_to_user_id is not null
                          and assigned_to_user_name is null) as sem_nome
from public.conversations where organization_id = '<org da medição>';

-- 3) volume e seletividade que alimentam o Sort
select count(*) as total, count(last_message_at) as com_data
from public.conversations where organization_id = '<org da medição>';
SQL
```

## Decisão

Nenhuma otimização aplicada nesta fatia: nem índice novo, nem mudança de query,
nem desligar RLS. Com os três números acima é possível escolher entre (a)
reduzir chamadas de policy por linha, (b) corrigir o backfill do nome, e (c)
estender o índice com `id` — cada um com sua própria medição antes/depois.
