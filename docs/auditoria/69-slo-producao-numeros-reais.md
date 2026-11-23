# P0-7/P0-8 — SLO de produção medido e latência do Inbox (23/11/2026)

> Números **medidos pelo dono em produção**, read-only. O doc antigo que dizia
> "sem série" (PR #809) foi **fechado** — estava errado. A leitura correta dos
> dados está no PR #810; este doc só registra a medição e o que ainda falta.

## Série de 7 dias (produção)

| Rota | Amostras | p95 |
|---|---:|---:|
| `/api/v1/conversations` | **259** | **2673 ms** |
| `/api/v1/commercial-orders` | 3 | 1378 ms |
| `/api/v1/contacts` | 4 | 1052 ms |
| `/api/v1/invoices` | 1 | 971 ms |
| **Total** | **267** | **2660 ms** |

0 erros 5xx. Alvo: **p95 ≤ 800 ms** → **estourado**. Não é afirmação de QA:
são os números que o dono leu na VPS.

## Causa do "detector cego"

`fn_slo_api_resumo` é `returns table(total, erros, p95)`; o `rpc()` devolve
`[{total:267,erros:0,p95:2660}]`. Os dois leitores liam como objeto → `total=0`
→ detector `null`, painel "sem histórico". PR #810 normaliza uma vez
(`lib/observabilidade/linha-rpc.ts`) e corrige **os dois**:
`lib/sentinel/coleta.ts` e `app/api/v1/admin/observabilidade/route.ts`.
Teste dirigido com 267/2660 prova `total > 0` no painel e na coleta e a abertura
de `plataforma.slo_estourado|latencia` com severidade **crítica**.

Pós-deploy: a próxima varredura deve abrir a ocorrência e o painel deve mostrar
267 amostras — é a prova que falta.

## SQL exato da listagem (equivalente ao `GET /api/v1/conversations`)

`; organization_id = $1, status = $2 (opcional), limit = $3 (default 50)`
PostgREST monta algo equivalente a:

```sql
select
  c.id, c.organization_id, c.contact_id, c.channel_session_id, c.channel, c.status,
  c.status_changed_at, c.assigned_to_user_id, c.assigned_to_user_name, c.assignee_kind,
  c.assigned_at, c.last_inbound_at, c.last_outbound_at, c.last_message_at,
  c.last_message_preview, c.unread_count_for_assignee, c.is_group, c.group_chat_id,
  c.tags, c.metadata, c.snooze_until, c.created_at, c.updated_at,
  c.bot_silenced_until, c.last_handoff_at, c.last_handoff_reason, c.comando_da_conversa,
  ct.id, ct.display_name, ct.name, ct.phone_number, ct.is_anonymized, ct.tags,
  ct.is_blocked, ct.avatar_storage_path, ct.force_human, ct.source,
  cs.phone_number, cs.display_name, cs.provider
from public.conversations c
left join public.contacts ct on ct.id = c.contact_id
left join public.channel_sessions cs on cs.id = c.channel_session_id
where c.organization_id = $1
  and ($2::text[] is null or c.status = any($2))   -- só quando ?status é enviado
order by c.last_message_at desc nulls last, c.id desc
limit $3 + 1;
```

Sem `select("*")`. **Não há consulta de mensagens nem de contadores** nesta
rota: `last_message_preview` e `unread_count_for_assignee` são colunas da própria
`conversations`; os dois joins trazem só campos de contato/canal. O `limit`
padrão é **50** (`lib/schemas/messaging.ts:330`), com +1 para `has_more`.

Filtros opcionais do handler que **não** estão no SQL acima (se a tela os
enviar): `comando_da_conversa in (...)`, `status not in (...)`,
`channel_session_id = ...`, `tags @> [...]` (GIN), `assigned_to_user_id = ...`
ou `is null`, `last_message_preview ilike`/`contact_id in (...)` quando há
`?search`, e o cursor de paginação. Cada um entra no `WHERE`.

## Round-trips por requisição

| Etapa | Quantidade | Tipo |
|---|---:|---|
| `getUser()` na borda da rota | 1 | HTTP GoTrue |
| `loadAuthUser()` → `getUser()` interno | 1 | HTTP GoTrue |
| `platform_admins` + `user_organizations` | 2 (em `Promise.all`) | PostgREST |
| listagem de conversas (com 2 embeds) | 1 | PostgREST |
| busca de contatos por nome/telefone | 0 ou 1 (só com `?search`) | PostgREST |
| `comNomeDoAtendente` fallback | **0 ou N** | HTTP GoTrue Admin, **1 por atendente distinto** com `assigned_to_user_id` preenchido e `assigned_to_user_name` nulo |

**Base: 5 round-trips**, não 1. O código mediu GoTrue fallback em ~60 ms (1),
~350 ms (10), ~1,2 s (50); e cada ida ao Supabase em produção ~182–225 ms
(`lib/auth/server.ts`). Um EXPLAIN de uma única query **não** explica 2,6 s:
o tempo pode estar somado antes da listagem (auth) e no fallback de nomes.

## O que falta medir para fechar o diagnóstico

1. `EXPLAIN (ANALYZE, BUFFERS)` do SQL acima em produção (doc 68 traz o comando).
2. `count(*) filter (where assigned_to_user_id is not null and assigned_to_user_name is null)` —
   se for dezenas, o fallback de nome é o maior pedaço do p95.
3. Tempos por etapa (auth, postgrest, fallback) no trace da rota.

Nenhum índice foi mexido; nenhuma otimização proposta sem esses números.
