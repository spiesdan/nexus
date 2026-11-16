-- ============================================================================
-- 0323 — Telefone FIXO também vira E.164 no `fn_upsert_wa_contact`.
--
-- ─── O defeito que isto resolve ─────────────────────────────────────────────
--
-- O envio passa para a RPC o telefone só com dígitos — é o que o WAHA usa como
-- `chat_id`. A função só colocava o `+` na frente quando o número casava com a
-- regex de CELULAR BR (12→13 com o nono, ou 13 já com o 9). Fixo — e qualquer
-- número que não seja celular — continuava só com dígitos, e o INSERT em
-- `contacts` estourava `contacts_phone_e164_format` (`^\+\d{8,15}$`).
--
-- Consequência medida em 16/11/2026: a campanha "por região" tinha 252 contatos,
-- 61 deles fixos; 25 das 100 tentativas do dia morreram aqui. A campanha
-- registrava `ultimo_erro`, queimava a cota do dia e não mandava nada.
--
-- Fixo COM WhatsApp existe (o número é fixo, mas tem WhatsApp), então a correção
-- NÃO é pular fixo — é normalizar. A regra passa a ser: se o número não casou
-- com nenhuma das duas grafias de celular, mas tem dígitos, ele recebe o `+`
-- que a tabela exige. Celular continua exatamente como antes, inclusive a
-- promoção 12→13.
--
-- `create or replace`: os grants já existentes (service_role) são preservados.
-- ============================================================================

create or replace function public.fn_upsert_wa_contact(
  p_org uuid, p_kind text, p_phone text, p_lid text, p_chat_id text, p_notify text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_conflito text;
  v_lid text := nullif(regexp_replace(coalesce(p_lid, ''), '@.*$', ''), '');
  v_phone text := nullif(p_phone, '');
  v_digits text;
  v_alt text;
begin
  -- Celular BR de 12 dígitos (local 6–9) ganha o nono. A grafia sem o 9 fica
  -- em v_alt só para a BUSCA — não se escreve mais.
  if v_phone is not null then
    v_digits := regexp_replace(v_phone, '\D', '', 'g');
    if v_digits ~ '^55[1-9][0-9][6-9][0-9]{7}$' then
      v_alt := '+' || v_digits;
      v_phone := '+55' || substring(v_digits from 3 for 2) || '9' || substring(v_digits from 5);
    elsif v_digits ~ '^55[1-9][0-9]9[6-9][0-9]{7}$' then
      v_phone := '+' || v_digits;
      v_alt := '+55' || substring(v_digits from 3 for 2) || substring(v_digits from 6);
    elsif v_digits <> '' then
      -- Fixo (ou qualquer número que não seja celular BR): garante o E.164.
      -- Sem isto, o INSERT abaixo estoura `contacts_phone_e164_format`.
      v_phone := '+' || v_digits;
    end if;
  end if;

  if v_lid is not null then
    select id into v_id from public.contacts
     where organization_id = p_org and wa_lid = v_lid and is_merged_into is null
     limit 1;
  end if;

  if v_id is null and v_phone is not null then
    select id into v_id from public.contacts
     where organization_id = p_org and is_merged_into is null
       and phone_number in (v_phone, v_alt)
     order by case when phone_number = v_phone then 0 else 1 end
     limit 1;
  end if;

  if v_id is not null and v_phone is not null and exists (
    select 1 from public.contacts
     where organization_id = p_org and phone_number = v_phone
       and is_merged_into is null and id <> v_id
  ) then
    v_conflito := v_phone;
    v_phone := null;
  end if;

  if v_id is not null then
    update public.contacts set
      -- Promove 12→13 quando é a MESMA pessoa e o canônico está livre.
      -- Outro número (pessoa diferente) continua intocável.
      phone_number = case
        when v_phone is not null and (phone_number is null or phone_number = v_alt) then v_phone
        else phone_number
      end,
      display_name = coalesce(display_name, nullif(p_notify, '')),
      source_metadata = source_metadata
        || case when v_lid is not null then jsonb_build_object('waha_lid', v_lid) else '{}'::jsonb end
        || case when p_chat_id is not null then jsonb_build_object('waha_chat_id', p_chat_id) else '{}'::jsonb end
        || case when nullif(p_notify, '') is not null then jsonb_build_object('notify_name', p_notify) else '{}'::jsonb end
        || case when v_conflito is not null then jsonb_build_object('telefone_em_conflito', v_conflito) else '{}'::jsonb end,
      updated_at = now()
    where id = v_id;
    return v_id;
  end if;

  begin
    insert into public.contacts (organization_id, phone_number, source, consent, tags, source_metadata, display_name)
    values (p_org, v_phone, 'whatsapp', '{}'::jsonb, '{}'::text[],
      case when v_lid is not null
        then jsonb_build_object('waha_lid', v_lid, 'waha_chat_id', p_chat_id, 'notify_name', nullif(p_notify, ''))
        else jsonb_build_object('waha_chat_id', p_chat_id, 'notify_name', nullif(p_notify, '')) end,
      nullif(p_notify, ''))
    returning id into v_id;
    return v_id;
  exception when unique_violation then
    select id into v_id from public.contacts
     where organization_id = p_org and is_merged_into is null
       and (
         (v_phone is not null and phone_number = v_phone)
         or (v_alt is not null and phone_number = v_alt)
         or (v_lid is not null and wa_lid = v_lid)
       )
     order by case when phone_number = v_phone then 0 else 1 end
     limit 1;
    return v_id;
  end;
end; $$;