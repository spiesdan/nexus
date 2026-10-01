-- FASE 12 da spec 19 (secao 31 - MEU DIA): a proxima acao do prospect vira
-- tarefa de verdade em commercial_tasks, e o vinculo precisa viver na tarefa -
-- prospect pode ser editado, concluido ou excluido por varios caminhos, e o
-- Meu Dia le justamente commercial_tasks (D7). Aditiva: uma coluna + um indice
-- parcial + comments. RLS inalterada - as polizas sao por organization_id, que
-- nao muda; nenhuma funcao nova.

alter table public.commercial_tasks
  add column if not exists prospect_id uuid references public.business_prospects(id) on delete set null;

-- Achar "a tarefa deste prospect" num PATCH da fila e barato (indice do
-- tenant); parcial porque a maioria das tarefas nao nasce da prospeccao
-- (360, Radar, tarefas manuais) e NULL nao deve ocupar indice.
create index if not exists commercial_tasks_prospect_idx
  on public.commercial_tasks (organization_id, prospect_id)
  where prospect_id is not null;

comment on column public.commercial_tasks.prospect_id is
  'Prospect da fila de prospeccao que originou a tarefa (spec 19, FASE 12/31). On delete set null: apagar o prospect desvincula, nao apaga o historico da tarefa.';
