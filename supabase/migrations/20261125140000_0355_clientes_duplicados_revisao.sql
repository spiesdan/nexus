-- 0355 — CLIENTES DUPLICADOS: A FILA ONDE UM HUMANO DECIDE.
--
-- ─── Por que esta migration existe ─────────────────────────────────────────
--
-- A 0301 já funde sozinha o que é seguro: mesmo nome normalizado + mesma
-- cidade + documento compatível. O que sobra é a decisão que NENHUM código
-- pode tomar: duas fichas com o mesmo nome e a mesma cidade, **sem CNPJ**, e
-- com histórico. Podem ser a mesma pessoa que comprou duas vezes, ou duas
-- pessoas diferentes com o mesmo nome na mesma cidade. Fundir no escuro aqui
-- junta pedido de um cliente no cadastro do outro.
--
-- Medido na instalação do dono em 25/11/2026: 117 grupos, 2.075 fichas.
--
-- A saída não é "sugerir e aplicar": é a tela `/app/clientes/duplicados`,
-- onde o humano escolhe o vencedor e confirma. Esta migration entrega as duas
-- peças de banco que faltavam:
--
--   1. `fn_contatos_duplicados(org, limite)` — os grupos candidatos, com o
--      que decide (pedidos, conversas, leads, última compra, endereço).
--   2. `fn_fundir_contatos(org, vencedor, perdedores)` — a fusão explícita,
--      atômica, que reponta TODAS as tabelas com `contact_id` descobertas no
--      catálogo (lista fixa envelhece; tabela nova entra sozinha).
--   3. `contact_duplicate_dismissals` — "não é a mesma pessoa": o grupo sai da
--      fila e não volta na próxima varredura.
--
-- ─── O que a fusão NÃO faz ─────────────────────────────────────────────────
--
-- Não apaga histórico: as conversas 1:1 duplicadas do mesmo canal/sessão são
-- FUNDIDAS (mensagens e vínculos passam para a conversa do vencedor) antes de
-- a conversa perdedora sair, como a 0198 faz. Não desfaz sozinha: a marca
-- `is_merged_into` é reversível, mas pedido repontado não volta — e é por isso
-- que a tela diz quantos pedidos vão passar antes de confirmar.
--
-- Idempotência: rodar a fusão de novo com os mesmos ids e o mesmo vencedor é
-- no-op (os perdedores já apontam para ele). Perdedor mesclado em OUTRO
-- contato é recusado — não é repetição, é conflito.

-- ── 1 · AS FICHAS QUE NÃO SE FUNDEM SOZINHAS ────────────────────────────────

