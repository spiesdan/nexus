-- 0295 — O EVENTO "ajuste" NA TIMELINE DA NOTA
--
-- Corrigir uma nota rejeitada (IE do destinatário, NCM de item, endereço) é
-- mudar o documento ANTES de ele ir à SEFAZ. O fato precisa aparecer na
-- timeline da nota com nome próprio: quem abre a nota corrigida amanhã tem de
-- saber que ela foi corrigida à mão, por quem e em que campos. Reaproveitar
-- `retry` esconderia isso (retry é a mesma tentativa; ajuste é outro conteúdo).
--
-- Idempotente: roda em install (baseline) e em update (migration).

alter table public.fiscal_events drop constraint if exists fiscal_events_tipo_check;

alter table public.fiscal_events
  add constraint fiscal_events_tipo_check check (
    tipo in (
      'criada',
      'enviada',
      'autorizada',
      'rejeitada',
      'erro',
      'retry',
      'cancelada',
      'carta_correcao',
      'ajuste'
    )
  );

comment on column public.fiscal_events.tipo is
  'Ciclo da nota: criada, enviada, autorizada, rejeitada, erro, retry, cancelada, carta_correcao, ajuste (correção antes de reenviar).';
