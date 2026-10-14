-- 0269 — VENDA AUTOMÁTICA A PARTIR DA SELEÇÃO, COM MENSAGEM FIXA E COOLDOWN
--
-- O botão "Criar venda automática" da prospecção criava a campanha e largava:
-- sem mensagem (a abordagem era gerada pela IA a cada envio), sem lista
-- (a fila era preenchida pelo filtro a cada tick) e sem espaçamento (o tick
-- mandava em rajada, limitado só por cota e janela).
--
-- O pedido é o oposto nos três eixos: mensagem padrão escrita pelo dono,
-- lista fechada vinda da seleção, e 60 segundos entre um envio e outro.
--
-- 1. `mensagem_padrao` — texto fixo. Quando preenchida, o motor a envia como
--    está, sem chamar a IA. NULL = comportamento atual (gerarAbordagem).
--
-- 2. `prospect_ids` — a seleção congelada. Quando preenchida, o motor só
--    enfileira esses (passando pela MESMA elegibilidade: telefone, WhatsApp,
--    duplicidade), e nunca preenche pelo filtro. NULL = comportamento atual.
--
-- 3. `cooldown_segundos` + `ultimo_envio_at` — o espaçamento. O `espacarEnvio`
--    que já existe (`lib/automation/throttle.ts`) é um Map EM MEMÓRIA por
--    sessão: morre no restart e não vale entre processos. Para 60 segundos
--    valerem de verdade, o carimbo precisa estar no banco. Antes de cada
--    envio o motor confere `agora - ultimo_envio_at >= cooldown`; o resto da
--    fila espera o próximo tick (o cron roda a cada minuto).
--
-- O QUE NÃO ESTÁ AQUI, DE PROPÓSITO:
--
-- - O CHECK é 10..3600. Abaixo de 10 segundos não é cooldown, é rajada com
--   outro nome — e rajada contra o WAHA é ban. Acima de 1 hora, a campanha de
--   500/dia nunca termina dentro da janela.
-- - `ultimo_envio_at` nasce NULL: a primeira mensagem sai no primeiro tick,
--   sem esperar 60 segundos por uma anterior que nunca existiu.

alter table public.automatic_sales_campaigns
  add column if not exists mensagem_padrao text;

alter table public.automatic_sales_campaigns
  add column if not exists cooldown_segundos integer not null default 60;

alter table public.automatic_sales_campaigns
  add column if not exists prospect_ids uuid[];

alter table public.automatic_sales_campaigns
  add column if not exists ultimo_envio_at timestamptz;

alter table public.automatic_sales_campaigns
  drop constraint if exists automatic_sales_campaigns_cooldown_faixa;

alter table public.automatic_sales_campaigns
  add constraint automatic_sales_campaigns_cooldown_faixa
  check (cooldown_segundos >= 10 and cooldown_segundos <= 3600);

comment on column public.automatic_sales_campaigns.mensagem_padrao is
  'Texto fixo da abordagem. Preenchido = o motor envia como esta, sem IA. Vazio = gerarAbordagem como antes.';
comment on column public.automatic_sales_campaigns.cooldown_segundos is
  'Segundos entre um envio e outro da mesma campanha. Vale com ultimo_envio_at no banco, nao com Map em memoria.';
comment on column public.automatic_sales_campaigns.prospect_ids is
  'Selecao congelada da prospeccao. Preenchido = a fila so recebe estes, nunca o filtro. Vazio = preencher pelo filtro como antes.';
comment on column public.automatic_sales_campaigns.ultimo_envio_at is
  'Carimbo do ultimo envio (tentado ou entregue). O proximo so sai depois de cooldown_segundos.';

-- RLS: a tabela já tem RLS ligado com policies de tenant (migration 0246).
-- Coluna nova herda o grant por tabela; sem revoke extra porque nada aqui muda
-- quem alcança a tabela — diferente da 0268, que criava tabela nova DEPOIS da
-- varredura anon.
