-- 0329 — ORGANIZAÇÃO SUSPENSA NÃO ALIMENTA O SENTINEL.
--
-- Medido em produção em 19/11/2026: das 23 ocorrências abertas, 20 eram de uma
-- organização de teste (E2E Test Org), já suspensa. O dono do produto abria o
-- painel e via 87% de ruído de dado que não é negócio de ninguém.
--
-- O corte é na ORIGEM: organização com `suspended_at` não tem snapshot
-- coletado, então nenhum detector roda, nenhuma ocorrência nasce e nenhuma
-- existente é reafirmada. A rodada continua registrada em `sentinel_runs`
-- (`ignorada`, motivo `organizacao_suspensa`) para o cron responder "o que
-- aconteceu com esta org?".
--
-- O que fazer com as ocorrências ABERTAS de uma org suspensa: encerrar, não
-- apagar. Encerrar preserva a linha e o histórico append-only — é a mesma
-- trilha que a org veria se voltasse. Apagar seria escrever a história de novo,
-- e a suspensão é uma decisão do dono da instalação, não uma correção de dado.
--
-- Por que função própria em vez de reusar `fn_sentinel_encerrar_ausentes`:
-- aquela recebe a lista de regras efetivamente avaliadas e só fecha o que não
-- foi reencontrado numa rodada COMPLETA. Aqui não houve rodada de detecção:
-- fechar por "não detectada" seria mentira. A função abaixo fecha com o motivo
-- que realmente aconteceu e grava o mesmo evento `auto_encerrada`.
--
-- `security definer` com `search_path = public` e execução só para
-- `service_role`, atrás do runner. Nenhuma tabela de negócio é tocada.

create or replace function public.fn_sentinel_encerrar_org_suspensa(
  p_organization_id uuid,
  p_execucao_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_total integer;
begin
  with alvo as (
    select o.id, o.estado
      from public.sentinel_occurrences o
     where o.organization_id = p_organization_id
       and o.estado in ('nova', 'investigando', 'acao_necessaria', 'aprovada', 'recorrente')
       for update
  ), fechadas as (
    update public.sentinel_occurrences o
       set estado = 'encerrada',
           encerrada_em = now(),
           motivo_encerramento = 'organizacao_suspensa',
           updated_at = now()
      from alvo a
     where o.id = a.id
    returning o.id
  ), eventos as (
    insert into public.sentinel_occurrence_events (
      organization_id, occurrence_id, tipo, estado_anterior, estado_novo, origem, detalhe
    )
    select p_organization_id, a.id, 'auto_encerrada', a.estado, 'encerrada', 'sistema',
           jsonb_build_object(
             'execucao_id', p_execucao_id,
             'motivo', 'organizacao_suspensa'
           )
      from alvo a
      join fechadas f on f.id = a.id
    returning 1
  )
  select count(*)::integer into v_total from fechadas;

  return v_total;
end;
$fn$;

revoke execute on function public.fn_sentinel_encerrar_org_suspensa(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_sentinel_encerrar_org_suspensa(uuid, uuid)
  to service_role;

comment on function public.fn_sentinel_encerrar_org_suspensa(uuid, uuid) is
  'Encerra ocorrências ABERTAS de organização suspensa com motivo organizacao_suspensa, preservando linha e histórico. Sem coleta e sem detecção.';
