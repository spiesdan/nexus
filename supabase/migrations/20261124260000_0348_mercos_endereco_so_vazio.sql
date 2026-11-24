-- 0348 — ENRIQUECIMENTO DE ENDEREÇO DA FICHA DO MERCOS, só em campo vazio.
--
-- O endereço não está no pedido (medido: 0 ocorrências de rua/número/bairro/
-- CEP no bloco do cliente). Vem da ficha do cliente, em requisição separada,
-- e é enriquecimento: se falhar, o pedido entra igual.
-- Cadastro preenchido NUNCA é sobrescrito — o operador corrige à mão.

create or replace function public.fn_mercos_enriquecer_endereco(
  p_org uuid,
  p_documento text,
  p_endereco jsonb
)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_doc text := regexp_replace(coalesce(p_documento, ''), '\D', '', 'g');
  v_id uuid;
begin
  if (auth.jwt() ->> 'role') <> 'service_role'
     and not exists (select 1 from public.fn_user_org_ids() where fn_user_org_ids = p_org)
     and not public.fn_is_platform_admin() then
    raise exception 'mercos_endereco_org_invalida' using errcode = '42501';
  end if;

  if v_doc = '' or p_endereco is null then
    return jsonb_build_object('status', 'sem_documento');
  end if;

  select c.id into v_id
    from public.contacts c
   where c.organization_id = p_org
     and c.is_merged_into is null
     and c.is_anonymized = false
     and (
       regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') = v_doc
       or regexp_replace(coalesce(c.source_metadata->'mercos'->>'documento', ''), '\D', '', 'g') = v_doc
     )
   order by c.created_at desc
   limit 1;

  if v_id is null then
    return jsonb_build_object('status', 'sem_contato');
  end if;

  update public.contacts c
     set logradouro = coalesce(nullif(nullif(btrim(c.logradouro), ''), 'NULL'), nullif(p_endereco->>'logradouro', '')),
         numero_end = coalesce(nullif(nullif(btrim(c.numero_end), ''), 'NULL'), nullif(p_endereco->>'numero_end', '')),
         complemento = coalesce(nullif(nullif(btrim(c.complemento), ''), 'NULL'), nullif(p_endereco->>'complemento', '')),
         bairro = coalesce(nullif(nullif(btrim(c.bairro), ''), 'NULL'), nullif(p_endereco->>'bairro', '')),
         cep = coalesce(nullif(nullif(btrim(c.cep), ''), 'NULL'), nullif(p_endereco->>'cep', '')),
         cidade = coalesce(nullif(nullif(btrim(c.cidade), ''), 'NULL'), nullif(p_endereco->>'cidade', '')),
         uf = coalesce(nullif(nullif(btrim(c.uf), ''), 'NULL'), nullif(p_endereco->>'uf', '')),
         updated_at = now()
   where c.id = v_id;

  return jsonb_build_object('status', 'atualizado', 'contact_id', v_id);
end;
$$;

revoke execute on function public.fn_mercos_enriquecer_endereco(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_mercos_enriquecer_endereco(uuid, text, jsonb) to service_role;
