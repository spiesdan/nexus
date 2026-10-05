-- ============================================================================
-- 0252 — encrypt_cpf / decrypt_cpf: a cifra at-rest do CPF que o CHECK exige
--
-- O `contacts_cpf_consistency` (baseline, CONSTRAINT contacts) é bivariado:
-- `cpf_encrypted IS NULL = cpf_hash IS NULL` — ou os dois, ou nenhum. O
-- `patchContactHandler` grava `cpf_hash` sempre e tenta a cifra via RPC
-- `encrypt_cpf`; sem a função, a RPC falha, o handler tolera (lib/contacts/cpf.ts
-- "stores cpf_hash only") e o UPDATE cai no CHECK: `new row for relation
-- "contacts" violates check constraint "contacts_cpf_consistency"`. Ou seja,
-- TODO cadastro de CPF — pela tela ou pelo fluxo do atendimento (0251) — estava
-- nascendo quebrado em banco onde a RPC não existe (medido em 2026-10-04, o
-- clone local não a tinha; a dívida está registrada em EPIC-05, S-05.01
-- "CPF at-rest encryption (encrypt_cpf RPC missing) — deferred").
--
-- Chave: a MESMA mestre da 0041 (`private.fn_oauth_key()` — GUC
-- `app.nuvemshop_oauth_key` com precedência, senão `private.app_secrets`), que
-- o `hostgator-setup-kit/_common.sh:764` provisiona em toda instalação nova.
-- Função nova com chave própria seria uma segunda chave para o operador perder.
--
-- Assinaturas (já consumidas pelo código que existia esperando a migration):
--   encrypt_cpf(p_plaintext text)  -> bytea   (lib/contacts/cpf.ts; importar-mercos legacy)
--   decrypt_cpf(p_contact_id uuid, p_organization_id uuid) -> text
--     (app/api/v1/contacts/_handler.ts GET com X-Decrypt-Purpose;
--      lib/contacts/proposta-de-dado.ts lerCpfAnterior p/ valor_anterior)
--
-- SECURITY DEFINER + escopo de org no próprio WHERE, no molde da 0209: o
-- parâmetro forjado de outra org morre aqui, não na RLS. A checagem de
-- membresia (`fn_user_org_ids`) só incide quando existe JWT de usuário
-- (`auth.uid() not null`); chamador service_role (MCP/engine) é contexto de
-- servidor e segue direto.
--
-- ACL (item 6 da doutrina de Migrations): revoke das DUAS origens de EXECUTE
-- (`public` e `anon`) e grant para `authenticated` e `service_role`.
-- ============================================================================

create or replace function public.encrypt_cpf(p_plaintext text) returns bytea
  language plpgsql security definer
  set search_path to 'public', 'private', 'extensions', 'pg_temp'
as $$
declare
  k text := private.fn_oauth_key();
begin
  if k is null or length(k) < 32 then
    raise exception 'CHAVE_DE_CIFRA_AUSENTE — private.app_secrets: nuvemshop_oauth_key (ou GUC app.nuvemshop_oauth_key)';
  end if;
  return pgp_sym_encrypt(p_plaintext, k, 'cipher-algo=aes256');
end;
$$;

create or replace function public.decrypt_cpf(p_contact_id uuid, p_organization_id uuid) returns text
  language plpgsql security definer
  set search_path to 'public', 'private', 'extensions', 'pg_temp'
as $$
declare
  v_cipher bytea;
begin
  if auth.uid() is not null
     and not exists (select 1 from public.fn_user_org_ids() where fn_user_org_ids = p_organization_id)
     and not public.fn_is_platform_admin() then
    raise exception 'documento_org_invalida' using errcode = '42501';
  end if;

  select cpf_encrypted into v_cipher
    from public.contacts
   where id = p_contact_id and organization_id = p_organization_id;

  if v_cipher is null then
    return null;
  end if;

  return pgp_sym_decrypt(v_cipher, private.fn_oauth_key());
end;
$$;

alter function public.encrypt_cpf(text) owner to postgres;
alter function public.decrypt_cpf(uuid, uuid) owner to postgres;

revoke execute on function public.encrypt_cpf(text) from public, anon;
revoke execute on function public.decrypt_cpf(uuid, uuid) from public, anon;
grant execute on function public.encrypt_cpf(text) to authenticated, service_role;
grant execute on function public.decrypt_cpf(uuid, uuid) to authenticated, service_role;

comment on function public.encrypt_cpf(text) is
  'Cifra at-rest do CPF (pgp_sym_encrypt/aes256, chave mestra da 0041). Exigida pelo CHECK contacts_cpf_consistency.';
comment on function public.decrypt_cpf(uuid, uuid) is
  'Decifra o CPF de UM contato da ORG informada (molde 0209: membresia conferida quando há auth.uid). Service_role (MCP) segue direto.';
