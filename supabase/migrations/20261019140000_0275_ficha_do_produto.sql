-- 0275_ficha_do_produto
--
-- O QUE MUDOU
--
-- A ficha do produto copiava menos campos do que o Mercos oferece. A tela de
-- lá tem, por produto, além do que já gravávamos:
--
--   Informações gerais ....... IPI, NCM (já temos), Comissão (já temos),
--                              Observações
--   Preço ..................... Venda em múltiplos de
--   Peso e dimensões .......... peso bruto, largura, altura e comprimento —
--                              da UNIDADE e da CAIXA MASTER
--   Variações ................. cores e tamanhos
--
-- Esta migration é o que faltava. `comissao_pct` (0272/`20261010000000`) já
-- existia no banco — o que faltava nela era a TELA, não a coluna.
--
-- ─── POR QUE COLUNA, E NÃO JSONB ───────────────────────────────────────────
--
-- Peso e dimensões são o que a cotação de frete lê e o que a etiqueta imprime.
-- Em jsonb, a primeira consulta "quais caixas passam de 30 kg" vira varredura
-- com cast e sem CHECK. `variacoes` É jsonb, e é exceção justificada: é uma
-- lista curta e aberta (cores e tamanhos que a loja inventa) e ninguém filtra
-- por ela — quem filtra é a tabela de SKUs, que o Mercos gera e nós ainda não.
--
-- ─── POR QUE `numeric`, E NÃO `integer` ────────────────────────────────────
--
-- Peso de estopa é 0,480 kg e comissão é 70,00 %. Arredondar para inteiro na
-- coluna é o que faz 0,48 virar 0 — e o frete sair de graça.
--
-- Nada aqui tem FK, index ou policy nova: são colunas de uma tabela que já é
-- tenant-aware (a policy de `catalog_products` continua valendo por linha).
-- SEM TABELA NOVA, SEM GRANT NOVO.

alter table public.catalog_products
  add column if not exists ipi_pct numeric(5, 2);

alter table public.catalog_products
  add column if not exists multiplo integer not null default 1;

alter table public.catalog_products
  add column if not exists observacoes text;

alter table public.catalog_products
  add column if not exists peso_bruto_kg numeric(10, 3),
  add column if not exists largura_cm numeric(8, 2),
  add column if not exists altura_cm numeric(8, 2),
  add column if not exists comprimento_cm numeric(8, 2);

alter table public.catalog_products
  add column if not exists caixa_peso_bruto_kg numeric(10, 3),
  add column if not exists caixa_largura_cm numeric(8, 2),
  add column if not exists caixa_altura_cm numeric(8, 2),
  add column if not exists caixa_comprimento_cm numeric(8, 2);

alter table public.catalog_products
  add column if not exists variacoes jsonb;

-- ─── Os CHECKs ─────────────────────────────────────────────────────────────
-- A faixa do IPI espelha a da comissão (0..100): o campo é %, e uma linha de
-- 700 é 70% digitado com o separador no lugar errado — a importação de planilha
-- é a origem provável, e ela precisa bater na parede aqui.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'catalog_products_ipi_faixa'
  ) then
    alter table public.catalog_products
      add constraint catalog_products_ipi_faixa
      check (ipi_pct is null or (ipi_pct >= 0 and ipi_pct <= 100));
  end if;
end $$;

-- "Venda em múltiplos de 1" é o caso normal; 0 não existe (não se vende zero
-- unidades por vez e a multiplicação do item do pedido daria quantidade 0).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'catalog_products_multiplo_valido'
  ) then
    alter table public.catalog_products
      add constraint catalog_products_multiplo_valido check (multiplo >= 1);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'catalog_products_dimensoes_nao_negativas'
  ) then
    alter table public.catalog_products
      add constraint catalog_products_dimensoes_nao_negativas
      check (
        (peso_bruto_kg is null or peso_bruto_kg >= 0)
        and (largura_cm is null or largura_cm >= 0)
        and (altura_cm is null or altura_cm >= 0)
        and (comprimento_cm is null or comprimento_cm >= 0)
        and (caixa_peso_bruto_kg is null or caixa_peso_bruto_kg >= 0)
        and (caixa_largura_cm is null or caixa_largura_cm >= 0)
        and (caixa_altura_cm is null or caixa_altura_cm >= 0)
        and (caixa_comprimento_cm is null or caixa_comprimento_cm >= 0)
      );
  end if;
end $$;

-- `variacoes` é jsonb, mas o SHAPE importa: um array aqui faria a tela de
-- variações ler `.cores` de uma lista e receber `undefined` em silêncio.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'catalog_products_variacoes_forma'
  ) then
    alter table public.catalog_products
      add constraint catalog_products_variacoes_forma
      check (variacoes is null or jsonb_typeof(variacoes) = 'object');
  end if;
end $$;

comment on column public.catalog_products.ipi_pct is
  'IPI do produto em % (0..100). NULL = sem IPI informado, que não é o mesmo que 0.';
comment on column public.catalog_products.multiplo is
  'Venda em múltiplos de N unidades (>= 1). 1 = vende solto.';
comment on column public.catalog_products.observacoes is
  'Informações adicionais do produto (campo "Observações" do Mercos). Interno: não vai para a vitrine.';
comment on column public.catalog_products.peso_bruto_kg is
  'Peso bruto da UNIDADE, em kg. É o que o frete lê.';
comment on column public.catalog_products.caixa_peso_bruto_kg is
  'Peso bruto da CAIXA MASTER, em kg. NULL = produto não vendido por caixa fechada.';
comment on column public.catalog_products.variacoes is
  'Cores e tamanhos: {"cores": [...], "tamanhos": [...]}. NÃO gera SKU filho como no Mercos — ver docs.';
