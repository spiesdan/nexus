-- 0292 — MODO ENTREGADOR: um login que abre só a expedição, no celular.
--
-- O entregador não é um papel de gestão: ele não vê cliente, pedido, financeiro
-- nem configuração. Dentro da organização ele continua `agent` (é o que as
-- policies de `shipments`/`shipment_orders` já exigem para dar baixa em
-- parada), e o que muda é a EXPERIÊNCIA: a casca sem menu, a home redirecionada
-- para a expedição e a lista restrita às cargas em rota.
--
-- Por que uma coluna e não um novo `role`: os cinco valores de
-- `user_organizations_role_check` atravessam dezenas de policies e funções
-- (`fn_role_at_least`, RLS por org). Um sexto papel exigiria revisar todas para
-- dizer o que ele NÃO pode — e qualquer esquecimento vira permissão a mais.
-- A flag não concede nada: ela só esconde tela.
--
-- Idempotente: roda em install (baseline) e em update (migration).

alter table public.user_organizations
  add column if not exists motorista boolean not null default false;

comment on column public.user_organizations.motorista is
  'Login de entregador: a casca esconde o menu, a home vai para a expedição e a lista mostra só cargas em rota. NÃO concede permissão — o acesso continua sendo o role.';
