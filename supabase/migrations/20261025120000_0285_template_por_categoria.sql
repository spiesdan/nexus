-- 0285 — a campanha pode falar com um MODELO DIFERENTE por categoria.
--
-- ─── O defeito que isto resolve ─────────────────────────────────────────────
--
-- A 0284 deu à campanha UM modelo aprovado (`template_name` +
-- `template_language` + `template_values`). Isso resolveu a entrega fora da
-- janela de 24h, mas não o recorte comercial: a mesma campanha cobre oficina,
-- posto e restaurante, e o texto que serve para oficina não serve para
-- restaurante. O operador tinha de criar uma campanha por categoria — e a
-- empresa de cada uma ficava presa na reserva da campanha anterior.
--
-- ─── O desenho ──────────────────────────────────────────────────────────────
--
-- `templates_por_categoria` é um array de binds:
--
--   [{ categoria, name, language, contract_hash, values }, ...]
--
-- `categoria` é a chave canônica da campanha (`prospecting_campaigns.categorias`,
-- o `busca` da biblioteca), NÃO o rótulo traduzido: é a mesma string que o
-- operador marcou no assistente e que o motor compara com a categoria efetiva
-- do prospect. O motor resolve o bind DEPOIS de escolher a empresa e ANTES de
-- reservar no ledger; categoria sem bind pausa a campanha com erro visível em
-- `ultimo_erro`, em vez de mandar o modelo errado em silêncio.
--
-- Os campos legados continuam sendo o bind PADRÃO:
--   - satisfazem a constraint `prospecting_campaigns_template_bind_coerente`;
--   - preservam campanhas antigas (array vazio = comportamento da 0284);
--   - servem de fallback quando a campanha não tem recorte (`categorias` vazio
--     ou o curinga histórico "empresas").
--
-- ─── Por que jsonb e não tabela filha ───────────────────────────────────────
--
-- O bind é lido SEMPRE junto da campanha (uma linha) e nunca é consultado por
-- conta própria. Uma tabela filha criaria um N+1 no tick de 60 segundos e uma
-- policy nova para o mesmo dado que já é tenant-aware na linha da campanha.
-- O array é curto (no máximo o recorte da campanha) e validado na borda.
alter table public.prospecting_campaigns
  add column if not exists templates_por_categoria jsonb not null default '[]'::jsonb;

alter table public.prospecting_campaigns
  drop constraint if exists prospecting_campaigns_templates_por_categoria_array;
alter table public.prospecting_campaigns
  add constraint prospecting_campaigns_templates_por_categoria_array
  check (jsonb_typeof(templates_por_categoria) = 'array');

comment on column public.prospecting_campaigns.templates_por_categoria is
  'Binds de modelo por categoria: [{categoria, name, language, contract_hash, values}]. A categoria é a chave canônica de prospecting_campaigns.categorias. Vazio = usa o bind legado (0284). Categoria sem bind pausa a campanha em vez de mandar o modelo errado.';
