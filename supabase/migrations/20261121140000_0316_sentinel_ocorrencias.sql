-- ============================================================================
-- 0316 — NEXUS SENTINEL: ocorrências, histórico e o estado de cada varredura.
--
-- O Sentinel v1 é SOMENTE LEITURA sobre as entidades de negócio. Ele não emite
-- nota, não altera saldo, não paga e não envia mensagem: o que ele grava são
-- as PRÓPRIAS ocorrências (o que viu), o histórico do que mudou nelas e o
-- resultado de cada execução. A separação é deliberada — um detector que
-- escreve no negócio deixa de ser auditor e vira operador sem dono.
--
-- ─── Por que tabela nova em vez de `operational_alerts` ──────────────────────
--
-- `operational_alerts` (0261) é o aviso operacional do dia a dia: quatro
-- `origem_tipo` fechados, três estados e um `unique` por chave aberta. O
-- Sentinel precisa de mais: oito estados (nova, investigando, ação necessária,
-- aprovada, corrigida, ignorada, recorrente, encerrada), severidade, evidência
-- estruturada, causa provável, histórico append-only e agrupamento por
-- impressão digital. Alargar aquela tabela mudaria o contrato de três telas
-- que já a leem (Meu Dia, agenda, notificações) para servir uma quarta.
-- Tabela própria mantém o aviso do dia e a ocorrência auditada em domínios
-- separados; quem quiser transformar uma ocorrência em aviso o faz na tela,
-- não no schema.
--
-- ─── Por que `fingerprint` e índice parcial ──────────────────────────────────
--
-- A mesma ocorrência vista de novo NÃO é uma ocorrência nova. O índice único
-- parcial (`estado` aberto) é o que garante isso: a segunda execução encontra
-- a linha aberta e atualiza `ultima_vista_em`/`vezes_vista`, em vez de criar
-- uma cópia. Fechada a linha, o mesmo evento pode voltar amanhã — e aí nasce
-- uma ocorrência `recorrente`, com `recorrencias` contando as anteriores. O
-- histórico não é apagado para "limpar a tela"; é isso que permite responder
-- "quantas vezes isso já aconteceu?".
--
-- ─── PII e LGPD ─────────────────────────────────────────────────────────────
--
-- `evidencia` guarda o mínimo para agir (ids, valores, estado, contagens) e
-- NUNCA o conteúdo de conversa, documento, telefone ou e-mail por extenso.
-- Chaves de agrupamento que são PII (e-mail de cliente duplicado) entram na
-- `fingerprint` como sha256 e na evidência mascaradas. A retenção é
-- configurável por organização (default 180 dias, piso 30) e só alcança
-- ocorrências em estado terminal.
-- ============================================================================

-- ─── 1. Configuração por organização — o kill switch tem superfície ─────────

create table if not exists public.sentinel_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,

  -- `false` desliga varreduras da organização. É o kill switch de produto:
  -- o cron pula a org e a execução manual responde `sentinel_disabled` em vez
  -- de rodar em silêncio. O `.env` (SENTINEL_ENABLED=false) desliga a
  -- instalação inteira — dois níveis porque "esta org não quer" e "este
  -- servidor não quer" são decisões de donos diferentes.
  ativo boolean not null default true,

  -- De quanto em quanto tempo o cron considera a org "devida". A execução
  -- manual ignora o intervalo, mas nunca o kill switch.
  intervalo_minutos integer not null default 360
    check (intervalo_minutos between 15 and 10080),

  -- Retenção das ocorrências TERMINAIS (corrigida/ignorada/encerrada).
  retencao_dias integer not null default 180
    check (retencao_dias between 30 and 3650),

  -- Teto de ocorrências por execução. Protege a VPS de uma varredura que
  -- encontra 40 mil linhas depois de uma importação quebrada.
  limite_ocorrencias integer not null default 500
    check (limite_ocorrencias between 50 and 2000),

  -- Regras desligadas POR org (ex.: quem não usa Mercos). A regra continua
  -- existindo no registry; só não é executada para esta organização.
  detectores_desativados text[] not null default '{}',

  ultima_execucao_em timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sentinel_settings enable row level security;

