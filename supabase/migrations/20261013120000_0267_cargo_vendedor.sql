-- ═══════════════════════════════════════════════════════════════════════════
--  0267 — CARGO "VENDEDOR"
--
--  ─── O QUE MEXE, E POR QUE SÃO DOIS LUGARES ────────────────────────────────
--
--  O vocabulário de cargos vive em DOIS lugares independentes, e o banco é o
--  que tem a palavra final:
--
--  1. `user_organizations_role_check` — o CHECK que impede gravar papel que o
--     código não conhece. Sem ele aqui, o convite aceitaria "vendedor" e o
--     INSERT bateria na parede.
--  2. `fn_role_at_least` — a escada de níveis que a RLS consulta. Sem ela,
--     um vendedor seria `null` no `coalesce` e cairia em `false` em TODA
--     política — o usuário aceitaria o convite e não veria nada.
--
--  ─── O NÍVEL É O MESMO DO `agent`, DE PROPÓSITO ───────────────────────────
--
--  `vendedor` entra como nível 2, igual a `agent`. Quem vende precisa de
--  pedido, prospect, inbox e conversa — que é o que o atendente já tem.
--
--  Cargo novo com nível novo seria decisão de segurança disfarçada de rótulo:
--  subir o vendedor acima do atendente daria a ele o que o gerente tem sem
--  ninguém pedir. Este papel é um NOME para o que o atendente já podia, porque
--  é assim que a empresa fala.
--
--  Consequência honesta e deliberada: `requireRole("agent")` LIBERA o
--  vendedor, porque `rank >= 2`. Isso não é brecha — é a mesma permissão com
--  outro nome. Se um dia o vendedor precisar de menos que o atendente, é outro
--  papel em outro nível, e não este.
--
--  ─── `ai_operator` NÃO ENTRA, E ESTÁ CERTO ────────────────────────────────
--
--  O TypeScript tem `ai_operator` na escada (rank 3) e este banco não tem.
--  Parece divergência, e foi o que pareceu na leitura: `fn_role_at_least`
--  nunca saberia o papel. Mas `ai_operator` é o papel do AGENTE publicado e
--  nunca é gravado em `user_organizations` — ele vive no escopo do agente, não
--  de uma pessoa. Não entra aqui de propósito.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) O CHECK aceita o novo papel. `NOT VALID` não serve: a tabela é pequena e
--    o que importa é a partir de agora, com o CHECK válido de uma vez.
alter table public.user_organizations
  drop constraint if exists user_organizations_role_check;

alter table public.user_organizations
  add constraint user_organizations_role_check
  check (role = any (array['viewer'::text, 'agent'::text, 'vendedor'::text,
                       'manager'::text, 'admin'::text]));

-- 2) A escada que a RLS lê. `SECURITY DEFINER` + `stable` + `search_path`
--    travado, como a versão anterior — esta função decide acesso, e uma
--    função de acesso com `search_path` aberto é uma função que alguém pode
--    sequestrar.
-- O comentario vai AQUI, fora do corpo, de propósito: um `--` dentro do
-- `as $$ ... $$` vai para `prosrc`, e `pg_get_functiondef` devolve o texto
-- incluindo comentário. Foi assim que `tests/unit/papel-do-agente-publicado`
-- reprovou: o corpo passou a CONTER a palavra que o teste garante não estar lá.
-- Explicação no corpo da função é documentação que vira assert.
create or replace function public.fn_role_at_least(p_org uuid, p_min text)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  with levels(role, lvl) as (
    values ('viewer',1),('agent',2),('vendedor',2),('manager',3),('admin',4)
  )
  select coalesce(
    (select user_lvl.lvl >= min_lvl.lvl
     from levels user_lvl
     join levels min_lvl on min_lvl.role = p_min
     where user_lvl.role = public.fn_user_role_in_org(p_org)),
    false
  );
$$;

comment on function public.fn_role_at_least(uuid, text) is
  'Escada de cargos do tenant. `vendedor` divide o nível 2 com `agent` — mesmo poder, nome que a empresa usa. `ai_operator` NÃO entra: é papel do agente publicado e nunca é gravado em user_organizations.';

-- 3) `revoke` e `grant`: DUAS origens de EXECUTE. Revogar só uma deixa a
--    função alcançável por `anon` como RPC pela anon key.
revoke all on function public.fn_role_at_least(uuid, text) from public;
revoke all on function public.fn_role_at_least(uuid, text) from anon;
grant execute on function public.fn_role_at_least(uuid, text) to authenticated;
