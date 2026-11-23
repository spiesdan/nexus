-- 0336 — QUAL VERSÃO O MOTORISTA REALMENTE APLICOU.
--
-- Hoje a confirmação da nova sequência é só estado no navegador
-- (`setVersaoVista` em _motorista.tsx): o escritório não sabe se o motorista
-- aplicou a versão 4 ou ficou na 3. Duas colunas aditivas em `shipments`
-- respondem isso sem mexer em histórico: `rota_versao_confirmada` e
-- `rota_confirmada_em`. A escrita é do aceite no aparelho, com CAS na versão:
-- se o painel subiu a versão enquanto o motorista decidia, o aceite recusa a
-- versão velha em vez de confirmar uma rota que já não existe.

alter table public.shipments
  add column if not exists rota_versao_confirmada smallint,
  add column if not exists rota_confirmada_em timestamptz;

comment on column public.shipments.rota_versao_confirmada is
  'Versão da rota que o motorista aplicou no aparelho (0336). NULL = nunca confirmou. Compare com rota_versao para saber se está na versão anterior.';
comment on column public.shipments.rota_confirmada_em is
  'Instante do aceite da versão no aparelho (0336).';

-- Apêndice idempotente no baseline (o instalador aplica além da migration).