drop policy if exists sentinel_settings_select on public.sentinel_settings;
create policy sentinel_settings_select on public.sentinel_settings
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists sentinel_settings_write on public.sentinel_settings;
create policy sentinel_settings_write on public.sentinel_settings
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

revoke all on public.sentinel_settings from anon;
grant select, insert, update, delete on public.sentinel_settings to authenticated;
grant all on public.sentinel_settings to service_role;

drop trigger if exists trg_sentinel_settings_updated_at on public.sentinel_settings;
create trigger trg_sentinel_settings_updated_at
  before update on public.sentinel_settings
  for each row execute function public.fn_set_updated_at();

comment on table public.sentinel_settings is
  'Configuração por org do Sentinel: kill switch, intervalo, retenção e teto por execução. Ausência de linha = defaults (ativo, 6h, 180d, 500).';

-- ─── 2. Execuções — a rodada também é um registro ───────────────────────────

create table if not exists public.sentinel_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  origem text not null default 'manual'
    check (origem in ('manual', 'cron', 'api')),

  status text not null default 'executando'
    check (status in ('executando', 'sucesso', 'parcial', 'erro', 'ignorada')),

  iniciado_por uuid references auth.users(id) on delete set null,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  duracao_ms integer,

  achados integer not null default 0 check (achados >= 0),
  criadas integer not null default 0 check (criadas >= 0),
  reafirmadas integer not null default 0 check (reafirmadas >= 0),
  encerradas integer not null default 0 check (encerradas >= 0),
  erros integer not null default 0 check (erros >= 0),

  -- `true` quando alguma coleta bateu no teto. A rodada truncada NÃO encerra
  -- ocorrências ausentes: ausência em lista incompleta não é prova de nada.
  truncado boolean not null default false,

  erro text,
  detalhe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Duas abas/dois crons não abrem duas varreduras da mesma org. A execução
-- órfã (processo morto) é convertida em `erro` pelo runner antes do insert.
create unique index if not exists sentinel_runs_uma_ativa
  on public.sentinel_runs (organization_id)
  where status = 'executando';

create index if not exists sentinel_runs_org_iniciado_idx
  on public.sentinel_runs (organization_id, iniciado_em desc);

create index if not exists sentinel_runs_status_idx
  on public.sentinel_runs (status, iniciado_em)
  where status in ('executando', 'erro');

alter table public.sentinel_runs enable row level security;

drop policy if exists sentinel_runs_select on public.sentinel_runs;
create policy sentinel_runs_select on public.sentinel_runs
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

-- Escrita só por service role: o runner é quem abre, atualiza e fecha a rodada.
revoke all on public.sentinel_runs from anon;
grant select on public.sentinel_runs to authenticated;
grant all on public.sentinel_runs to service_role;

comment on table public.sentinel_runs is
  'Uma linha por varredura do Sentinel. É o que separa "não havia nada" de "o cron não rodou" na tela.';

-- ─── 3. Ocorrências — o que o Sentinel viu, com evidência e causa ───────────

