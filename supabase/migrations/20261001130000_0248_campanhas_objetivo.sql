-- spec 19, FASE 10 (§28 CAMPANHAS): cada campanha deve possuir "Objetivo".
-- Coluna opcional nas DUAS campanhas (D2: sem terceira tabela) — preenchida e
-- exibida no painel de campanhas, ao lado do funil Encontrados → … → Pedidos.
-- Aditiva e sem dado tocado: nada de insert/update, RLS inalterada.

alter table public.prospecting_campaigns
  add column if not exists objetivo text;

alter table public.automatic_sales_campaigns
  add column if not exists objetivo text;

comment on column public.prospecting_campaigns.objetivo is
  'Objetivo comercial da campanha de descoberta (spec 19, §28). Texto livre do produto; preenchido no painel de campanhas.';
comment on column public.automatic_sales_campaigns.objetivo is
  'Objetivo comercial da campanha de venda automatica (spec 19, §28). Texto livre do produto; preenchido no painel de campanhas.';
