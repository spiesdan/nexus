-- ============================================================================
-- 0320 — CREDENCIAL DE DISPOSITIVO OFFLINE: o shell deixa de depender do
--        cookie que ele nunca teve.
--
-- ─── O DEFEITO QUE ISTO RESOLVE ─────────────────────────────────────────────
--
-- O app Android é um shell estático servido em `https://localhost` (webDir do
-- Capacitor) que navega para o sistema quando há sinal. O desenho dizia que o
-- shell gravaria no SQLite nativo e o sistema leria o MESMO arquivo — mas a
-- ponte do Capacitor é injetada só na origem do `appUrl` (`Bridge.java`,
-- `addDocumentStartJavaScript(..., singleton(allowedOrigin))`). Na página
-- remota não há `window.Capacitor`: o sistema cai em jeep-sqlite/IndexedDB,
-- vê outra fila e nunca drena a do shell. Medido em 18/11/2026 por leitura de
-- fonte e configuração (`capacitor.config.ts` sem `server.url`).
--
-- A opção escolhida (B, decisão do dono) preserva o shell abrindo offline e
-- não amarra o APK a um domínio: o shell drena a PRÓPRIA fila com uma
-- credencial de dispositivo, emitida pelo sistema com sessão humana.
--
-- ─── O QUE ESTA TABELA É, E O QUE ELA NÃO É ────────────────────────────────
--
-- É: um bearer de longa duração, vinculado a UMA organização e a UMA pessoa,
-- com escopo mínimo (`offline:pedidos:write`, `offline:catalogo:read`),
-- expiração, revogação explícita e `last_seen_at` para o dono ver o aparelho.
--
-- NÃO é: substituto de sessão, chave de API genérica, nem acesso ao banco pelo
-- cliente. O token só é aceito nas rotas `/api/v1/device/*`, que autenticam
-- com service role e filtram `organization_id` de fonte confiável (o próprio
-- token). Ele não lê tabela nenhuma diretamente.
--
-- ─── POR QUE TABELA NOVA, E NÃO `api_tokens` ───────────────────────────────
--
-- `api_tokens` (EPIC-01) é credencial server-to-server com escopos livres,
-- prefixo `dsk_` e RLS admin-only. Misturar aparelho ali faria um token de
-- celular nascer com o mesmo namespace de um token de integração — e o dia em
-- que alguém conceder `mcp:*` a um deles, o celular herda a ferramenta. Aqui
-- o token tem prefixo próprio (`nod_`), rota própria e escopo fechado por
-- CHECK. A separação é a garantia.
--
-- ─── O TOKEN NUNCA É ARMAZENADO ────────────────────────────────────────────
--
-- Só o SHA-256 em hex. O plaintext volta UMA vez, na resposta da criação, e
-- vira um código de pareamento (`NEXUS1.<base64url({u,t})>`) que o vendedor
-- cola no aparelho. Perder o código = gerar outro; não há "recuperar".
-- ============================================================================

create table if not exists public.offline_devices (
  id uuid primary key default gen_random_uuid(),

  -- O token pertence a uma organização e a uma PESSOA. A pessoa é quem assina
  -- o pedido (`created_by`/`vendedor_user_id` no sync), então precisa ser o
  -- vendedor real, não quem gerou o código.
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  nome text not null check (char_length(btrim(nome)) between 1 and 100),

  -- SHA-256 hex do plaintext. `text` (e não `bytea`) porque o helper compara
  -- hex e a migration 0317 mostrou que bytea sem `\x` não sobrevive ao
  -- PostgREST: a string vira inválida e o insert falha.
  token_hash text not null,
  -- Prefixo visível (`nod_ab12cd34`) para o dono reconhecer o aparelho na
  -- lista sem que o segredo inteiro volte nunca mais.
  token_prefix text not null,

  -- Escopo FECHADO. Não é texto livre: um escopo novo exige migration (e a
  -- revisão que migration exige). `offline:*` não abre rota de negócio além
  -- das duas que o shell realmente usa.
  scopes jsonb not null default
    '["offline:pedidos:write","offline:catalogo:read"]'::jsonb
    check (jsonb_typeof(scopes) = 'array'),

  last_seen_at timestamptz,
  last_seen_ip inet,

  -- Obrigatória: credencial sem prazo é credencial esquecida. O produto oferece
  -- 30/90/180/365 dias na tela.
  expires_at timestamptz not null,

  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint offline_devices_token_hash_key unique (token_hash),
  constraint offline_devices_hash_formato check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint offline_devices_prefixo_formato check (token_prefix ~ '^nod_[0-9a-f]{8}$')
);

comment on table public.offline_devices is
  'Credencial de dispositivo do shell offline (0320). Token `nod_` guardado só como sha256; escopo offline:pedidos:write/offline:catalogo:read; expiração obrigatória. Autentica apenas /api/v1/device/*.';

comment on column public.offline_devices.user_id is
  'Pessoa a quem o aparelho pertence — o vendedor que assina o pedido no sync. Não é necessariamente quem gerou o código.';

comment on column public.offline_devices.token_hash is
  'sha256 hex do token. O plaintext não é recuperável: perdido, gera outro.';

comment on column public.offline_devices.token_prefix is
  'Primeiros 12 caracteres (`nod_` + 8 hex) para o dono identificar o aparelho na lista.';

comment on column public.offline_devices.last_seen_at is
  'Último uso aceito do token. Atualizado pelas rotas /api/v1/device/*; não é heartbeat — aparelho parado não escreve.';

comment on column public.offline_devices.expires_at is
  'Prazo obrigatório. Token vencido responde token_expired e NÃO drena: a fila fica no aparelho até reparear.';

create index if not exists offline_devices_org_idx
  on public.offline_devices (organization_id, created_at desc)
  where revoked_at is null;

create index if not exists offline_devices_expira_idx
  on public.offline_devices (expires_at)
  where revoked_at is null;

alter table public.offline_devices enable row level security;

-- Gestão é de admin da organização (mesma régua de `api_tokens`): emitir um
-- bearer que cria pedido é ato de administração, não de operação.
drop policy if exists offline_devices_admin_only on public.offline_devices;
create policy offline_devices_admin_only on public.offline_devices
  using (
    public.fn_is_platform_admin()
    or public.fn_role_at_least(organization_id, 'admin')
  )
  with check (
    public.fn_is_platform_admin()
    or public.fn_role_at_least(organization_id, 'admin')
  );

-- `anon` nunca toca nesta tabela. O caminho do aparelho é service role dentro
-- da rota (mesma doutrina de `system/agent`), não PostgREST anônimo.
revoke all on public.offline_devices from anon;
grant select, insert, update, delete on public.offline_devices to authenticated;
grant all on public.offline_devices to service_role;

drop trigger if exists trg_offline_devices_updated_at on public.offline_devices;
create trigger trg_offline_devices_updated_at
  before update on public.offline_devices
  for each row execute function public.fn_set_updated_at();
