-- 0287 — o ritmo da campanha pode passar de um minuto.
--
-- ─── O defeito que isto resolve ─────────────────────────────────────────────
--
-- A 0273 fixou o intervalo entre duas mensagens da campanha em 1s..60s. O piso
-- está certo: abaixo de 1s não é campanha, é rajada. O TETO não estava: o
-- aparelho que recebe as mensagens não é o único que manda no ritmo — o
-- aquecimento do número também manda, e um número recém-reconectado depois de
-- um bloqueio precisa de mais que 60s entre envios. Sem poder declarar 2min, o
-- operador tinha duas opções ruins: mentir no campo (e o motor mandar de
-- minuto em minuto) ou desistir da campanha.
--
-- 60s continua sendo o PADRÃO e a recomendação. O que muda é o teto: 10 minutos
-- (`ESPACO_MAXIMO_MS`, o mesmo de `KNOB_BOUNDS.intervalMaxMs`). Acima disso não
-- é mais um disparo em lote, é um envio manual — e o motor não é a ferramenta.
--
-- O CHECK é recriado, nunca editado no lugar: quem já instalou recebe a
-- constraint nova pelo baseline, e um segundo `install`/`update` não quebra.
alter table public.prospecting_campaigns
  drop constraint if exists prospecting_campaigns_espaco_faixa;

alter table public.prospecting_campaigns
  add constraint prospecting_campaigns_espaco_faixa
  check (espaco_ms >= 1000 and espaco_ms <= 600000);

comment on column public.prospecting_campaigns.espaco_ms is
  'Intervalo mínimo entre duas mensagens da campanha, em ms (1s..10min). 60s é o padrão anti-ban; mais que isso é o ritmo que o aquecimento do número aguenta. O tick roda 1×/min, então o valor efetivo é arredondado para cima em minutos.';
