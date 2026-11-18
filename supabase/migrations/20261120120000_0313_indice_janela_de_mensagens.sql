-- 0313 — índice da JANELA de mensagens por organização.
--
-- Medido em 17/11/2026 num Postgres 15.19 com 200.000 mensagens de uma org:
-- `select count(*) from messages where organization_id = ? and created_at >= ?`
-- (a consulta de /admin/usage e das contagens do inbox) rodava entre 25 e 54 ms
-- por não ter índice que cobrisse (organization_id, created_at). O único índice
-- por organização em messages é PARCIAL por status (`sending`/`failed`), que não
-- serve para a janela.
--
-- Com este índice: 5,7–19 ms nas mesmas três execuções — leitura só do índice,
-- sem varrer o heap. O ganho cresce com o tamanho da tabela; instalação grande
-- deve aplicar em janela de manutenção (CREATE INDEX não é CONCURRENTLY aqui
-- para continuar replayável dentro de transação).
create index if not exists messages_org_created_idx
  on public.messages (organization_id, created_at desc);

comment on index public.messages_org_created_idx is
  'Janela de mensagens por organização (0313). Cobre count/list por org + período — usado por /admin/usage e pelas contagens do inbox. Sem ele: 25–54 ms em 200k linhas; com: 5,7–19 ms (medido em 17/11/2026).';
