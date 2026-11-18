-- ============================================================================
-- 0320 — SENTINEL v1.1: plano revisável + as duas evidências que faltavam.
--
-- 1. `sentinel_occurrences.recomendacao`: o Nível 1 do Sentinel. Cada detector
--    passa a produzir um plano (passos, pendências, risco, reversibilidade,
--    fonte e limitação) que é PERSISTIDO com a ocorrência. Enquanto ela está
--    aberta, a reexecução atualiza o plano; ao fechar, o plano daquele desfecho
--    deixa de ser reescrito. Nada nele é executado pela máquina.
--
-- 2. `sentinel_estoque_razao`: a melhor evidência disponível para divergência
--    de estoque. `inventory_movements` nasceu na 0242 e NÃO tem saldo de
--    abertura; por isso a view só considera produtos criados a partir dela e o
--    detector nasce com confiança BAIXA. A limitação está escrita na evidência
--    e no plano: a diferença é hipótese até a contagem física.
--
-- Nenhuma escrita em nota, saldo, pagamento ou mensagem. A view é leitura e
-- `security_invoker`; a mudança da função de registro é o plano junto da
-- ocorrência, não business data.
-- ============================================================================

alter table public.sentinel_occurrences
  add column if not exists recomendacao jsonb not null default '{}'::jsonb;

comment on column public.sentinel_occurrences.recomendacao is
  'Plano de correção revisável do Nível 1 (0320): passos, pendências, risco, reversibilidade e fonte. Vazio em ocorrências anteriores à v1.1. Nunca executado pela máquina.';

-- ─── Divergência de estoque: razão desde a 0242, sem inventar abertura ─────
--
-- `security_invoker`: quem consulta com sessão continua sujeito à RLS de
-- `catalog_products` e `inventory_movements`. O runner usa service role e
-- filtra a organização explicitamente.
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
join public.inventory_movements m
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
  'Saldo cacheado × soma de inventory_movements (0242+) por produto controlado. SEM saldo de abertura: diferença é hipótese de baixa confiança, não prova.';

-- ─── Registro da ocorrência passa a levar o plano ─────────────────────────
--
-- A assinatura muda; `drop` evita virar overload (duas funções com o mesmo
-- nome fariam o PostgREST escolher por tipo e o runner cair na antiga).
drop function if exists public.fn_sentinel_registrar_ocorrencia(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb
);

create or replace function public.fn_sentinel_registrar_ocorrencia(
  p_organization_id uuid,
  p_execucao_id uuid,
  p_fingerprint text,
  p_regra text,
  p_categoria text,
  p_entidade_tipo text,
  p_entidade_id text,
  p_titulo text,
  p_resumo text,
  p_causa_provavel text,
  p_severidade text,
  p_href text,
  p_evidencia jsonb,
  p_recomendacao jsonb
)
returns table (ocorrencia_id uuid, estado_resultante text, criada boolean)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_anteriores integer;
  v_id uuid;
  v_estado text;
  v_criada boolean;
begin
  select count(*)::integer
    into v_anteriores
    from public.sentinel_occurrences o
   where o.organization_id = p_organization_id
     and o.fingerprint = p_fingerprint
     and o.estado in ('corrigida', 'ignorada', 'encerrada');

  insert into public.sentinel_occurrences (
    organization_id, fingerprint, regra, categoria, entidade_tipo, entidade_id,
    titulo, resumo, causa_provavel, severidade, evidencia, href,
    recomendacao, estado, recorrencias, ultima_execucao_id
  )
  values (
    p_organization_id, p_fingerprint, p_regra, p_categoria, p_entidade_tipo, p_entidade_id,
    p_titulo, p_resumo, p_causa_provavel, p_severidade,
    coalesce(p_evidencia, '{}'::jsonb), p_href,
    coalesce(p_recomendacao, '{}'::jsonb),
    case when v_anteriores > 0 then 'recorrente' else 'nova' end,
    v_anteriores, p_execucao_id
  )
  on conflict (organization_id, fingerprint)
    where estado in ('nova', 'investigando', 'acao_necessaria', 'aprovada', 'recorrente')
  do update set
    ultima_vista_em = now(),
    vezes_vista = public.sentinel_occurrences.vezes_vista + 1,
    ultima_execucao_id = excluded.ultima_execucao_id,
    severidade = excluded.severidade,
    titulo = excluded.titulo,
    resumo = excluded.resumo,
    causa_provavel = excluded.causa_provavel,
    evidencia = excluded.evidencia,
    recomendacao = excluded.recomendacao,
    href = excluded.href,
    updated_at = now()
  returning public.sentinel_occurrences.id,
            public.sentinel_occurrences.estado,
            (xmax = 0)
    into v_id, v_estado, v_criada;

  insert into public.sentinel_occurrence_events (
    organization_id, occurrence_id, tipo, estado_novo, origem, detalhe
  )
  values (
    p_organization_id, v_id,
    case when v_criada then 'detectada' else 'reafirmada' end,
    v_estado, 'sentinel',
    jsonb_build_object('execucao_id', p_execucao_id, 'regra', p_regra)
  );

  return query select v_id, v_estado, v_criada;
end;
$fn$;

revoke execute on function public.fn_sentinel_registrar_ocorrencia(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.fn_sentinel_registrar_ocorrencia(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb
) to service_role;

comment on function public.fn_sentinel_registrar_ocorrencia(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb
) is
  'Upsert idempotente de ocorrência + plano revisável + evento de histórico. Só service_role (runner).';
