# Gerenciamento de Platform Admins (super-admin cross-tenant)

> Página informativa de `/admin/platform-admins`. Escrito a partir do schema real
> (`public.platform_admins` em `supabase/baseline.sql`) e da rota
> `app/api/v1/admin/platform-admins/route.ts`, que é **somente leitura**.

## Por que é via SQL

`platform_admins` é a única tabela do produto que concede acesso **cross-tenant**.
Não existe tela de escrita: a rota responde `405 method_not_allowed` a `POST`,
`PATCH` e `DELETE` de propósito (Spec 01 §3.4, T-04). Quem promove alguém é o DBA,
executando SQL no banco da instalação — e a linha fica registrada com autor, data e
motivo.

## Tabela

```sql
CREATE TABLE public.platform_admins (
  user_id       uuid        NOT NULL,          -- PK, um usuário é admin no máximo uma vez
  granted_by    uuid        NOT NULL,          -- FK auth.users(id), ON DELETE RESTRICT
  granted_at    timestamptz NOT NULL DEFAULT now(),
  scope         text        NOT NULL DEFAULT 'full',  -- 'full' | 'support_readonly'
  mfa_required  boolean     NOT NULL DEFAULT true,
  reason        text        NOT NULL,          -- obrigatório: o porquê do grant
  revoked_at    timestamptz,
  revoked_by    uuid,
  revoke_reason text
);
```

`scope` só aceita `full` ou `support_readonly` (constraint `platform_admins_scope_check`).
A política `platform_admins_self` deixa a leitura para quem já é platform admin; a
escrita não tem política — só o service role (ou o DBA no psql) alcança.

## Conceder

Descubra o `user_id` do alvo (o e-mail vive em `auth.users`, não em `public`):

```sql
select id, email from auth.users where email = 'pessoa@exemplo.com';
```

Depois insira, com o motivo escrito:

```sql
insert into public.platform_admins (user_id, granted_by, scope, mfa_required, reason)
values (
  '<user_id do alvo>',
  '<user_id de quem concede>',
  'full',        -- ou 'support_readonly'
  true,          -- exigir segundo fator
  'motivo: por que esta pessoa precisa de acesso cross-tenant'
);
```

## Revogar

Revogação é **marca**, não `delete`: o histórico do grant continua auditável.

```sql
update public.platform_admins
   set revoked_at = now(),
       revoked_by = '<user_id de quem revoga>',
       revoke_reason = 'motivo da revogação'
 where user_id = '<user_id do alvo>'
   and revoked_at is null;
```

## Verificar

```sql
select user_id, scope, granted_at, granted_by, revoked_at
  from public.platform_admins
 order by granted_at desc;
```

A mesma lista aparece em `/admin/platform-admins`, com os e-mails resolvidos pela
Auth Admin API — a tela nunca lê `auth.users` pelo PostgREST, porque o schema `auth`
não está exposto.

## Rastro

- **Banco**: `granted_by`/`granted_at`/`reason` no grant; `revoked_by`/`revoked_at`/
  `revoke_reason` na revogação.
- **Aplicação**: cada leitura da lista grava `platform_admin.platform_admins_listed`
  em `api_audit_log`, com `acting_as_platform_admin: true` e `bypassed_rls: true`.

## Se ninguém for platform admin

`/admin/**` responde "Acesso negado" (`/admin/forbidden`) e não há como promover
pela interface — é o desenho. A saída é o SQL acima, executado no banco da
instalação.
