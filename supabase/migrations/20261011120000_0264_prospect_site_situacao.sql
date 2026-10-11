-- 0264_prospect_site_situacao — o score sabia "tem site", sem saber que site.
--
-- ┌── Por que três colunas e não uma ────────────────────────────────────
--
-- `site_situacao` é a resposta ("site_ok"); `site_detalhes` é o PORQUÊ (o que
-- foi achado: https, mobile, whatsapp, tempo); `site_verificado_em` é QUANDO.
-- Sem o "quando", um Raio-X de 6 meses atrás valeria o mesmo que um de ontem
-- — e site muda. A tela mostra "verificado há N dias" e o vendedor decide se
-- confia ou roda de novo.
--
-- ─── Por que jsonb e não colunas ────────────────────────────────────────
--
-- Os achados ganham chaves novas (PageSpeed, SSL válido...) sem migration
-- nova. Coluna por achado seria uma migration por ideia — e ideia barata não
-- pode custar deploy de banco.
--
-- ─── O que NÃO muda ────────────────────────────────────────────────────
--
-- `score` continua calculado na leitura (doutrina: score é da descoberta, não
-- gravado). Estas colunas alimentam o cálculo; nenhuma reescreve o score.

-- ─── 1. As colunas ─────────────────────────────────────────────────────
alter table business_prospects
  add column if not exists site_situacao text;

alter table business_prospects
  drop constraint if exists business_prospects_site_situacao_valida;

alter table business_prospects
  add constraint business_prospects_site_situacao_valida
  check (
    site_situacao is null
    or site_situacao = any (
      array['sem_site', 'site_ruim', 'site_simples', 'site_ok', 'nao_verificado']
    )
  );

comment on column business_prospects.site_situacao is
  'Raio-X do site (0264): sem_site, site_ruim, site_simples, site_ok ou '
  'nao_verificado. NULL = nunca analisado.';

alter table business_prospects
  add column if not exists site_detalhes jsonb not null default '{}'::jsonb;

comment on column business_prospects.site_detalhes is
  'O porquê da situação: achados (https, mobile, whatsapp...), tempo_ms, '
  'status_http e url_final.';

alter table business_prospects
  add column if not exists site_verificado_em timestamptz;

comment on column business_prospects.site_verificado_em is
  'Quando o Raio-X rodou. A tela mostra a idade e o vendedor decide se roda '
  'de novo.';

-- ─── 2. O índice da fila "nunca analisados" ─────────────────────────────
--
-- A operação natural é "quem tem site mas nunca foi verificado". Sem índice,
-- é seq scan por tick numa tabela que cresce a cada busca.
create index if not exists business_prospects_site_pendente_idx
  on business_prospects (organization_id, updated_at desc)
  where website is not null and website <> '' and site_situacao is null;
