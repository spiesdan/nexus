-- 0276_rastreio_e_contato_no_cliente
--
-- O QUE MUDOU
--
-- O bloco "DETALHES DO PEDIDO" do Mercos tem dois campos que nós não tínhamos
-- onde guardar:
--
--   Rastreamento ....... o código que a transportadora devolve depois da coleta
--   Contato no cliente . a pessoa que fez o pedido do lado do comprador
--
-- São dois textos curtos, nullable e sem default. Nenhum dos dois participa de
-- cálculo: são anotação operacional — e são justamente os dois que alguém
-- procura quando o cliente liga perguntando onde está a carga ("fala com quem
-- pediu", "me passa o rastreio").
--
-- ─── POR QUE COLUNA, E NÃO `observacoes` ───────────────────────────────────
--
-- Porque observação é texto livre de 2000 caracteres que qualquer um edita e
-- que o PDF imprime inteiro; rastreamento é um código que a tela precisa
-- exibir sozinho, com rótulo próprio, como o Mercos exibe. Enterrar os dois no
-- texto livre faria a informação depender de alguém digitá-la num formato
-- combinado — que é o mesmo que não ter o campo.
--
-- ─── O QUE ESTA MIGRATION NÃO FAZ ─────────────────────────────────────────
--
-- Não cria índice (não se busca pedido por rastreio — a busca é por cliente e
-- por número), não mexe em policy (as colunas entram numa tabela que já é
-- tenant-aware e já tem RLS) e não toca em grant. Texto e não `varchar(n)`
-- pelo mesmo motivo do resto do schema: o CHECK segura o tamanho e mudá-lo
-- depois não exige reescrever a tabela.

alter table public.commercial_orders
  add column if not exists rastreamento text,
  add column if not exists contato_no_cliente text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'commercial_orders_rastreamento_tamanho'
  ) then
    alter table public.commercial_orders
      add constraint commercial_orders_rastreamento_tamanho
      check (rastreamento is null or char_length(rastreamento) <= 120);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'commercial_orders_contato_no_cliente_tamanho'
  ) then
    alter table public.commercial_orders
      add constraint commercial_orders_contato_no_cliente_tamanho
      check (contato_no_cliente is null or char_length(contato_no_cliente) <= 120);
  end if;
end $$;

comment on column public.commercial_orders.rastreamento is
  'Código de rastreio da transportadora (0276). Anotação operacional; não entra em cálculo.';
comment on column public.commercial_orders.contato_no_cliente is
  'Quem fez o pedido do lado do comprador (0276). Anotação operacional; não entra em cálculo.';
