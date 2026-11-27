-- 0366 — PROSPECÇÃO MAPS: CHECKPOINT POR TERMO E TRAVAS VISÍVEIS.
--
-- O sidecar `gosom/google-maps-scraper` não tem `-resume`: a retomada é nossa e
-- a unidade é TERMO × CIDADE (plano v5, §4). `progresso` guarda exatamente o
-- que o tick precisa para continuar sem estado em memória:
--   { termos_total, termos_concluidos[], termos_falhos[], termo_atual,
--     tentativas, bloqueio: { motivo, em } | null }
--
-- `motivo_zero` responde à pergunta que "0 encontrados" não responde: foi
-- zero de verdade, ou o sidecar estava fora? A tela mostra o motivo e as
-- alternativas (ampliar raio, OSM, Places) em vez de uma lista vazia.
--
-- `degradada` marca a busca que rodou com o sidecar fora e caiu para outro
-- provider; não é status novo (status continua queued/running/paused/...).
--
-- As travas por organização ganham colunas próprias porque `limite_diario`
-- existente é o teto de RESULTADOS, não de BUSCAS. Padrão conservador do
-- plano: 20 resultados/busca (`limite_por_busca` já existe), 20 buscas/hora,
-- 100 buscas/dia e jitter de 1,5 s entre termos.
--
-- Aditiva e idempotente; sem backfill (buscas antigas ficam com `{}`, que o
-- leitor trata como "sem checkpoint" e reexecuta do zero).

alter table public.prospecting_searches
  add column if not exists progresso jsonb not null default '{}'::jsonb;

alter table public.prospecting_searches
  add column if not exists motivo_zero text;

alter table public.prospecting_searches
  add column if not exists degradada boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prospecting_searches_progresso_objeto'
  ) then
    alter table public.prospecting_searches
      add constraint prospecting_searches_progresso_objeto
      check (jsonb_typeof(progresso) = 'object');
  end if;
end $$;

alter table public.prospecting_settings
  add column if not exists limite_buscas_hora integer not null default 20;

alter table public.prospecting_settings
  add column if not exists limite_buscas_dia integer not null default 100;

alter table public.prospecting_settings
  add column if not exists jitter_ms integer not null default 1500;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prospecting_settings_buscas_positivas'
  ) then
    alter table public.prospecting_settings
      add constraint prospecting_settings_buscas_positivas
      check (limite_buscas_hora > 0 and limite_buscas_dia > 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'prospecting_settings_jitter_faixa'
  ) then
    alter table public.prospecting_settings
      add constraint prospecting_settings_jitter_faixa
      check (jitter_ms >= 0 and jitter_ms <= 60000);
  end if;
end $$;

comment on column public.prospecting_searches.progresso is
  'Checkpoint por termo×cidade (plano v5 §4): termos_total, termos_concluidos[], termos_falhos[], termo_atual, tentativas, bloqueio. Conclusão de termo grava contadores e upsert dos prospects na mesma transação.';
comment on column public.prospecting_searches.motivo_zero is
  'Por que a busca devolveu zero: sem resultados reais, sidecar fora, bloqueio etc. Zero nunca é tela vazia sem motivo.';
comment on column public.prospecting_searches.degradada is
  'A busca rodou com o sidecar Maps fora e caiu para OSM/Places. Não é status novo; a tela mostra a degradação.';
comment on column public.prospecting_settings.limite_buscas_hora is
  'Teto de buscas iniciadas por hora (relógio), separado do teto de resultados. Padrão 20.';
comment on column public.prospecting_settings.limite_buscas_dia is
  'Teto de buscas iniciadas por dia UTC. Padrão 100.';
comment on column public.prospecting_settings.jitter_ms is
  'Intervalo aleatório entre termos para não bater no fornecedor em rajada. Padrão 1500 ms.';