create table if not exists public.sentinel_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Identidade do EVENTO, não da linha: regra + entidade (+ chave de grupo).
  -- Ver o cabeçalho. Gerada pelo runner; nunca contém PII em texto claro.
  fingerprint text not null,

  regra text not null,
  categoria text not null
    check (categoria in ('fiscal', 'operacao', 'financeiro', 'campanha')),

  entidade_tipo text not null,
  entidade_id text not null,

  titulo text not null,
  resumo text,
  causa_provavel text,

  severidade text not null default 'media'
    check (severidade in ('info', 'baixa', 'media', 'alta', 'critica')),

  estado text not null default 'nova'
    check (estado in (
      'nova', 'investigando', 'acao_necessaria', 'aprovada',
      'corrigida', 'ignorada', 'recorrente', 'encerrada'
    )),

  -- O mínimo para agir. Sem conversa, sem documento, sem telefone/e-mail
  -- completo. A forma é declarada por regra em `lib/sentinel/tipos.ts`.
  evidencia jsonb not null default '{}'::jsonb,

  -- Deep link para a tela onde a pessoa resolve (pedido, nota, campanha...).
  href text,

  primeira_vista_em timestamptz not null default now(),
  ultima_vista_em timestamptz not null default now(),
  vezes_vista integer not null default 1 check (vezes_vista > 0),

  -- Quantas ocorrências FECHADAS da mesma fingerprint já existiam quando esta
  -- nasceu. > 0 é o que dá sentido ao estado `recorrente`.
  recorrencias integer not null default 0 check (recorrencias >= 0),

  ultima_execucao_id uuid references public.sentinel_runs(id) on delete set null,
  responsavel_user_id uuid references auth.users(id) on delete set null,

  motivo_encerramento text,
  ignorada_motivo text,
  encerrada_em timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sentinel_occurrences_fingerprint_nao_vazia check (length(fingerprint) > 0),
  constraint sentinel_occurrences_entidade_nao_vazia check (length(entidade_id) > 0)
);

-- Só as ocorrências ABERTAS são únicas por fingerprint. É o mesmo desenho do
-- `operational_alerts`: o evento pode reaparecer depois de fechado, e o
-- histórico de ontem continua existindo.
create unique index if not exists sentinel_occurrences_aberta_key
  on public.sentinel_occurrences (organization_id, fingerprint)
  where estado in ('nova', 'investigando', 'acao_necessaria', 'aprovada', 'recorrente');

create index if not exists sentinel_occurrences_org_estado_idx
  on public.sentinel_occurrences (organization_id, estado, severidade, ultima_vista_em desc);

create index if not exists sentinel_occurrences_org_regra_idx
  on public.sentinel_occurrences (organization_id, regra, ultima_vista_em desc);

create index if not exists sentinel_occurrences_entidade_idx
  on public.sentinel_occurrences (organization_id, entidade_tipo, entidade_id);

alter table public.sentinel_occurrences enable row level security;

drop policy if exists sentinel_occurrences_select on public.sentinel_occurrences;
create policy sentinel_occurrences_select on public.sentinel_occurrences
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

-- A tabela é SOMENTE LEITURA por sessão. A mudança de estado passa pela rota
-- PATCH, que valida transição e chama `fn_sentinel_aplicar_mudanca` com service
-- role. Sem UPDATE direto, um agent não consegue reescrever a própria evidência
-- nem "aprovar" por PostgREST contornando a máquina de estados.
revoke all on public.sentinel_occurrences from anon;
grant select on public.sentinel_occurrences to authenticated;
grant all on public.sentinel_occurrences to service_role;

drop trigger if exists trg_sentinel_occurrences_updated_at on public.sentinel_occurrences;
create trigger trg_sentinel_occurrences_updated_at
  before update on public.sentinel_occurrences
  for each row execute function public.fn_set_updated_at();

comment on table public.sentinel_occurrences is
  'Ocorrência detectada pelo Sentinel v1 (somente leitura): evidência, causa provável, severidade e estado. Reexecução atualiza a aberta; não duplica.';
comment on column public.sentinel_occurrences.fingerprint is
  'Identidade do evento (regra+entidade+chave de grupo). Reexecução idempotente pelo índice parcial das abertas. Sem PII em claro.';
comment on column public.sentinel_occurrences.evidencia is
  'Mínimo para agir: ids, valores, estados e contagens. Nunca conversa, documento, telefone ou e-mail completo.';

-- ─── 4. Histórico — append-only, com antes/depois ──────────────────────────

