-- 0332 — SONDA DA SÉRIE DE API (não polui os SLOs).
--
-- A série `api_request_samples` pode estar vazia por dois motivos opostos:
-- ninguém autenticado passou pelas rotas quentes, ou o instrumento morreu. A
-- sonda prova o caminho de escrita sem depender de tráfego humano e sem entrar
-- na série que alimenta disponibilidade/p95.
--
-- Tabela separada de propósito: uma linha `__sonda__` em `api_request_samples`
-- mudaria a contagem, a primeira/última amostra do diagnóstico e a retenção,
-- que é exatamente a leitura que a sonda precisa deixar limpa.

create table if not exists public.api_request_probes (
  id uuid primary key default gen_random_uuid(),
  origem text not null check (origem in ('cron', 'manual')),
  duracao_ms numeric(10, 1) not null check (duracao_ms >= 0),
  ok boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists api_request_probes_created_idx
  on public.api_request_probes (created_at desc);

alter table public.api_request_probes enable row level security;

-- Só service_role escreve/lê (rota interna e painel usam service role atrás do
-- guard). Nenhuma sessão de tenant precisa desta tabela.
revoke all on public.api_request_probes from anon, authenticated;
grant all on public.api_request_probes to service_role;

comment on table public.api_request_probes is
  'Sonda do instrumento de métricas: prova escrita sem poluir api_request_samples. Só service_role.';
