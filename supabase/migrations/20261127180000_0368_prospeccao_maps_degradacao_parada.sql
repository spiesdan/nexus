-- 0368 — DEGRADAÇÃO VISÍVEL E PARADA DECLARADA DA PROSPECÇÃO MAPS.
--
-- `degradada` sozinho não conta a história: a tela precisa saber POR QUE o
-- Maps não executou (sidecar fora, job em modo navegador, provider trocado).
-- `degradacao_motivo` é esse texto, escrito pelo motor quando ele marca a
-- busca como degradada; a rota devolve junto com o boolean.
--
-- Parada: o termo tem timeout de 120 s. Em vez de fingir que o stop é
-- instantâneo, a rota grava `parada_solicitada_em` e o motor fecha o termo em
-- curso; nesse intervalo a busca aparece como "parando", com o prazo máximo
-- declarado (120 s + escrita). Não existe coluna de status novo: `status`
-- continua queued/running/paused/..., e "parando" é DERIVADO de
-- `parada_solicitada_em` + `status='running'`.
--
-- Aditiva e idempotente; sem backfill.

alter table public.prospecting_searches
  add column if not exists degradacao_motivo text;

alter table public.prospecting_searches
  add column if not exists parada_solicitada_em timestamptz;

comment on column public.prospecting_searches.degradada is
  'A descoberta Maps não foi o executor (sidecar fora, fast_mode não confirmado ou provider trocado). A tela mostra o motivo em degradacao_motivo.';
comment on column public.prospecting_searches.degradacao_motivo is
  'Texto legível do motivo da degradação; nunca vazio quando degradada=true.';
comment on column public.prospecting_searches.parada_solicitada_em is
  'Quando o operador pediu pause. O motor fecha o termo em curso (timeout 120 s) e só então grava paused; a rota mostra "parando" enquanto isso.';
