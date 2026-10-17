-- 0271_publico_da_base_na_campanha
--
-- O QUE MUDOU
--
-- `prospecting_campaigns.fonte_publico`: de onde a campanha tira o público.
--   busca  (padrão, o comportamento de sempre): fan-out de buscas por cidade ×
--          categoria no provider ativo. Gasta API e depende de chave.
--   base:  o público já está em `business_prospects` (importação de arquivo,
--          busca anterior, cadastro próprio). Sem API, sem chave, sem esperar.
--   ambas: a union das duas.
--
-- POR QUE ISSO EXISTE (medido em 2026-10-17 na instalação do usuário)
--
-- A base tinha 21.668 empresas (16.934 vindas de `maps_browser`, isto é,
-- importação de arquivo) e a única campanha mostrava **16** no funil. A causa
-- não é bug do painel: a fila da campanha sai de `prospect_search_results`, e a
-- importação de arquivo pula `vincularResultado` de propósito — arquivo não tem
-- busca para onde se ligar. Ou seja, quem tinha o dado na mão via a tela de
-- Empresas e via o Disparo, mas a aba Campanhas era cega a ele.
--
-- Para a mesma org, das 132 buscas: 5 concluídas, 60 failed, 67 canceladas. O
-- caminho que a campanha usava estava quase parado, e mesmo assim era o único.
--
-- SEM RLS NOVO: coluna numa tabela que já tem RLS e policies — quem enxerga a
-- campanha continua enxergando, e o filtro por organização continua na query.

alter table public.prospecting_campaigns
  add column if not exists fonte_publico text not null default 'busca';

alter table public.prospecting_campaigns
  drop constraint if exists prospecting_campaigns_fonte_publico_valida;

alter table public.prospecting_campaigns
  add constraint prospecting_campaigns_fonte_publico_valida
  check (fonte_publico in ('busca', 'base', 'ambas'));

comment on column public.prospecting_campaigns.fonte_publico is
  'de onde a campanha tira o público: busca (provider ativo), base (business_prospects já coletada) ou ambas';
