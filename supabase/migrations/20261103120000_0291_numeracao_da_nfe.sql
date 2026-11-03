-- 0291 — NUMERAÇÃO DA NF-e: o número vem de um contador, e não do pedido
--
-- O `nNF` da nota saía de `commercial_orders.numero`, que é o número do PEDIDO.
-- Funciona enquanto os dois andarem juntos, e nunca andam: pedido que não vira
-- nota (cancelado, bonificação, amostra) deixa um número pulado para trás, e a
-- SEFAZ exige numeração sequencial por série — cada buraco vira inutilização.
-- Medido nesta instalação antes da troca: 31 pedidos expedidos, 1 nota emitida,
-- e o número da nota seria o do pedido (ex.: 19326 atrás de 19341).
--
-- O contador é do emitente, não do pedido. Quem migra de outro sistema informa
-- o PRÓXIMO número a usar (o último emitido + 1) e a sequência continua de lá.
-- Nulo de propósito: sem número configurado nada é emitido, porque adivinhar
-- aqui significa queimar faixa fiscal de verdade.
--
-- Duas funções, e não um `update` no app, por atomicidade:
--   `fn_reservar_numero_nfe` — `update ... returning` com trava de linha: duas
--   emissões simultâneas recebem números diferentes, sem `select`+`update`;
--   `fn_devolver_numero_nfe` — desfaz a reserva SÓ se ninguém tomou o próximo
--   número (senão a faixa ficaria fora de ordem). Usada quando a falha é local
--   (validação/certificado) e o número não chegou à SEFAZ.
--
-- Idempotente: roda em install (baseline) e em update (migration).

alter table public.fiscal_settings
  add column if not exists proximo_numero integer;

alter table public.fiscal_settings
  drop constraint if exists fiscal_settings_proximo_numero_check;
alter table public.fiscal_settings
  add constraint fiscal_settings_proximo_numero_check
  check (proximo_numero is null or (proximo_numero >= 1 and proximo_numero <= 999999999));

comment on column public.fiscal_settings.proximo_numero is
  'Próximo número de NF-e a reservar nesta série. Nulo = não configurado, e a emissão recusa em vez de adivinhar. Quem migra de outro sistema informa o último número emitido + 1.';

create or replace function public.fn_reservar_numero_nfe(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  update public.fiscal_settings
     set proximo_numero = proximo_numero + 1,
         updated_at = now()
   where organization_id = p_organization_id
     and proximo_numero is not null
  returning proximo_numero - 1 into v_numero;

  -- Nulo = sem numeração configurada. O app transforma isto em recusa nomeada.
  return v_numero;
end;
$$;

create or replace function public.fn_devolver_numero_nfe(p_organization_id uuid, p_numero integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Só devolve se este número ainda for o último reservado (proximo_numero =
  -- p_numero + 1). Se outra emissão já tomou o seguinte, devolver criaria uma
  -- faixa fora de ordem — aí o número fica consumido e aparece em "puladas".
  update public.fiscal_settings
     set proximo_numero = p_numero,
         updated_at = now()
   where organization_id = p_organization_id
     and proximo_numero = p_numero + 1;
  return found;
end;
$$;

-- Função em `public` nasce com EXECUTE para PUBLIC e para a anon key. Revogar
-- as duas origens e conceder só a quem chama (o drain roda com service role).
revoke all on function public.fn_reservar_numero_nfe(uuid) from public, anon, authenticated;
revoke all on function public.fn_devolver_numero_nfe(uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_reservar_numero_nfe(uuid) to service_role;
grant execute on function public.fn_devolver_numero_nfe(uuid, integer) to service_role;
