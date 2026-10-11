-- 0265_lab_avaliacoes — o Laboratório guarda nota, achados e transcrição.
--
-- ┌── Por que uma tabela e não log ──────────────────────────────────────
--
-- O valor do Laboratório está no DELTA: "rodei, mudei a campanha, rodei de
-- novo — melhorou?". Sem linhas guardadas não há delta, e sem delta o lab é
-- teatro. Cada rodada grava 6 linhas (uma por persona) com o hash da config
-- da campanha — o hash é o que diz se a conversa de hoje é comparável com a
-- de ontem.
--
-- ─── Por que `config_hash` e não a config inteira ─────────────────────────
--
-- O delta precisa saber se ALGO mudou, não o quê (o quê está no
-- `audit_log` e na própria campanha). Hash SHA-256 de
-- `perfil_abordagem + oferta_produtos + followup_textos`: barato, estável,
-- e comparar duas strings diz "mudou" sem diff de JSON.
--
-- ─── Sem FK para a campanha ─────────────────────────────────────────────
--
-- De propósito: se a campanha for excluída, o histórico do lab continua (é
-- a memória do que foi testado). `campanha_id` vira órfão nomeado, e
-- `campanha_nome` guarda o que se lia na época. Apagar histórico junto com
-- a campanha seria perder a prova de que o bot foi testado.
--
-- ─── RLS igual ao resto do tenant ──────────────────────────────────────
--
-- `organization_id in (select public.fn_user_org_ids()) or
-- public.fn_is_platform_admin()` — a mesma forma de `operational_alerts`
-- (0261). RLS com outro formato seria o segundo padrão, e dois padrões é
-- como um deles fica para trás.

create table if not exists public.lab_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campanha_id uuid,
  campanha_nome text not null default '',
  persona text not null,
  nota integer,
  resumo text not null default '',
  achados jsonb not null default '[]'::jsonb,
  transcricao jsonb not null default '[]'::jsonb,
  config_hash text not null default '',
  rodada_em timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now()
);

comment on table public.lab_avaliacoes is
  'Rodadas do Laboratório (0265): uma linha por persona por rodada, com nota, '
  'achados com evidência, transcrição e hash da config da campanha para o delta.';

comment on column public.lab_avaliacoes.nota is
  '0-100 do juiz. NULL = o juiz não respondeu de forma utilizável (não é zero).';

comment on column public.lab_avaliacoes.config_hash is
  'SHA-256 de perfil+oferta+followups da campanha na rodada. Delta só vale '
  'entre rodadas de mesmo hash.';

alter table public.lab_avaliacoes enable row level security;

drop policy if exists lab_avaliacoes_select on public.lab_avaliacoes;
create policy lab_avaliacoes_select on public.lab_avaliacoes
  for select using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

drop policy if exists lab_avaliacoes_insert on public.lab_avaliacoes;
create policy lab_avaliacoes_insert on public.lab_avaliacoes
  for insert with check (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

-- Sem update nem delete: rodada gravada é imutável. Corrigir histórico seria
-- reescrever a prova — e a prova é o ponto do lab.
