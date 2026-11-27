-- 0367 — CONCLUSÃO DE UM TERMO MAPS: PROGRESSO E CONTADORES NA MESMA ESCRITA.
--
-- O tick do Maps faz o upsert dos prospects (idempotente por place_id) e os
-- vínculos em `prospect_search_results`; aqui os CONTADORES são DERIVADOS
-- desses vínculos, nunca somados em memória. Assim:
--   * duas execuções do mesmo termo não dobram `novas`/`duplicadas`;
--   * retomada depois de falha não perde o que já entrou;
--   * `parcial` é derivado de `progresso` (termos fechados vs total), não é
--     status novo.
--
-- A escrita é uma só: `progresso` + contadores + status/finished_at na mesma
-- instrução. `encontradas` vem do mapa `termos_encontradas` que o checkpoint
-- já carrega (sobrescreve o termo reexecutado, não soma duas vezes).
--
-- `security definer` porque o motor chama com service role e a RLS de
-- `prospect_search_results`/`prospecting_searches` não pode depender do JWT do
-- worker; a guarda confere org + papel (ou service_role/platform admin).

create or replace function public.fn_concluir_termo_maps(
  p_org uuid,
  p_search uuid,
  p_progresso jsonb,
  p_encontradas integer,
  p_motivo_zero text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_novas integer;
  v_dup integer;
  v_status text;
  v_fechados integer;
  v_total integer;
  v_concluida boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not public.fn_is_platform_admin()
     and not public.fn_role_at_least(p_org, 'agent') then
    raise exception 'sem_papel' using errcode = '42501';
  end if;

  if jsonb_typeof(p_progresso) <> 'object' then
    raise exception 'progresso_invalido' using errcode = '22023';
  end if;

  v_total := coalesce((p_progresso ->> 'termos_total')::integer, 0);
  v_fechados := coalesce(jsonb_array_length(p_progresso -> 'termos_concluidos'), 0)
              + coalesce(jsonb_array_length(p_progresso -> 'termos_falhos'), 0);
  v_concluida := v_total > 0 and v_fechados >= v_total;

  select count(*)::integer into v_novas
    from public.prospect_search_results r
   where r.search_id = p_search
     and r.organization_id = p_org
     and r.primeira_vez;
  select count(*)::integer into v_dup
    from public.prospect_search_results r
   where r.search_id = p_search
     and r.organization_id = p_org
     and not r.primeira_vez;

  update public.prospecting_searches s
     set progresso = p_progresso,
         encontradas = greatest(0, coalesce(p_encontradas, 0)),
         novas = v_novas,
         duplicadas = v_dup,
         motivo_zero = p_motivo_zero,
         ultimo_erro = null,
         status = case
           when s.status in ('paused', 'cancelled') then s.status
           when v_concluida then 'completed'
           else 'running'
         end,
         finished_at = case
           when v_concluida and s.status not in ('paused', 'cancelled') then now()
           else s.finished_at
         end
   where s.id = p_search
     and s.organization_id = p_org;

  if not found then
    raise exception 'busca_nao_encontrada' using errcode = 'P0002';
  end if;

  select s.status into v_status
    from public.prospecting_searches s
   where s.id = p_search and s.organization_id = p_org;

  return jsonb_build_object(
    'status', v_status,
    'encontradas', greatest(0, coalesce(p_encontradas, 0)),
    'novas', v_novas,
    'duplicadas', v_dup,
    'completa', v_concluida
  );
end;
$$;

revoke execute on function public.fn_concluir_termo_maps(uuid, uuid, jsonb, integer, text)
  from public, anon;
grant execute on function public.fn_concluir_termo_maps(uuid, uuid, jsonb, integer, text)
  to authenticated, service_role;

comment on function public.fn_concluir_termo_maps(uuid, uuid, jsonb, integer, text) is
  'Conclui um termo Maps: grava progresso e deriva encontradas/novas/duplicadas dos vínculos idempotentes, tudo numa escrita. Parcial/completa sai do progresso, não de status novo.';