create or replace function public.fn_contatos_duplicados(
  p_org uuid,
  p_limite integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limite integer;
  v_resultado jsonb;
begin
  if p_org is null then
    raise exception 'organizacao obrigatoria';
  end if;

  -- Teto duro: a tela é de decisão, não de despejo. Acima disso a resposta
  -- avisa (`truncado`) em vez de fingir que a fila acabou.
  v_limite := least(greatest(coalesce(p_limite, 200), 1), 500);

  with base as (
    select
      c.id,
      c.organization_id,
      coalesce(
        nullif(btrim(c.name), ''),
        nullif(btrim(c.display_name), ''),
        'Sem nome'
      ) as nome_exibicao,
      public.fn_mercos_nome(coalesce(c.name, c.display_name, '')) as nome_norm,
      public.fn_mercos_nome(coalesce(c.cidade, '')) as cidade_norm,
      c.cidade,
      c.uf,
      c.bairro,
      c.cep,
      c.phone_number,
      c.email,
      c.created_at,
      nullif(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g'), '') as cnpj_digitos,
      (
        select count(*)::integer
          from public.commercial_orders o
         where o.contact_id = c.id
           and o.organization_id = c.organization_id
      ) as pedidos,
      (
        select count(*)::integer
          from public.conversations v
         where v.contact_id = c.id
           and v.organization_id = c.organization_id
      ) as conversas,
      (
        select count(*)::integer
          from public.crm_leads l
         where l.contact_id = c.id
           and l.organization_id = c.organization_id
      ) as leads,
      (
        select max(o.created_at)
          from public.commercial_orders o
         where o.contact_id = c.id
           and o.organization_id = c.organization_id
      ) as ultima_compra,
      (
        coalesce(
          nullif(btrim(c.logradouro), ''),
          nullif(btrim(c.numero_end), ''),
          nullif(btrim(c.cep), ''),
          nullif(btrim(c.bairro), '')
        ) is not null
      ) as tem_endereco
      from public.contacts c
     where c.organization_id = p_org
       and c.is_merged_into is null
       and c.is_anonymized = false
       -- Cidade em branco não entra: "mesmo nome" sem cidade não é pista
       -- suficiente para chamar duas fichas de duplicata, e o grupo com
       -- cidade vazia viraria a maior e a menos confiável da fila.
       and public.fn_mercos_nome(coalesce(c.cidade, '')) <> ''
       and public.fn_mercos_nome(coalesce(c.name, c.display_name, '')) is not null
  ),
  grupos as (
    select
      nome_norm,
      cidade_norm,
      count(*)::integer as total_fichas,
      sum(pedidos)::integer as pedidos,
      sum(conversas)::integer as conversas,
      sum(leads)::integer as leads,
      -- Documento em QUALQUER membro tira o grupo: quem tem CNPJ não é
      -- "sem CNPJ", e a tela não é o lugar de resolver colisão de documento
      -- (a 0354 mostra essas; fundir é outra decisão).
      count(*) filter (where cnpj_digitos is not null)::integer as com_documento,
      bool_or(pedidos + conversas + leads > 0) as tem_historico
      from base
     group by nome_norm, cidade_norm
    having count(*) > 1
  ),
  filtrados as (
    select
      g.*,
      g.nome_norm || '|' || g.cidade_norm as chave
      from grupos g
     where g.com_documento = 0
       and g.tem_historico
       and not exists (
         select 1
           from public.contact_duplicate_dismissals d
          where d.organization_id = p_org
            and d.chave = g.nome_norm || '|' || g.cidade_norm
       )
  ),
  totais as (
    select
      count(*)::integer as total_grupos,
      coalesce(sum(total_fichas), 0)::integer as total_fichas
      from filtrados
  ),
  limitados as (
    select *
      from filtrados
     order by total_fichas desc, nome_norm asc
     limit v_limite
  ),
  membros as (
    select
      b.nome_norm,
      b.cidade_norm,
      jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'nome', b.nome_exibicao,
          'telefone', b.phone_number,
          'email', b.email,
          'cidade', b.cidade,
          'uf', b.uf,
          'bairro', b.bairro,
          'cep', b.cep,
          'pedidos', b.pedidos,
          'conversas', b.conversas,
          'leads', b.leads,
          'ultima_compra', b.ultima_compra,
          'criado_em', b.created_at,
          'tem_endereco', b.tem_endereco
        )
        order by b.pedidos desc,
                 b.conversas desc,
                 b.ultima_compra desc nulls last,
                 b.created_at asc
      ) as fichas,
      (array_agg(b.nome_exibicao order by b.pedidos desc, b.conversas desc, b.created_at asc, b.id asc))[1] as nome,
      (array_agg(b.cidade order by b.pedidos desc, b.conversas desc, b.created_at asc, b.id asc))[1] as cidade,
      (array_agg(b.uf order by b.pedidos desc, b.conversas desc, b.created_at asc, b.id asc))[1] as uf
      from base b
      join limitados l using (nome_norm, cidade_norm)
     group by b.nome_norm, b.cidade_norm
  )
  select jsonb_build_object(
    'grupos',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'chave', l.chave,
            'nome', m.nome,
            'cidade', m.cidade,
            'uf', m.uf,
            'total_fichas', l.total_fichas,
            'pedidos', l.pedidos,
            'conversas', l.conversas,
            'leads', l.leads,
            'fichas', m.fichas
          )
          order by l.total_fichas desc, l.nome_norm asc
        )
        from limitados l
        join membros m using (nome_norm, cidade_norm)
      ),
      '[]'::jsonb
    ),
    'total_grupos', (select total_grupos from totais),
    'total_fichas', (select total_fichas from totais),
    'limite', v_limite,
    'truncado', (select total_grupos from totais) > v_limite
  )
  into v_resultado;

  return v_resultado;
