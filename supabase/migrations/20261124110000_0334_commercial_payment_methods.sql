-- 0334 — FORMAS DE PAGAMENTO CONFIGURÁVEIS (COMERCIAL), COM FORMA E PRAZO SEPARADOS.
--
-- Hoje `FORMAS_DE_PAGAMENTO` em `lib/comercial/pedido-fiscal.ts` mistura duas
-- perguntas numa só lista: a_vista / agendado_30 / agendado_45 são PRAZOS, não
-- formas de pagamento. A emissão, por sua vez, usa `tPag` (código fiscal da
-- NF-e) e transforma qualquer coisa fora da lista em "99 — Outros". A tela de
-- configuração não existia: a organização recebia três valores fixos para
-- sempre.
--
-- Esta migration cria `commercial_payment_methods`, tenant-aware, com `tipo` separando
-- 'forma' (o MEIO de pagamento, com `tpag` da tabela oficial) de 'prazo' (o
-- VENCIMENTO, com `dias_prazo`). A semente preserva os três prazos atuais e
-- oferece três formas (dinheiro, PIX, boleto) — nenhuma regra fiscal nova.
--
-- Fonte do `tpag`: tabela oficial do leiaute da NF-e, Nota Técnica 2020.006
-- (espelhada em `lib/schemas/fiscal.ts:55` / `ROTULO_DA_FORMA_DE_PAGAMENTO`,
-- que por sua vez cita o XSD PL_009_V4). Códigos sem confirmação não são
-- inventados: o campo fica nulo e a tela mostra a pendência.
--
-- RLS: membro lê a própria org; só manager (ou platform_admin) escreve.
-- organization_id SEMPRE vem da sessão na rota, nunca do corpo.

create table if not exists public.commercial_payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  /** 'forma' = meio de pagamento (tpag); 'prazo' = vencimento (dias_prazo). */
  tipo text not null check (tipo in ('forma', 'prazo')),
  codigo text not null,
  nome text not null,
  /** tPag oficial da NF-e (2 dígitos). Só preenchido quando `tipo = 'forma'`. */
  tpag text,
  /** Dias até o vencimento; 0 = à vista. Só preenchido quando `tipo = 'prazo'`. */
  dias_prazo integer,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_payment_methods_org_codigo_key unique (organization_id, codigo),
  constraint commercial_payment_methods_forma_tpag check (
    tipo <> 'forma' or tpag is null or tpag ~ '^[0-9]{2}$'
  ),
  constraint commercial_payment_methods_prazo_dias check (
    tipo <> 'prazo' or dias_prazo is not null
  )
);

create index if not exists commercial_payment_methods_org_idx
  on public.commercial_payment_methods (organization_id, tipo, ativo);

alter table public.commercial_payment_methods enable row level security;

drop policy if exists commercial_payment_methods_select on public.commercial_payment_methods;
create policy commercial_payment_methods_select on public.commercial_payment_methods
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists commercial_payment_methods_write on public.commercial_payment_methods;
create policy commercial_payment_methods_write on public.commercial_payment_methods
  for all using (
    public.fn_is_platform_admin()
    or public.fn_role_at_least(organization_id, 'manager')
  )
  with check (
    public.fn_is_platform_admin()
    or public.fn_role_at_least(organization_id, 'manager')
  );

revoke all on public.commercial_payment_methods from anon;
grant select, insert, update, delete on public.commercial_payment_methods to authenticated;
grant all on public.commercial_payment_methods to service_role;

drop trigger if exists trg_commercial_payment_methods_updated_at on public.commercial_payment_methods;
create trigger trg_commercial_payment_methods_updated_at
  before update on public.commercial_payment_methods
  for each row execute function public.fn_set_updated_at();

comment on table public.commercial_payment_methods is
  'Formas de pagamento (tPag oficial) e prazos da organização — configuráveis pelo manager.';

-- Semente idempotente: as 3 formas (com tPag confirmado na NT 2020.006) e os
-- 3 prazos que hoje são as únicas opções do criador. `on conflict do nothing`
-- preserva o que o operador já editou numa instalação existente.
insert into public.commercial_payment_methods (organization_id, tipo, codigo, nome, tpag, dias_prazo)
select o.id, 'forma', v.codigo, v.nome, v.tpag, null
from public.organizations o
cross join (values
  ('dinheiro', 'Dinheiro', '01'),
  ('pix', 'PIX', '17'),
  ('boleto', 'Boleto bancário', '15')
) as v(codigo, nome, tpag)
on conflict (organization_id, codigo) do nothing;

insert into public.commercial_payment_methods (organization_id, tipo, codigo, nome, tpag, dias_prazo)
select o.id, 'prazo', v.codigo, v.nome, null, v.dias
from public.organizations o
cross join (values
  ('a_vista', 'À vista', 0),
  ('agendado_30', 'Agendado — 30 dias', 30),
  ('agendado_45', 'Agendado — 45 dias', 45)
) as v(codigo, nome, dias)
on conflict (organization_id, codigo) do nothing;
