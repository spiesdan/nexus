-- 0268 — FECHAMENTO DE CARGA: o que o PDF de romaneio deixava em branco
--
-- O PDF imprimia a conferência de caixa como OITO LINHAS VAZIAS — dinheiro,
-- PIX, cartão, cheques, boletos, menos vale ao motorista, menos combustível e
-- menos outras despesas — mais "total líquido entregue ao caixa" e "diferença
-- (sobra/falta)". Eram preenchidas no papel, guardadas em arquivo físico, e a
-- diferença era conferida de olho.
--
-- Aqui as oito viram dados. Duas decisões, ambas forçadas pelo que já existe:
--
-- 1. AS LINHAS SÃO UM JSONB COM CHAVE, NÃO OITO COLUNAS. A lista vem do PDF,
--    que o dono já conhece. Com oito colunas, acrescentar a nona linha — taxa
--    de cartão, vale de combustível — vira migration, backfill e migração de
--    dado. Com uma linha por item no JSONB, vira um item novo, e a matemática
--    (`lib/comercial/fechamento-carga.ts`) itera a lista.
--
-- 2. O FECHAMENTO É UMA LINHA POR CARGA, NÃO UM POR PARADA. O caixa é
--    conferido uma vez, no fim da rota; as paradas entram pela conferência
--    (`shipment_orders.conferido`), que é o ☐ do PDF e é dado de pedido.
--
-- O QUE NÃO ESTÁ AQUI, DE PROPÓSITO:
--
-- - Não há "fechado por" obrigatório nem trava de status. A regra de quem pode
--   fechar uma carga é decisão da empresa e NÃO está escrita neste repositório
--   (ver AGENTS.md, "nunca invente regra de negócio"). O que o código exige é
--   o que é verdade física: uma linha conferida.
--
-- - `dinheiro_cents` etc. NÃO são NOT NULL com default 0 porque a linha pode
--   não ter sido contada ainda, e "não contada" é informação: distingue carga
--   em conferência de carga com caixa declarado em zero.

-- ─── A linha de conferência por parada (o ☐ do PDF) ────────────────────────
--
-- `conferido` é separado de `status` de propósito. `status` diz o que ACONTECEU
-- na rota (entregue, devolvido, separado); `conferido` diz se alguém OLHOU o
-- pedido e batou o valor. Uma parada entregue e não conferida é o caso que
-- fecha caixa com dinheiro faltando — e é o que o ☐ do papel impedia.

alter table public.shipment_orders
  add column if not exists conferido boolean not null default false;

comment on column public.shipment_orders.conferido is
  'Conferencia manual do pedido no fechamento da carga (o ☐ do romaneio em papel). Independe do status: status diz o que aconteceu na rota, isto diz se alguem olhou.';

-- ─── O fechamento da carga ─────────────────────────────────────────────────
create table if not exists public.shipment_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shipment_id uuid not null references public.shipments (id) on delete cascade,

  -- As oito linhas do PDF, com o valor contado em cents. Ausente = não contada.
  -- `chave` é o que amarra ao campo: dinheiro, pix, cartao, cheques, boletos,
  -- vale_motorista, combustivel, outras_despesas.
  linhas jsonb not null default '[]'::jsonb,

  -- As três somas que o PDF deixava em branco. Calculadas pelo SERVIDOR
  -- (`contaDoCaixa`), nunca aceitas do corpo da requisição: o cliente informaria
  -- um número que ele mesmo inventou, e a conferência é justamente o oposto de
  -- aceitar o número de quem confere.
  entradas_cents bigint not null default 0,
  saidas_cents bigint not null default 0,
  liquido_cents bigint not null default 0,
  esperado_cents bigint not null default 0,
  diferenca_cents bigint not null default 0,

  -- Quem, e quando. `conferente_nome` é texto livre porque o conferente
  -- pode não ter conta no sistema (é quem recebe o papel na porta).
  conferente_nome text,
  conferente_user_id uuid references auth.users (id) on delete set null,
  conferido_em timestamptz,
  observacao text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint shipment_closings_valores_nao_negativos
    check (entradas_cents >= 0 and saidas_cents >= 0 and liquido_cents >= 0 and esperado_cents >= 0)
);

-- Uma linha por carga: a carga é a unidade do fechamento.
create unique index if not exists shipment_closings_carga_unico
  on public.shipment_closings (shipment_id);

create index if not exists shipment_closings_org_idx
  on public.shipment_closings (organization_id, updated_at desc);

comment on table public.shipment_closings is
  'Conferencia de caixa da rota: as oito linhas do PDF de romaneio, gravadas. As somas sao calculadas no servidor.';
comment on column public.shipment_closings.linhas is
  'Oito pares {chave, valor_cents} na ordem do PDF. Ausente = linha nao contada, que e diferente de contada em zero.';
comment on column public.shipment_closings.diferenca_cents is
  'liquido menos esperado. Positivo sobrou, negativo faltou. Calculado pelo servidor.';

-- ─── RLS: mesma regra das outras tabelas de expedição ──────────────────────
alter table public.shipment_closings enable row level security;

drop policy if exists shipment_closings_select on public.shipment_closings;
create policy shipment_closings_select on public.shipment_closings
  for select
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());

drop policy if exists shipment_closings_insert on public.shipment_closings;
create policy shipment_closings_insert on public.shipment_closings
  for insert
  with check (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());

drop policy if exists shipment_closings_update on public.shipment_closings;
create policy shipment_closings_update on public.shipment_closings
  for update
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());

drop policy if exists shipment_closings_delete on public.shipment_closings;
create policy shipment_closings_delete on public.shipment_closings
  for delete
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());