create table if not exists public.sentinel_occurrence_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  occurrence_id uuid not null references public.sentinel_occurrences(id) on delete cascade,

  tipo text not null
    check (tipo in (
      'detectada', 'reafirmada', 'estado_alterado', 'atribuida',
      'nota', 'auto_encerrada', 'reaberta'
    )),

  estado_anterior text,
  estado_novo text,

  origem text not null default 'sistema'
    check (origem in ('sentinel', 'usuario', 'sistema')),

  ator_user_id uuid references auth.users(id) on delete set null,
  detalhe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sentinel_occurrence_events_ocorrencia_idx
  on public.sentinel_occurrence_events (organization_id, occurrence_id, created_at);

alter table public.sentinel_occurrence_events enable row level security;

drop policy if exists sentinel_occurrence_events_select on public.sentinel_occurrence_events;
create policy sentinel_occurrence_events_select on public.sentinel_occurrence_events
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

-- Escrita só pela função transacional com service role. O histórico é
-- append-only e não editável pela sessão: nem INSERT direto, nem UPDATE.
revoke all on public.sentinel_occurrence_events from anon;
grant select on public.sentinel_occurrence_events to authenticated;
grant all on public.sentinel_occurrence_events to service_role;

comment on table public.sentinel_occurrence_events is
  'Histórico append-only da ocorrência. Nenhum papel tem UPDATE/DELETE: a trilha não é editável pela tela.';

-- ─── 5. Funções do runner — a idempotência mora no banco ───────────────────

create or replace function public.fn_sentinel_registrar_ocorrencia(
  p_organization_id uuid,
  p_execucao_id uuid,
  p_fingerprint text,
  p_regra text,
  p_categoria text,
  p_entidade_tipo text,
  p_entidade_id text,
  p_titulo text,
  p_resumo text,
  p_causa_provavel text,
  p_severidade text,
  p_href text,
  p_evidencia jsonb
)
returns table (ocorrencia_id uuid, estado_resultante text, criada boolean)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_anteriores integer;
  v_id uuid;
  v_estado text;
  v_criada boolean;
begin
  -- Ocorrências FECHADAS da mesma fingerprint: é o que transforma a volta do
  -- evento em `recorrente` em vez de uma `nova` sem memória.
  select count(*)::integer
    into v_anteriores
    from public.sentinel_occurrences o
   where o.organization_id = p_organization_id
     and o.fingerprint = p_fingerprint
     and o.estado in ('corrigida', 'ignorada', 'encerrada');

  insert into public.sentinel_occurrences (
    organization_id, fingerprint, regra, categoria, entidade_tipo, entidade_id,
    titulo, resumo, causa_provavel, severidade, evidencia, href,
    estado, recorrencias, ultima_execucao_id
  )
  values (
    p_organization_id, p_fingerprint, p_regra, p_categoria, p_entidade_tipo, p_entidade_id,
    p_titulo, p_resumo, p_causa_provavel, p_severidade,
    coalesce(p_evidencia, '{}'::jsonb), p_href,
    case when v_anteriores > 0 then 'recorrente' else 'nova' end,
    v_anteriores, p_execucao_id
  )
  on conflict (organization_id, fingerprint)
    where estado in ('nova', 'investigando', 'acao_necessaria', 'aprovada', 'recorrente')
  do update set
    ultima_vista_em = now(),
    vezes_vista = public.sentinel_occurrences.vezes_vista + 1,
    ultima_execucao_id = excluded.ultima_execucao_id,
    severidade = excluded.severidade,
    titulo = excluded.titulo,
    resumo = excluded.resumo,
    causa_provavel = excluded.causa_provavel,
    evidencia = excluded.evidencia,
    href = excluded.href,
    updated_at = now()
  returning public.sentinel_occurrences.id,
            public.sentinel_occurrences.estado,
            (xmax = 0)
    into v_id, v_estado, v_criada;

  insert into public.sentinel_occurrence_events (
    organization_id, occurrence_id, tipo, estado_novo, origem, detalhe
  )
  values (
    p_organization_id, v_id,
    case when v_criada then 'detectada' else 'reafirmada' end,
    v_estado, 'sentinel',
    jsonb_build_object('execucao_id', p_execucao_id, 'regra', p_regra)
  );

  return query select v_id, v_estado, v_criada;
