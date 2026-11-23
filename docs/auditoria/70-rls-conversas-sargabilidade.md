# P0-8 (continuação) — policy de `conversations`: corpo, sargabilidade e medição

> Dados de produção medidos pelo dono: query nua **3,777 ms**; com RLS
> **929,579 ms**, `Index Scan idx_conversations_org_last_msg`, `rows=24`,
> **2.138 linhas removidas pelo filtro**, 15.532 buffers, ~828 ms só no filtro.
> A policy é avaliada **por linha candidata**. Nada foi aplicado em produção; o
> plano alternativo abaixo rodou num banco local e foi **desfeito** (`ROLLBACK`).

## 1. Corpo das funções da policy

`conversations_select`:

```sql
using (
  fn_can_view_conversation(organization_id, assigned_to_user_id)
  AND fn_can_view_channel(organization_id, channel_session_id)
)
```

```sql
create or replace function public.fn_can_view_conversation(
  p_org uuid, p_assigned_to_user_id uuid)
returns boolean language sql stable security definer
set search_path to 'public'
as $function$
  select case
    when public.fn_is_platform_admin() then true
    when public.fn_user_role_in_org(p_org) is null then false
    when public.fn_user_role_in_org(p_org) in ('viewer','manager','admin') then true
    when p_assigned_to_user_id = auth.uid() then true
    else case coalesce(
           (select settings->>'visibility_mode' from public.organizations where id = p_org),
           'own_and_unassigned')
         when 'all' then true
         when 'own_and_unassigned' then p_assigned_to_user_id is null
         else false
       end
  end;
$function$;
```

```sql
create or replace function public.fn_can_view_channel(p_org uuid, p_channel uuid)
returns boolean language sql stable security definer
set search_path to 'public'
as $function$
  select case
    when auth.uid() is null then true
    when public.fn_is_platform_admin() then true
    when public.fn_user_role_in_org(p_org) is null then false
    else coalesce(
      (select (uo.canais_permitidos is null
               or (p_channel is not null and p_channel = any(uo.canais_permitidos)))
         from public.user_organizations uo
        where uo.user_id = auth.uid()
          and uo.organization_id = p_org
          and uo.revoked_at is null
        limit 1),
      false)
  end;
$function$;
```

**Sargável?** **Não, como está.** As duas funções recebem colunas da linha
(`assigned_to_user_id`, `channel_session_id`) e fazem `fn_user_role_in_org(p_org)`
(duas vezes) + subquery em `organizations` / `user_organizations` por chamada.
Sendo `STABLE` com argumento de linha, o Postgres não as imutabiliza nem as
transforma em `Index Cond`; o `Index Scan` entrega 2.162 linhas e o filtro
descarta 2.138 uma a uma. O predicado **pode** ser expresso de forma sargável:
papel e canais permitidos viram subqueries `hashed` (uma vez por statement), e
as comparações com colunas (`assigned_to_user_id = auth.uid()`,
`assigned_to_user_id is null`, `channel_session_id = any(canais)`) ficam na
policy.

## 2. Alternativa medida no banco local (transação desfeita)

Mesma query, usuário `viewer` (não platform-admin) para não short-circuitar:

| Plano | Execution | Buffers | Acesso |
|---|---:|---:|---|
| Policy atual | **26,520 ms** | **897** | `Seq Scan` + `Sort`, filtro por função em 61 linhas |
| Policy reescrita v1 (sem cláusula de canais) | 19,844 ms | 331 | **Medição incompleta — não usar** |
| Policy 0340 final (escopo completo, canais não correlacionados) | **11,821 ms** | **707** | `Index Scan idx_conversations_org_last_msg` + `Incremental Sort`, todos os subplans `hashed` com `loops=1` |

