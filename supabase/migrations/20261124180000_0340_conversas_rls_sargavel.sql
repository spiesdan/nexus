-- 0340 — POLICY DE CONVERSAS SET-BASED (P0-8).
--
-- Produção mediu 929 ms com RLS contra 3,8 ms sem ela: a policy chamava duas
-- funções STABLE com COLUNAS DA LINHA (fn_can_view_conversation/channel). O
-- plano fazia Index Scan, entregava 2.162 linhas e eliminava 2.138 uma a uma no
-- filtro (~828 ms). A função não é sargável: o Postgres não transforma chamada
-- com argumento de linha em Index Cond.
--
-- Esta migration troca as duas funções por predicados set-based COM O MESMO
-- ESCOPO: membro ativo da org, papel amplo (viewer/manager/admin) vê tudo,
-- agent vê só o que está atribuído a ele (ou sem dono quando visibility_mode é
-- own_and_unassigned), e canais_permitidos continua valendo. Papel/membership
-- viram subqueries hashed (uma vez por statement); as comparações com colunas
-- ficam na policy. Nenhum índice novo: o (organization_id, last_message_at
-- DESC NULLS LAST) existente passa a ser escolhido.
--
-- Não altera as funções (ainda usadas por MCP/outras policies); só a policy de
-- SELECT de conversations. Security_invoker/RLS continuam ligados.

drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select" on public.conversations
  for select using (
    -- Porta: platform admin ou membro ativo (revoked_at nulo) da org da linha.
    (
      public.fn_is_platform_admin()
      or exists (
        select 1 from public.user_organizations uo
         where uo.user_id = auth.uid()
           and uo.organization_id = conversations.organization_id
           and uo.revoked_at is null
      )
    )
    and (
      public.fn_is_platform_admin()
      or exists (
        select 1 from public.user_organizations uo
         where uo.user_id = auth.uid()
           and uo.organization_id = conversations.organization_id
           and uo.revoked_at is null
           and uo.role in ('viewer', 'manager', 'admin')
      )
      or assigned_to_user_id = auth.uid()
      or coalesce(
           (select o.settings->>'visibility_mode'
              from public.organizations o
             where o.id = conversations.organization_id),
           'own_and_unassigned'
         ) = 'all'
      or (
        assigned_to_user_id is null
        and coalesce(
              (select o.settings->>'visibility_mode'
                 from public.organizations o
                where o.id = conversations.organization_id),
              'own_and_unassigned'
            ) = 'own_and_unassigned'
      )
    )
    -- Canais: os conjuntos são resolvidos UMA vez (subqueries não
    -- correlacionadas), não por linha. O par (org, canal) preserva o escopo
    -- original: um canal permitido na org A não abre conversa na org B.
    and (
      public.fn_is_platform_admin()
      or (conversations.organization_id, channel_session_id) = any (
        select uo.organization_id, x.id
          from public.user_organizations uo
          cross join lateral unnest(uo.canais_permitidos) as x(id)
         where uo.user_id = auth.uid()
           and uo.revoked_at is null
      )
      or conversations.organization_id = any (
        select uo.organization_id
          from public.user_organizations uo
         where uo.user_id = auth.uid()
           and uo.revoked_at is null
           and uo.canais_permitidos is null
      )
    )
  );

comment on policy "conversations_select" on public.conversations is
  'RLS set-based (0340): mesmo escopo de fn_can_view_conversation/channel, expresso com subqueries hashed para ser sargável. Sem mudança de índice.';
