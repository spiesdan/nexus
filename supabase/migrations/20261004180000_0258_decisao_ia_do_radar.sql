-- 0258_decisao_ia_do_radar — a sugestão de ação do motor local, por negócio.
--
-- O radar já diz QUEM esfriou e há quanto tempo (0078). A sugestão diz O QUE
-- FAZER a respeito — reativar, aguardar ou encerrar — é uma pergunta por lead
-- para o checkpoint que roda nesta mesma VPS (laya-serve, rede interna).
--
-- Grava-se a DECISÃO, nunca o texto do prompt nem a transcrição: o estado é
-- regerado a cada passada, e copiar corpo de mensagem para uma tabela nova
-- seria conteúdo de cliente em dobro no banco, para um dado que ninguém lê.
--
-- FORA da publicação supabase_realtime DE PROPOSITO. Diferente de
-- `crm_lead_risk_states` — que é mudança de estado do negocio e o board
-- acompanha em tempo real — uma decisao e avaliacao: regrava-la a cada tick
-- publicaria evento sem mudanca visivel, o exato defeito que a 0078 separou
-- para impedir. A tela le por request, junto com o radar.

create table if not exists public.crm_lead_risk_decisions (
  lead_id uuid primary key references public.crm_leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- O vocabulario e o mesmo do `choice` enviado ao modelo, e o mesmo que o chip
  -- da tela traduz. Um CHECK novo em cima dele e o que impede a primeira
  -- resposta malformada de virar rotulo invisivel na UI.
  acao text not null,
  -- Calibracao do proprio modelo, quando ele a devolve. NULL = veio sem ou o
  -- provedor nao expoe; NUNCA preenchida com 1 por omissao — confianca
  -- inventada e pior que confianca ausente.
  confianca real,
  -- Qual checkpoint respondeu (nome do modelo), para saber o que mudou quando
  -- a sugestao de ontem e diferente da de hoje.
  modelo text,
  decidido_em timestamptz not null default now()
);

comment on table public.crm_lead_risk_decisions is
  'Sugestao de acao do motor de decisao (laya-serve) para um negocio no radar: reativar, aguardar ou encerrar. Uma linha por negocio (PK em lead_id), regravada a cada nova travessia fria. FORA da publicacao realtime de proposito: e avaliacao, nao estado — a tela le junto do radar, por request.';

alter table public.crm_lead_risk_decisions
  drop constraint if exists crm_lead_risk_decisions_acao_check;
alter table public.crm_lead_risk_decisions
  add constraint crm_lead_risk_decisions_acao_check check (
    acao = any (array['reativar', 'aguardar', 'encerrar']::text[])
  );

alter table public.crm_lead_risk_decisions
  drop constraint if exists crm_lead_risk_decisions_confianca_faixa;
alter table public.crm_lead_risk_decisions
  add constraint crm_lead_risk_decisions_confianca_faixa check (
    confianca is null or (confianca >= 0 and confianca <= 1)
  );

alter table public.crm_lead_risk_decisions enable row level security;

drop policy if exists tenant_isolation_crm_lead_risk_decisions_all on public.crm_lead_risk_decisions;
create policy tenant_isolation_crm_lead_risk_decisions_all
  on public.crm_lead_risk_decisions
  for all
  using (organization_id in (select fn_user_org_ids()))
  with check (organization_id in (select fn_user_org_ids()));

-- O radar le "quem tem decisao nesta org" numa unica passada por tick.
create index if not exists idx_crm_lead_risk_decisions_org
  on public.crm_lead_risk_decisions (organization_id, decidido_em);