end;
$fn$;

revoke execute on function public.fn_sentinel_registrar_ocorrencia(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.fn_sentinel_registrar_ocorrencia(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb
) to service_role;

comment on function public.fn_sentinel_registrar_ocorrencia(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb
) is
  'Upsert idempotente de ocorrência + evento de histórico. Só service_role (runner). O ON CONFLICT infere o índice parcial das abertas.';

create or replace function public.fn_sentinel_encerrar_ausentes(
  p_organization_id uuid,
  p_execucao_id uuid,
  p_regras text[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_total integer;
begin
  with alvo as (
    select o.id, o.estado
      from public.sentinel_occurrences o
     where o.organization_id = p_organization_id
       and o.estado in ('nova', 'investigando', 'acao_necessaria', 'aprovada', 'recorrente')
       and o.regra = any(p_regras)
       and o.ultima_execucao_id is distinct from p_execucao_id
       for update
  ), fechadas as (
    update public.sentinel_occurrences o
       set estado = 'encerrada',
           encerrada_em = now(),
           motivo_encerramento = 'nao_detectada_na_execucao',
           updated_at = now()
      from alvo a
     where o.id = a.id
    returning o.id
  ), eventos as (
    insert into public.sentinel_occurrence_events (
      organization_id, occurrence_id, tipo, estado_anterior, estado_novo, origem, detalhe
    )
    select p_organization_id, a.id, 'auto_encerrada', a.estado, 'encerrada', 'sistema',
           jsonb_build_object('execucao_id', p_execucao_id, 'motivo', 'nao_detectada_na_execucao')
      from alvo a
      join fechadas f on f.id = a.id
    returning 1
  )
  select count(*)::integer into v_total from fechadas;

  return v_total;
end;
$fn$;

revoke execute on function public.fn_sentinel_encerrar_ausentes(uuid, uuid, text[])
  from public, anon, authenticated;
grant execute on function public.fn_sentinel_encerrar_ausentes(uuid, uuid, text[])
  to service_role;

comment on function public.fn_sentinel_encerrar_ausentes(uuid, uuid, text[]) is
  'Fecha ocorrências abertas que a execução não reencontrou, registrando o evento. Nunca chamada em rodada truncada.';

create or replace function public.fn_sentinel_expurgar(
  p_organization_id uuid,
  p_dias integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_total integer;
  v_dias integer;
begin
  -- Piso no CORPO, não em quem chama: nem a service key apaga rastro de
  -- ocorrência com menos de 30 dias de encerrada.
  v_dias := greatest(coalesce(p_dias, 180), 30);

  delete from public.sentinel_occurrences o
   where o.organization_id = p_organization_id
     and o.estado in ('corrigida', 'ignorada', 'encerrada')
     and coalesce(o.encerrada_em, o.updated_at) < now() - make_interval(days => v_dias);

  get diagnostics v_total = row_count;

  -- A rodada também é histórico operacional: 90 dias bastam para responder
  -- "o cron rodou?" e não deixam a tabela crescer para sempre numa VPS.
  delete from public.sentinel_runs r
   where r.organization_id = p_organization_id
     and r.status in ('sucesso', 'parcial', 'erro', 'ignorada')
     and r.iniciado_em < now() - interval '90 days';

  return v_total;
end;
$fn$;

revoke execute on function public.fn_sentinel_expurgar(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.fn_sentinel_expurgar(uuid, integer) to service_role;

comment on function public.fn_sentinel_expurgar(uuid, integer) is
  'Retenção LGPD: apaga ocorrências TERMINAIS acima da janela (piso 30 dias no corpo). Ocorrência aberta nunca é tocada.';

-- ─── 6. Duplicidade de cliente por e-mail — agregado sem varrer no app ─────
--
-- `contacts.phone_number` já tem unique parcial por org; e-mail não tem, e a
-- detecção precisa do agregado inteiro (não de uma página). A view é
-- `security_invoker`: quem consulta com sessão continua sujeito à RLS de
-- `contacts`; o runner usa service role e filtra a organização.

create or replace view public.sentinel_contatos_duplicados
with (security_invoker = true)
as
select
  c.organization_id,
  c.email_normalized as chave,
  count(*)::integer as total,
  (array_agg(c.id order by c.created_at))[1:20] as ids
from public.contacts c
where c.email_normalized is not null
  and c.email_normalized <> ''
  and c.is_anonymized = false
  and c.is_merged_into is null
group by c.organization_id, c.email_normalized
having count(*) > 1;

revoke all on public.sentinel_contatos_duplicados from anon;
grant select on public.sentinel_contatos_duplicados to authenticated;
grant select on public.sentinel_contatos_duplicados to service_role;

comment on view public.sentinel_contatos_duplicados is
  'Clientes com o mesmo e-mail normalizado na organização. Agregado para o detector; security_invoker mantém a RLS de contacts.';

-- ─── 7. Mudança de estado atômica (UPDATE + histórico na mesma transação) ──
--
-- A validação da transição vive em TypeScript (`lib/sentinel/estado.ts`) porque
-- é regra de produto e precisa de teste unitário legível. O que NÃO pode ficar
-- em duas chamadas HTTP é o efeito: estado mudou e o evento não gravou (ou o
-- contrário) transforma o histórico em ficção. Esta função fecha a transação.

create or replace function public.fn_sentinel_aplicar_mudanca(
  p_organization_id uuid,
  p_occurrence_id uuid,
  p_estado text,
  p_ignorada_motivo text,
  p_motivo_encerramento text,
  p_encerrada_em timestamptz,
  p_responsavel_user_id uuid,
  p_ator uuid,
  p_motivo text
)
returns table (ocorrencia_id uuid, estado_anterior text, estado_novo text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_anterior text;
begin
  select o.estado
    into v_anterior
    from public.sentinel_occurrences o
   where o.id = p_occurrence_id
     and o.organization_id = p_organization_id
     for update;

  if v_anterior is null then
    return;
  end if;

  update public.sentinel_occurrences o
     set estado = p_estado,
         ignorada_motivo = p_ignorada_motivo,
         motivo_encerramento = p_motivo_encerramento,
         encerrada_em = p_encerrada_em,
         responsavel_user_id = coalesce(p_responsavel_user_id, o.responsavel_user_id),
         updated_at = now()
   where o.id = p_occurrence_id
     and o.organization_id = p_organization_id;

  insert into public.sentinel_occurrence_events (
    organization_id, occurrence_id, tipo, estado_anterior, estado_novo,
    origem, ator_user_id, detalhe
  )
  values (
    p_organization_id, p_occurrence_id, 'estado_alterado', v_anterior, p_estado,
    'usuario', p_ator, jsonb_build_object('motivo', p_motivo)
  );

  return query select p_occurrence_id, v_anterior, p_estado;
end;
$fn$;

revoke execute on function public.fn_sentinel_aplicar_mudanca(
  uuid, uuid, text, text, text, timestamptz, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.fn_sentinel_aplicar_mudanca(
  uuid, uuid, text, text, text, timestamptz, uuid, uuid, text
) to service_role;

comment on function public.fn_sentinel_aplicar_mudanca(
  uuid, uuid, text, text, text, timestamptz, uuid, uuid, text
) is
  'Atualiza o estado da ocorrência e grava o evento na MESMA transação. Transição validada em lib/sentinel/estado.ts.';
