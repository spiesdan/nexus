-- 0260_prospeccao_laya_fit — a qualificação automática dos prospects.
--
-- O radar (0258) gravou O QUE FAZER com negócio frio; aqui gravamos QUE envelope
-- comercial o prospect tem, resposta de uma única pergunta ao `laya-serve` local
-- (mesma VPS, rede interna) — espelha lib/leads/laya-decisao.ts em lib/prospeccao/laya-fit.ts.
--
-- Por que ENUM EM COLUNA e não tabela nova: são três letras com guarda, ao
-- contrário das decisões do radar que têm chave própria (pelo lead_id). Mesma
-- família de status_comercial: o CRM lê, filtra e barra pelo CHECK — valor
-- fora do conjunto não entra nem via PostgREST.
--
-- SEM ESTA COLUNA o cron prospecting-fit roda e não grava nada (SELECT ... is
-- null daqui, UPDATE ali): a tabela é quem liga o recurso, não a pergunta.

alter table public.business_prospects
  add column if not exists laya_fit text;

alter table public.business_prospects
  add column if not exists laya_fit_em timestamptz;

alter table public.business_prospects
  drop constraint if exists business_prospects_laya_fit_valido;
alter table public.business_prospects
  add constraint business_prospects_laya_fit_valido
  check (
    laya_fit is null
    or laya_fit = any (array['potencial', 'duvidoso', 'sem_potencial']::text[])
  );

-- Candidatos desta passada: status novo + fit ainda null. O cron lê por
-- organization_id com esse filtro — o índice parcial é o caminho dele.
create index if not exists business_prospects_fit_pendente_idx
  on public.business_prospects (organization_id, created_at desc)
  where laya_fit is null and status_comercial = 'novo' and bloqueado = false;

comment on column public.business_prospects.laya_fit is
  'potencial | duvidoso | sem_potencial — decisão do laya-serve (rede interna), única pergunta por prospect (migration 0260).';
