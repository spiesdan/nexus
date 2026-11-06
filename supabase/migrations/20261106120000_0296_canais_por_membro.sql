-- 0296 — os números que cada membro enxerga no inbox
--
-- O problema que isto resolve: uma conta administrativa e uma conta comercial
-- na MESMA organização. A administrativa só precisa ver os avisos de carga que
-- saem pelo número de expedição; a comercial atende pelos números de venda
-- (oficial Meta + comercial). Hoje as duas veem tudo, porque o escopo do inbox
-- (0035) só olha papel e `visibility_mode` — e nenhum dos dois fala de NÚMERO.
--
-- O modelo: `user_organizations.canais_permitidos uuid[]`
--
--   NULL   → todos os números (é o que todo membro tem hoje; ninguém muda de
--            comportamento ao aplicar esta migration)
--   {}     → nenhum
--   [ids]  → exatamente esses (channel_sessions.id)
--
-- Três valores, e não um booleano "restringe", porque a diferença entre "não
-- configurei" e "configurei para nenhum" é a diferença entre um membro normal e
-- uma conta que ainda não recebeu número. `NULL` é o passado; `{}` é uma
-- escolha explícita do admin.
--
-- A restrição é de LEITURA. `conversations_select` passa a exigir as duas
-- condições — o escopo de papel/visibility_mode (0035) E o número permitido.
-- A escrita continua como está: o dono da conta é quem administra, e esconder
-- um número não é fronteira de segurança contra ele; é organização de trabalho.
--
-- `messages_select` NÃO é tocada de propósito: o `exists` sobre `conversations`
-- já reavalia a policy de SELECT da conversa, então a mensagem herda o escopo
-- de número sem uma segunda regra que possa divergir da primeira. Realtime usa
-- a mesma policy — a subscription não entrega conversa fora do escopo.
--
-- `fn_can_view_channel` recebe `(org, canal)` em vez da row inteira porque é
-- chamada de dentro da policy e precisa ser barata: DEFINER + search_path
-- blindado (sem lookup recursivo em user_organizations, cuja RLS chama
-- fn_role_at_least, que por sua vez...). Grants: revoke public/anon, grant
-- authenticated/service_role — a lição da 0108.
--
-- Canal sem sessão (`channel_session_id` NULL): para quem tem allowlist, fica
-- invisível. Não existe conversa legítima sem número no produto, e "sem número"
-- não é um dos números que o admin autorizou.

alter table public.user_organizations
  add column if not exists canais_permitidos uuid[];

comment on column public.user_organizations.canais_permitidos is
  'Números (channel_sessions.id) que este membro enxerga no inbox. NULL = todos (padrão histórico); {} = nenhum. Restringe LEITURA via fn_can_view_channel; papel e visibility_mode continuam valendo por cima.';

create or replace function public.fn_can_view_channel(
  p_org uuid,
  p_channel uuid
) returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    -- service_role e contexto interno (auth.uid() nulo) não passam por RLS;
    -- a função responde "visível" para nunca ser um falso negativo em rotina de
    -- manutenção. anon não executa (revoke abaixo).
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
      false
    )
  end;
$$;

revoke all on function public.fn_can_view_channel(uuid, uuid) from public;
revoke execute on function public.fn_can_view_channel(uuid, uuid) from anon;
grant execute on function public.fn_can_view_channel(uuid, uuid)
  to authenticated, service_role;

drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select" on public.conversations
  for select using (
    public.fn_can_view_conversation(organization_id, assigned_to_user_id)
    and public.fn_can_view_channel(organization_id, channel_session_id)
  );
