-- 0312 — trilha do run de IA: ESTRUTURA e HASH, nunca o conteúdo da conversa.
--
-- Medido em 17/11/2026: `llm_calls` guardava tokens, custo, modelo e erro — e
-- nada que permitisse responder "por que o agente disse isso?". Ao mesmo tempo,
-- o repo tem um invariante explícito (`tests/unit/llm-calls-registra-falha.test.ts`,
-- "o conteúdo da conversa não vai junto"): conteúdo de mensagem é PII e não
-- entra em tabela de telemetria. A primeira versão desta trilha gravava prompt e
-- saída crus e foi reprovada por esse gate — com razão.
--
-- A saída é a que o LGPD já usa em outros pontos: guardar o que permite AUDITAR
-- sem copiar o dado pessoal.
--
--   · `prompt_system_hash` — sha256 do system efetivo do turno. Prova que dois
--     turnos usaram a mesma política sem guardá-la (o playbook tem versão).
--   · `prompt_messages_meta` — `{total, papeis:[{role,chars}], sha256}`: quantas
--     mensagens, de que papéis, com que tamanho, e o hash do conjunto. É o
--     CONTEXTO em forma verificável, não o texto.
--   · `output_text_hash`/`output_chars` — o hash e o tamanho da resposta. O
--     texto real está em `messages` (a mensagem enviada), sob a política de
--     retenção e a cascata de anonimização daquela tabela.
--   · `tool_calls` — `[{tool, input_hash, output_hash, output_chars}]`: quais
--     ferramentas foram chamadas e o tamanho/hash do retorno. A fonte consultada
--     é auditável por hash; o trecho não é duplicado.
--   · `sources_meta` — `{total, hosts:[...]}` das citações do provedor, sem
--     títulos nem URLs completas.
--
-- Correlação sem cópia: o hash da mensagem de entrada casa com a linha em
-- `messages` do mesmo turno; quem tem direito de ler a conversa confere ali. A
-- telemetria sozinha não devolve PII nem sob ordem de acesso a log.
--
-- Colunas nullable: linha anterior à 0312 não tem trilha e não se inventa uma.

alter table public.llm_calls add column if not exists prompt_system_hash text;
alter table public.llm_calls add column if not exists prompt_messages_meta jsonb;
alter table public.llm_calls add column if not exists output_text_hash text;
alter table public.llm_calls add column if not exists output_chars int;
alter table public.llm_calls add column if not exists tool_calls jsonb;
alter table public.llm_calls add column if not exists sources_meta jsonb;

comment on column public.llm_calls.prompt_system_hash is
  'sha256 do system prompt efetivo do turno (0312). Prova de QUAL política foi usada sem copiar o texto — o playbook é versionado.';

comment on column public.llm_calls.prompt_messages_meta is
  'Contexto do turno SEM conteúdo: {total, papeis:[{role,chars}], sha256} (0312). O texto fica em `messages`, sob retenção e anonimização daquela tabela.';

comment on column public.llm_calls.output_text_hash is
  'sha256 da saída final do modelo (0312). NULL em erro/abort — não houve resposta. O texto enviado está em `messages`.';

comment on column public.llm_calls.output_chars is
  'Tamanho da saída em caracteres (0312), para distinguir resposta vazia de resposta truncada sem guardar o texto.';

comment on column public.llm_calls.tool_calls is
  'Ferramentas do turno: [{tool, input_hash, output_hash, output_chars}] (0312). A fonte consultada é auditável por hash; o trecho não é duplicado.';

comment on column public.llm_calls.sources_meta is
  'Citações do provedor em forma agregada: {total, hosts:[...]} (0312). Sem título nem URL completa.';
