-- 0286 — a qualidade do NÚMERO vira estado visível, e a campanha para sozinha.
--
-- ─── O defeito que isto resolve ─────────────────────────────────────────────
--
-- A campanha já sabia recusar um MODELO não aprovado, mas nada no sistema
-- olhava a qualidade do NÚMERO depois da conexão. `meta-cloud.checkHealth` já
-- pedia `quality_rating` à Graph API e JOGAVA FORA a resposta: uma queda para
-- RED — o estado em que a Meta pausa templates (3h, 6h, desabilita) e depois
-- penaliza o número — era invisível. O disparo seguia, a qualidade caía mais,
-- e quem descobria era o dono quando o número parava de entregar.
--
-- ─── O desenho ──────────────────────────────────────────────────────────────
--
-- `channel_sessions.quality_rating` guarda o último valor lido (GREEN/YELLOW/
-- RED/UNKNOWN) e `quality_updated_at` diz QUANDO foi lido — sem a data, "RED"
-- de três semanas atrás teria o mesmo peso de "RED" de agora.
--
-- `messaging_limit` guarda o degrau que a Meta informa no webhook
-- `phone_number_quality_update` (TIER_50 … TIER_UNLIMITED). O limite é do
-- PORTFÓLIO e compartilhado entre números; guardar por sessão é o que permite
-- mostrar na tela de Conexões qual número está na ponta do fio.
--
-- Na campanha, `pausa_motivo`/`pausa_em` distinguem "pausada por uma pessoa"
-- (colunas nulas) de "pausada porque o número/modelo pediu" (com motivo). O
-- controle já mostrava `ultimo_erro`; a pausa automática precisa de um texto
-- próprio porque não é um erro transitório — é uma decisão do sistema, e quem
-- retomar tem de saber por que ela aconteceu.
--
-- Nada aqui apaga dado nem reescreve histórico: campanha pausada continua com
-- a reserva e o ledger intactos, e retomar é um clique no mesmo botão de antes.
alter table public.channel_sessions
  add column if not exists quality_rating text,
  add column if not exists quality_updated_at timestamptz,
  add column if not exists messaging_limit text;

alter table public.channel_sessions
  drop constraint if exists channel_sessions_quality_rating_valido;
alter table public.channel_sessions
  add constraint channel_sessions_quality_rating_valido
  check (
    quality_rating is null
    or quality_rating in ('GREEN', 'YELLOW', 'RED', 'UNKNOWN')
  );

comment on column public.channel_sessions.quality_rating is
  'Última qualidade do número lida na plataforma: GREEN/YELLOW/RED/UNKNOWN. RED pausa as campanhas por modelo desta organização (0286).';
comment on column public.channel_sessions.quality_updated_at is
  'Quando quality_rating foi lido por último. Sem data, um RED antigo pareceria atual.';
comment on column public.channel_sessions.messaging_limit is
  'Degrau de limite informado pela plataforma (TIER_50 … TIER_UNLIMITED). O limite é do PORTFÓLIO e compartilhado entre números.';

alter table public.prospecting_campaigns
  add column if not exists pausa_motivo text,
  add column if not exists pausa_em timestamptz;

comment on column public.prospecting_campaigns.pausa_motivo is
  'Por que a campanha foi pausada automaticamente (qualidade do número, limite reduzido, modelo com problema). Nulo = pausa feita por uma pessoa.';
comment on column public.prospecting_campaigns.pausa_em is
  'Quando a pausa automática aconteceu. Zera junto com pausa_motivo quando alguém retoma a campanha.';
