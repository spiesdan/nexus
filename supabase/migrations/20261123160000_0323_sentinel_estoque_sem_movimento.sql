-- ============================================================================
-- 0323 — DIVERGÊNCIA DE ESTOQUE TAMBÉM QUANDO NÃO HÁ MOVIMENTAÇÃO.
--
-- A 0321 criou `sentinel_estoque_razao` com INNER JOIN em
-- `inventory_movements`: produto controlado criado depois da 0242 e sem nenhuma
-- movimentação ficava FORA da comparação. Mas o razão vazio também é evidência:
-- o saldo cacheado diz 50 e a soma das movimentações diz 0. Excluir esse caso
-- é esconder a divergência mais óbvia.
--
-- O `left join` mantém a mesma limitação estrutural: `inventory_movements` não
-- tem saldo de abertura, então a diferença continua sendo HIPÓTESE de baixa
-- confiança até a contagem física. O detector (`operacao.estoque_divergente`)
-- já exige um piso de diferença (máx. 10 unidades ou 10% do saldo), então
-- produto recém-criado com saldo pequeno não vira ruído.
--
-- A view continua `security_invoker`: a RLS de `catalog_products` e
-- `inventory_movements` vale para quem consulta com sessão. O runner usa
-- service role e filtra a organização explicitamente.
-- ============================================================================

create or replace view public.sentinel_estoque_razao
with (security_invoker = true)
as
select
  p.organization_id,
  p.id as product_id,
  p.codigo,
  p.nome,
  p.quantidade,
  coalesce(
    sum(
      case
        when m.tipo = 'entrada' then m.quantidade
        when m.tipo = 'saida' then -m.quantidade
        else m.quantidade
      end
    ),
    0
  )::bigint as saldo_razao,
  (
    p.quantidade - coalesce(
      sum(
        case
          when m.tipo = 'entrada' then m.quantidade
          when m.tipo = 'saida' then -m.quantidade
          else m.quantidade
        end
      ),
      0
    )
  )::bigint as diferenca,
  count(m.id)::integer as movimentos,
  p.created_at as criado_em,
  max(m.created_at) as ultimo_movimento
from public.catalog_products p
left join public.inventory_movements m
  on m.product_id = p.id
 and m.organization_id = p.organization_id
where p.controla_estoque = true
  -- Antes da 0242 não havia razão; comparar seria inventar saldo de abertura.
  and p.created_at >= '2026-09-25T00:00:00.000Z'::timestamptz
group by p.organization_id, p.id, p.codigo, p.nome, p.quantidade, p.created_at;

revoke all on public.sentinel_estoque_razao from anon;
grant select on public.sentinel_estoque_razao to authenticated;
grant select on public.sentinel_estoque_razao to service_role;

comment on view public.sentinel_estoque_razao is
  'Saldo cacheado × soma de inventory_movements (0242+) por produto controlado, inclusive com zero movimentações (left join). SEM saldo de abertura: diferença é hipótese de baixa confiança, não prova.';
