-- ============================================================================
-- 0240 — SEPARAÇÃO DA CARGA (conferência antes da rota)
--
-- O fluxo §48 do NEXUS pede Separação entre Pedido e Carga; até aqui a
-- carga saía de `montando` para `em_rota` sem ninguém declarar o que foi
-- separado e conferido — o romaneio dizia o que DEVERIA ir, não o que FOI.
--
-- `shipment_orders` ganha a conferência por item (quando + por quem), sem
-- mexer no status de entrega e sem tabela nova:
--   separado_em  — carimbo da separação (NULL = ainda não separado);
--   separado_por — quem separou (auth.users, set null se o usuário sair).
-- A trava "só sai para rota tudo separado" mora na API (PATCH da carga),
-- não em trigger: trigger nunca faz HTTP nem decide fluxo (doutrina).
-- RLS inalterada (mesma tabela, mesmas policies).
-- ============================================================================

alter table public.shipment_orders
  add column if not exists separado_em timestamptz;

alter table public.shipment_orders
  add column if not exists separado_por uuid references auth.users(id) on delete set null;

comment on column public.shipment_orders.separado_em is
  'Quando o item foi separado e conferido (NULL = pendente). A carga só sai de montando com tudo separado.';

comment on column public.shipment_orders.separado_por is
  'Quem separou e conferiu o item.';