end;
$$;

revoke execute on function public.fn_contatos_duplicados(uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_contatos_duplicados(uuid, integer) to service_role;

comment on function public.fn_contatos_duplicados(uuid, integer) is
  'Grupos candidatos a duplicata que exigem decisão humana (mesmo nome normalizado + mesma cidade, sem CNPJ, com histórico), já sem os descartados. Não funde nada.';


-- ── 2 · A FUSÃO QUE O HUMANO CONFIRMOU ─────────────────────────────────────

create or replace function public.fn_fundir_contatos(
  p_org uuid,
  p_vencedor uuid,
  p_perdedores uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perdedores uuid[];
  v_ja_mesclados uuid[];
  v_pendentes uuid[];
  v_vencedor public.contacts;
  v_tabela record;
  v_linhas bigint;
  v_repontados jsonb := '{}'::jsonb;
  v_conflitos jsonb := '{}'::jsonb;
  v_conversas integer := 0;
  v_mesclados integer := 0;
begin
  if p_org is null then
    raise exception 'organizacao obrigatoria';
  end if;
  if p_vencedor is null then
    raise exception 'vencedor obrigatorio';
  end if;
  if p_perdedores is null or cardinality(p_perdedores) = 0 then
    raise exception 'informe ao menos um perdedor';
  end if;
  if exists (select 1 from unnest(p_perdedores) x where x is null) then
    raise exception 'perdedor nulo';
  end if;
  if (select count(distinct x) from unnest(p_perdedores) x) <> cardinality(p_perdedores) then
    raise exception 'perdedores repetidos';
  end if;
  if p_vencedor = any (p_perdedores) then
    raise exception 'o vencedor nao pode estar entre os perdedores';
  end if;

  -- ── 2a · quem participa, e de quem é cada ficha ───────────────────────────
  select *
    into v_vencedor
    from public.contacts
   where id = p_vencedor
     and organization_id = p_org;

  if not found then
    raise exception 'vencedor nao pertence a organizacao';
  end if;
  if v_vencedor.is_merged_into is not null then
    raise exception 'vencedor ja esta mesclado em outro contato';
  end if;

  select array_agg(distinct c.id)
    into v_perdedores
    from public.contacts c
   where c.id = any (p_perdedores)
     and c.organization_id = p_org;

  if coalesce(cardinality(v_perdedores), 0) <> cardinality(p_perdedores) then
    raise exception 'perdedor nao pertence a organizacao';
  end if;

  -- Perdedor que já aponta para o MESMO vencedor é repetição: a fusão já
  -- aconteceu, e repetir precisa ser no-op (a tela pode ser clicada duas
  -- vezes; a rede pode repetir o POST). Apontar para OUTRO contato é
  -- conflito de verdade e a fusão inteira recusa.
  select coalesce(array_agg(c.id), '{}'::uuid[]) into v_ja_mesclados
    from public.contacts c
   where c.id = any (v_perdedores)
     and c.is_merged_into = p_vencedor;

  if exists (
    select 1
      from public.contacts c
     where c.id = any (v_perdedores)
       and c.is_merged_into is not null
       and c.is_merged_into <> p_vencedor
  ) then
    raise exception 'perdedor ja esta mesclado em outro contato';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
    into v_pendentes
    from unnest(v_perdedores) x
   where not (x = any (coalesce(v_ja_mesclados, '{}'::uuid[])));

  if coalesce(cardinality(v_pendentes), 0) = 0 then
    return jsonb_build_object(
      'aplicado', false,
      'motivo', 'ja_mesclado',
      'vencedor_id', p_vencedor,
      'contatos_mesclados', 0,
      'repontados', '{}'::jsonb,
      'conflitos', '{}'::jsonb
    );
  end if;

  -- ── 2b · conversas duplicadas do mesmo canal/sessão ───────────────────────
  --
  -- O unique `conversations_unique_per_contact_session` estoura se o vencedor
  -- e um perdedor tiverem conversa no MESMO canal/sessão (e mesmo
  -- `group_chat_id`). A 0198 e a 0301 resolvem antes de remarcar. Aqui a
  -- escolha é não perder mensagem: a conversa canônica é a do vencedor (ou a
  -- mais antiga do grupo), e TODOS os vínculos da perdedora passam para ela
  -- antes do delete. O delete da conversa só acontece depois — `messages`
  -- tem ON DELETE CASCADE, então apagar primeiro levaria o histórico junto.
  -- `to_regclass` em vez de `drop table if exists pg_temp.…`: no primeiro
  -- uso o schema temporário ainda não existe e o Postgres emite NOTICE a cada
  -- fusão. A checagem não custa nada e mantém o log de produção limpo.
  if to_regclass('pg_temp._fundir_conv') is not null then
    drop table pg_temp._fundir_conv;
  end if;
  create temp table _fundir_conv on commit drop as
  with contatos as (
    select unnest(array[p_vencedor] || v_pendentes) as contact_id
  ),
  convs as (
    select
      v.id,
      v.organization_id,
      v.channel_session_id,
      v.group_chat_id,
      v.created_at,
      row_number() over (
        partition by v.organization_id, v.channel_session_id, v.group_chat_id
        order by (v.contact_id = p_vencedor) desc, v.created_at asc, v.id asc
      ) as posicao
      from public.conversations v
      join contatos c on c.contact_id = v.contact_id
     where v.organization_id = p_org
  )
  select
    l.id as perdedora,
    w.id as vencedora
    from convs l
    join convs w
      on w.organization_id = l.organization_id
     and w.channel_session_id = l.channel_session_id
     and w.group_chat_id is not distinct from l.group_chat_id
     and w.posicao = 1
   where l.posicao > 1;

  select count(*)::integer into v_conversas from pg_temp._fundir_conv;

  -- `demanda_conversas` tem PK (demanda_id, conversation_id): o vínculo que já
  -- existe na conversa vencedora vence, e o duplicado sai antes do update
  -- genérico — senão a tabela inteira fica sem repontar por unique_violation.
  if to_regclass('public.demanda_conversas') is not null then
    delete from public.demanda_conversas d
     using pg_temp._fundir_conv c
     where d.conversation_id = c.perdedora
       and exists (
         select 1
           from public.demanda_conversas w
          where w.demanda_id = d.demanda_id
            and w.conversation_id = c.vencedora
       );
  end if;

  -- Descoberta pelo catálogo: toda tabela base com `conversation_id` recebe o
  -- vínculo da conversa vencedora. A exceção é por tabela — restrição própria
  -- que não deu para resolver acima deixa a linha cair com a conversa
  -- perdedora em vez de derrubar a fusão inteira.
  for v_tabela in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
     where c.table_schema = 'public'
       and c.column_name = 'conversation_id'
       and t.table_type = 'BASE TABLE'
       and to_regclass(format('public.%I', c.table_name)) is not null
     order by c.table_name
  loop
    begin
      execute format(
        'update public.%I t set conversation_id = c.vencedora
           from pg_temp._fundir_conv c
          where t.conversation_id = c.perdedora',
        v_tabela.table_name
      );
    exception when unique_violation then
      v_conflitos := v_conflitos || jsonb_build_object(
        v_tabela.table_name, 'conversa: unique_violation'
      );
    end;
  end loop;

  delete from public.conversations v
   using pg_temp._fundir_conv c
   where v.id = c.perdedora;

  -- ── 2c · conflitos de unicidade por contato ───────────────────────────────
  --
  -- Estes são os uniques conhecidos que envolvem `contact_id`. Os demais são
  -- pegos pelo handler por tabela de 2d. Regra comum: quando o vencedor já
  -- tem a linha, o que é decisão (lead state, proposta pendente, destinatário
  -- de campanha) fica com o vencedor; o que é vigilância (fila, follow-up)
  -- é encerrado no perdedor em vez de duplicar.

  if to_regclass('public.lead_state') is not null then
    delete from public.lead_state l
     using unnest(v_pendentes) as x(contact_id)
     where l.contact_id = x.contact_id
       and exists (
         select 1
           from public.lead_state w
          where w.contact_id = p_vencedor
            and w.organization_id = l.organization_id
       );
  end if;

  if to_regclass('public.contact_field_proposals') is not null then
    delete from public.contact_field_proposals p
     using unnest(v_pendentes) as x(contact_id)
     where p.contact_id = x.contact_id
       and p.status = 'pending'
       and exists (
         select 1
           from public.contact_field_proposals w
          where w.contact_id = p_vencedor
            and w.organization_id = p.organization_id
            and w.campo = p.campo
            and w.status = 'pending'
       );
  end if;

  if to_regclass('public.campaign_recipients') is not null then
    delete from public.campaign_recipients r
     using unnest(v_pendentes) as x(contact_id)
     where r.contact_id = x.contact_id
       and exists (
         select 1
           from public.campaign_recipients w
          where w.campaign_id = r.campaign_id
            and w.contact_id = p_vencedor
       );
  end if;

  if to_regclass('public.followup_enrollments') is not null then
    -- Quem já está no follow-up do vencedor não ganha um segundo: o do
    -- perdedor é cancelado com motivo próprio. Se o vencedor não tem, o
    -- update de 2d reponta o enrollment e o fluxo continua com o dono certo.
    update public.followup_enrollments e
       set status = 'cancelled',
           cancel_reason = 'contato_mesclado',
           next_eval_at = null,
           updated_at = now()
      from unnest(v_pendentes) as x(contact_id)
     where e.contact_id = x.contact_id
       and e.status in ('active', 'waiting_reply', 'paused_handoff')
       and exists (
         select 1
           from public.followup_enrollments w
          where w.contact_id = p_vencedor
            and w.organization_id = e.organization_id
            and w.status in ('active', 'waiting_reply', 'paused_handoff')
       );
  end if;

  if to_regclass('public.job_queue') is not null then
    -- `uniq_job_queue_one_running_per_contact`: dois jobs RUNNING no mesmo
    -- contato não existem. O do perdedor que está rodando fica onde está e
    -- segue para o cadastro mesclado; os demais são repontados.
    update public.job_queue q
       set contact_id = p_vencedor
      from unnest(v_pendentes) as x(contact_id)
     where q.contact_id = x.contact_id
       and not (
         q.status = 'running'
         and exists (
           select 1
             from public.job_queue w
            where w.contact_id = p_vencedor
              and w.status = 'running'
         )
       );
  end if;

  -- ── 2d · todas as referências passam a apontar para o vencedor ──────────
  --
  -- Descoberta pelo catálogo (`information_schema.columns` + `to_regclass`),
  -- não por lista fixa: tabela nova com `contact_id` entra sozinha. A lista
  -- fixa envelhece em silêncio — foi o que a 0198 mostrou.
  for v_tabela in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
     where c.table_schema = 'public'
       and c.column_name = 'contact_id'
       and t.table_type = 'BASE TABLE'
       and to_regclass(format('public.%I', c.table_name)) is not null
       and c.table_name <> 'contacts'
     order by c.table_name
  loop
    begin
      execute format(
        'update public.%I t set contact_id = $1 where t.contact_id = any($2::uuid[])',
        v_tabela.table_name
      ) using p_vencedor, v_pendentes;

      get diagnostics v_linhas = row_count;
      if v_linhas > 0 then
        v_repontados := v_repontados || jsonb_build_object(v_tabela.table_name, v_linhas);
      end if;
    exception when unique_violation then
      -- A linha do perdedor fica no cadastro mesclado; nada é apagado.
      v_conflitos := v_conflitos || jsonb_build_object(
        v_tabela.table_name, 'contato: unique_violation'
      );
    end;
  end loop;

  -- ── 2e · a marca da fusão ────────────────────────────────────────────────
  update public.contacts c
     set is_merged_into = p_vencedor,
         merged_at = now(),
         updated_at = now()
   where c.organization_id = p_org
     and c.id = any (v_pendentes)
     and c.is_merged_into is null;

  get diagnostics v_mesclados = row_count;

  if v_mesclados <> cardinality(v_pendentes) then
    raise exception 'fusao incompleta: % de % contatos marcados',
      v_mesclados, cardinality(v_pendentes);
  end if;

  return jsonb_build_object(
    'aplicado', true,
    'vencedor_id', p_vencedor,
    'contatos_mesclados', v_mesclados,
    'conversas_fundidas', v_conversas,
    'repontados', v_repontados,
    'conflitos', v_conflitos
  );
end;
$$;

revoke execute on function public.fn_fundir_contatos(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.fn_fundir_contatos(uuid, uuid, uuid[]) to service_role;

comment on function public.fn_fundir_contatos(uuid, uuid, uuid[]) is
  'Fusão explícita confirmada por humano: reponta todas as tabelas com contact_id (descobertas no catálogo) para o vencedor, funde conversas 1:1 duplicadas do mesmo canal/sessão e marca os perdedores com is_merged_into. Service role only.';


-- ── 3 · "NÃO É A MESMA PESSOA" ──────────────────────────────────────────────
--
-- O grupo descartado sai da fila e NÃO volta na próxima varredura. A chave é
-- estável (`nome_normalizado|cidade_normalizada`), então renomear a ficha
-- reapresenta o grupo — o que é correto: virou outra pergunta.

create table if not exists public.contact_duplicate_dismissals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  chave text not null,
  motivo text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, chave)
);

alter table public.contact_duplicate_dismissals enable row level security;

drop policy if exists contact_duplicate_dismissals_select on public.contact_duplicate_dismissals;
create policy contact_duplicate_dismissals_select on public.contact_duplicate_dismissals
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists contact_duplicate_dismissals_insert on public.contact_duplicate_dismissals;
create policy contact_duplicate_dismissals_insert on public.contact_duplicate_dismissals
  for insert with check (
    public.fn_is_platform_admin()
    or public.fn_role_at_least(organization_id, 'manager')
  );

drop policy if exists contact_duplicate_dismissals_update on public.contact_duplicate_dismissals;
create policy contact_duplicate_dismissals_update on public.contact_duplicate_dismissals
  for update using (
    public.fn_is_platform_admin()
    or public.fn_role_at_least(organization_id, 'manager')
  ) with check (
    public.fn_is_platform_admin()
    or public.fn_role_at_least(organization_id, 'manager')
  );

drop policy if exists contact_duplicate_dismissals_delete on public.contact_duplicate_dismissals;
create policy contact_duplicate_dismissals_delete on public.contact_duplicate_dismissals
  for delete using (
    public.fn_is_platform_admin()
    or public.fn_role_at_least(organization_id, 'manager')
  );

revoke all on public.contact_duplicate_dismissals from anon;
grant select, insert, update, delete on public.contact_duplicate_dismissals to authenticated;
grant all on public.contact_duplicate_dismissals to service_role;

comment on table public.contact_duplicate_dismissals is
  'Grupos de supostos duplicados que um humano decidiu NÃO ser a mesma pessoa. A chave nome_normalizado|cidade_normalizada sai da fila e não volta.';
