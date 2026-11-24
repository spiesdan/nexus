-- 0349 — TIPO DA EXECUÇÃO DO MERCOS: importação ou reconciliação.
--
-- A reconciliação precisa do mesmo navegador, da mesma fila e do mesmo
-- worker — mas NÃO pode importar sozinha. O tipo viaja na fila para o worker
-- escolher o caminho; o cron só enfileira, sem `--aplicar`.

alter table public.mercos_import_runs
  add column if not exists tipo text not null default 'importacao'
    constraint mercos_import_runs_tipo_valido check (tipo in ('importacao', 'reconciliacao'));

create index if not exists mercos_import_runs_tipo_idx
  on public.mercos_import_runs (tipo, status, created_at);