**Retificação:** a primeira versão deste doc media 63,5 → 19,8 ms com uma
policy alternativa que **não incluía a cláusula de `canais_permitidos`**. Ao
incluí-la de forma correlacionada, o plano piorava (39,4 ms, 2.405 buffers,
`SubPlan loops=61`). A policy final da 0340 resolve os canais com subqueries
**não correlacionadas** (par org+canal), preservando o escopo exato; medida
pareada no mesmo cenário: **26,5 → 11,8 ms, 897 → 707 buffers** (~2,2×).
Em produção, onde o filtro remove 2.138 de 2.162, a mesma mudança de forma de
plano é o que pode recuperar os ~828 ms do filtro — **não afirmo o número de
produção sem rodar o EXPLAIN lá**.

Policy usada na medição (equivalente em escopo; **não aplicada**):

```sql
drop policy conversations_select on public.conversations;
create policy conversations_select on public.conversations for select using (
  public.fn_is_platform_admin()
  or (
    organization_id in (
      select organization_id from public.user_organizations
       where user_id = auth.uid() and revoked_at is null
    )
    and (
      exists (
        select 1 from public.user_organizations uo
         where uo.user_id = auth.uid()
           and uo.organization_id = conversations.organization_id
           and uo.revoked_at is null
           and uo.role in ('viewer','manager','admin')
      )
      or assigned_to_user_id = auth.uid()
      or (assigned_to_user_id is null
          and coalesce((select o.settings->>'visibility_mode'
                          from public.organizations o
                         where o.id = conversations.organization_id),
                       'own_and_unassigned') = 'own_and_unassigned')
    )
  )
);
-- canal: mesma ideia, com canais_permitidos resolvido uma vez e
-- (channel_session_id is null or channel_session_id = any(canais))
```

O `EXPLAIN` local mostrou `Index Cond: (organization_id = ...)`, `SubPlan 1/3`
com `hashed` e `loops=1`, e `Presorted Key: last_message_at` — ou seja, a
ordenação passou a usar o índice. **Nenhum índice novo foi proposto nem criado**;
o `(organization_id, last_message_at DESC NULLS LAST)` existente já foi usado.
Um índice com `id DESC` como desempate só seria considerado se o `Incremental
Sort` ainda custar caro no EXPLAIN de produção.

## 3. Custo de auth na rota

A cadeia fazia 2 × `getUser()` + 2 queries de membership + 1 listagem =
**5 round-trips**. O PR #813 reduz para **4** (uma leitura de usuário), ganho
direto de 8–18 ms (GoTrue medido pelo dono no container), não dos ~0,7 s —
esses são soma de round-trips/trabalho JS, fora do plano SQL.

## 4. Polling do Inbox

Não há `refetchInterval` na listagem
(`hooks/inbox/useConversationsRealtime.ts`): há Realtime + `refetchOnWindowFocus`
+ `useRefetchDeSeguranca` com intervalo padrão **45 s**. O refetch **não é
redundante**: é a rede de segurança que detecta entrega morta silenciosamente
(e o próprio hook registra divergência). O dono mediu 1 request/≈2 min —
compatível com esse safety net em múltiplas abas/usuários, não com polling
explícito de 2 min.

**Não propus desligá-lo.** Proposta para medir depois: tornar o intervalo
adaptativo (maior quando Realtime está `SUBSCRIBED` com entrega recente, menor
quando o canal cai), preservando a detecção. 30 varreduras/hora de 2 s só
desaparecem com essa mudança **e** com o custo da query caindo; as duas coisas
precisam de medição antes/depois separadas.

## Ordem de decisão do dono

1. Rodar em produção o `EXPLAIN` da policy reescrita (em transação que rode
   `ROLLBACK`) com o mesmo volume de 2.162 linhas.
2. Se o plano migrar para `Index Scan` e o filtro deixar de consumir ~828 ms,
   abrir PR de migration com a policy reescrita + teste de escopo (viewer/agent/
   admin e `visibility_mode`).
3. Só então avaliar índice com `id DESC` e intervalo adaptativo do safety net.
