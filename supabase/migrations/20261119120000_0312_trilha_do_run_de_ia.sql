-- 0312 — trilha do run de IA: o que entrou, com que contexto e o que saiu.
--
-- Medido em 17/11/2026: `llm_calls` guardava tokens, custo, modelo e erro — e
-- NADA do conteúdo. Quando o agente respondia errado, ou quando o operador
-- perguntava "por que ele disse isso?", a resposta não existia em lugar nenhum:
-- a mensagem de entrada já tinha sido lida, o contexto montado (histórico +
-- playbook + resultados de ferramenta) era descartado, e a saída do modelo não
-- era persistida. A tela de execuções mostrava latência e custo de um turno
-- cujo texto ninguém podia inspecionar.
--
-- `ai_agent_runs` não resolve isto: o motor de produção (`lib/agent-engine`)
-- não escreve nela — a própria rota `/api/v1/ai/agents/:id/runs` documenta que
-- a tabela tem 0 linhas em produção e lê `llm_calls` no lugar. Guardar a trilha
-- onde o motor NÃO escreve seria uma tela prometendo o que não existe.
--
-- As colunas são NULLABLE de propósito: linha antiga não tem trilha e não se
-- inventa uma. `output_text` só existe em chamada concluída; em erro, o
-- `error_message` continua sendo o registro.

alter table public.llm_calls add column if not exists prompt_system text;
alter table public.llm_calls add column if not exists prompt_messages jsonb;
alter table public.llm_calls add column if not exists output_text text;
alter table public.llm_calls add column if not exists tool_calls jsonb;
alter table public.llm_calls add column if not exists sources jsonb;

comment on column public.llm_calls.prompt_system is
  'System prompt EFETIVO do turno, com o prefixo estável da org (playbook + tools) já aplicado. NULL = linha anterior à 0312 ou chamada sem system.';

comment on column public.llm_calls.prompt_messages is
  'Mensagens enviadas ao modelo no turno (histórico + entrada do cliente), como array JSON. É o CONTEXTO que o modelo viu, não o que o usuário digitou apenas. NULL = linha anterior à 0312.';

comment on column public.llm_calls.output_text is
  'Texto final que o modelo produziu no turno. NULL em erro/abort: nesse caso o registro é error_code/error_message, e inventar vazio seria afirmar que o modelo respondeu nada.';

comment on column public.llm_calls.sources is
  'Fontes citadas pelo provedor no turno (result.sources), quando ele devolve citações. Complementa tool_calls: a busca de conhecimento aparece lá, com o trecho que voltou.';

comment on column public.llm_calls.tool_calls is
  'Ferramentas chamadas no turno: [{tool, input, output}] com output recortado. É a trilha das FONTES consultadas (busca de conhecimento, CRM) — o que o modelo usou para responder. NULL = turno sem ferramenta ou linha anterior à 0312.';

-- Leitura por contato (LGPD) e por execução não precisam de índice novo: a
-- consulta da trilha é sempre por `id` (PK) e a da cascata por
-- (organization_id, contact_id), que `idx_llm_calls_org_time` cobre.
