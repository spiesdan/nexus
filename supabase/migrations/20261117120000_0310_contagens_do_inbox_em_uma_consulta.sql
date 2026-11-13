-- ─────────────────────────────────────────────────────────────────────────────
-- 0310 — As contagens do inbox em UMA varredura
--
-- ## O defeito, medido na VPS em 2026-11-13
--
-- `/api/v1/conversations/counts` disparava QUATRO queries em paralelo (fila,
-- automático, minhas, todas). Cada uma levava ~1,2 s de média, e o pico de uma
-- delas batia 7991 ms — o `statement_timeout` do role `authenticated` era 8 s.
-- O resultado era o 500 `57014 statement timeout` que o dono via na Inbox
-- (`/api/v1/conversations?comando=aguardando,automatico&limit=50`).
--
-- A causa é a RLS de `conversations`: `conversations_select` chama
-- `fn_can_view_conversation()` e `fn_can_view_channel()` POR LINHA, e cada uma
-- chama `fn_user_role_in_org()` — 3 subconsultas por linha em 1.314 linhas.
-- O campo calculado `comando_da_conversa(conversations)` também resolve
-- `contacts` por linha. Quatro varreduras completas da mesma tabela viram
-- quatro vezes o mesmo trabalho.
--
-- ## Por que uma função e não quatro consultas
--
-- O mesmo predicado de cada aba, agora com `count(*) filter (where ...)`, numa
-- única varredura. Medido: 799 ms contra 4 × 1,2 s em paralelo. O RPC é
-- `SECURITY INVOKER` — a RLS de `conversations` continua valendo, e um agent em
-- modo `own*` continua recebendo o SEU escopo, nunca o total da org. É a mesma
-- garantia do listing, e o espelhamento com `tabToFilter` (InboxLayout) é
-- vigiado por `tests/unit/badge-espelha-a-aba.test.ts`.
--
-- A função é `stable` (não muda nada) e recebe `p_comandos` do servidor, porque
-- quem decide se a Fila inclui `automatico` é `orgTemAutomatico` — a regra
-- continua no servidor, não em SQL.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_conversas_contagens(
  p_org uuid,
  p_me uuid,
  p_comandos text[],
  p_terminais text[]
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
  select jsonb_build_object(
    'fila', count(*) filter (where public.comando_da_conversa(conversations) = any (p_comandos)),
    'automatico', count(*) filter (where public.comando_da_conversa(conversations) = 'automatico'),
    'mine', count(*) filter (where assigned_to_user_id = p_me and status <> all (p_terminais)),
    'all', count(*)
  )
  from public.conversations
  where organization_id = p_org;
$fn$;

comment on function public.fn_conversas_contagens(uuid, uuid, text[], text[])
  is 'Contagens por visão do inbox em UMA varredura. Espelha tabToFilter (InboxLayout); SECURITY INVOKER para a RLS de conversations valer.';

-- Doutrina de migrations, regra 9: função nova em `public` nasce EXPOSTA, e são
-- DUAS origens de EXECUTE. A revogação é explícita aqui.
revoke execute on function public.fn_conversas_contagens(uuid, uuid, text[], text[]) from public, anon;
grant execute on function public.fn_conversas_contagens(uuid, uuid, text[], text[]) to authenticated, service_role;

-- Sem isto o PostgREST segue servindo o schema velho: o RPC não aparece e o
-- `counts` cai em 404 até alguém reiniciar o serviço à mão.
notify pgrst, 'reload schema';
