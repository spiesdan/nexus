-- FASE 8 da spec 19 (item 16 — FILA DE PROSPECÇÃO): o prospect ganha DONO
-- (vendedor) e PRÓXIMO PASSO. B11 da auditoria: sem owner não existe "minha
-- fila" nem "atribuir a", e sem próximo passo a próxima ação não vive no
-- produto. Aditiva: duas colunas + um índice parcial. RLS inalterada — as
-- polizas já são por linha e cobrem colunas novas; nenhuma função nova.

alter table public.business_prospects
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists proximo_passo text;

-- "Minha fila" = organization + dono. Parcial porque a maioria dos prospects
-- nasce sem dono e NULL não deve ocupar índice; sem ele o filtro da fila é
-- Scan da base do tenant a cada abertura da aba.
create index if not exists business_prospects_org_owner_idx
  on public.business_prospects (organization_id, owner_user_id)
  where owner_user_id is not null;

comment on column public.business_prospects.owner_user_id is
  'Vendedor dono do prospect na fila (item 16 da spec 19). NULL = sem dono; nao entra na fila de ninguem. On delete set null: sair do time desvincula, nao apaga o prospect.';
comment on column public.business_prospects.proximo_passo is
  'Proxima acao combinada pelo vendedor no drawer (item 16 da spec 19). Texto livre do produto, nao do provider.';
