-- 0317 — `idempotency_keys.request_hash` vira TEXT (hex), não bytea.
--
-- Medido em 18/11/2026: a tabela nasceu com `bytea`, mas o helper novo
-- (`lib/api/idempotencia.ts`) grava e compara o SHA-256 em hex. Pelo PostgREST,
-- string hex sem `\x` não é bytea válido — o insert da chave falhava (e o
-- helper antigo engolia o erro, então a rota funcionava sem cachear). Em
-- idempotência FORTE, a reivindicação precisa gravar de verdade: sem a linha
-- não há vencedor e dois requests fiscais com a mesma chave transmitem duas
-- vezes.
--
-- A conversão preserva as linhas existentes (`encode(..., 'hex')`); o default
-- do Supabase/PostgREST para bytea já era o hex. Idempotente: só roda se a
-- coluna ainda for bytea.

do $mig$
begin
  if exists (
    select 1
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = 'idempotency_keys'
       and c.column_name = 'request_hash'
       and c.data_type = 'bytea'
  ) then
    alter table public.idempotency_keys
      alter column request_hash type text using encode(request_hash, 'hex');
  end if;
end
$mig$;
