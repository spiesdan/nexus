-- 0314 — O TETO DO RECEBÍVEL É UMA GARANTIA DO BANCO, NÃO UMA LEITURA DO APP.
--
-- Medido em 18/11/2026: `registrarPagamento` (lib/comercial/financeiro.ts) lia a
-- soma dos pagamentos, validava o teto em memória e só então inseria. Dois
-- recebimentos simultâneos com chaves de idempotência DIFERENTES passavam os
-- dois pela mesma leitura e somavam mais que o valor original — o `UNIQUE`
-- parcial de `financial_payments_idem_key` só protege retry da MESMA chave, não
-- a corrida entre duas chaves. O dinheiro a maior não tinha quem barrasse.
--
-- A correção não muda a regra: `pagamento > saldo` continua virando 422. Ela
-- move a decisão para o único lugar onde a corrida não existe — a transação que
-- insere o pagamento. O `BEFORE INSERT/UPDATE` trava a linha do recebível
-- (`for update`), soma o que já entrou e recusa o que ultrapassa; o `AFTER`
-- recalcula o status (`aberto`/`parcial`/`pago`) na mesma transação, para dois
-- pagamentos simultâneos não deixarem o recebível "parcial" depois de quitado.
--
-- Cancelado continua fechado. Estorno continua permitido (DELETE reduz a soma).
-- Nenhuma coluna, policy ou grant novo em tabela existente. Só triggers.

create or replace function private.fn_financial_payment_valida_saldo()
returns trigger
language plpgsql
as $$
declare
  v_original bigint;
  v_status text;
  v_total bigint;
begin
  -- O lock na linha do recebível é o que serializa duas inserções concorrentes:
  -- a segunda espera a primeira commitar e passa a enxergar o pagamento dela.
  select r.valor_original_cents, r.status
    into v_original, v_status
    from public.financial_receivables r
   where r.id = new.receivable_id
     and r.organization_id = new.organization_id
   for update;

  if not found then
    raise exception 'financial_payment_recebivel_nao_encontrado'
      using errcode = '23503';
  end if;

  if v_status = 'cancelado' then
    raise exception 'financial_payment_recebivel_fechado'
      using errcode = '23514';
  end if;

  -- `new.id` já existe (default gen_random_uuid), então a própria linha fica
  -- fora da soma no UPDATE sem precisar de TG_OP.
  select coalesce(sum(p.valor_cents), 0)
    into v_total
    from public.financial_payments p
   where p.organization_id = new.organization_id
     and p.receivable_id = new.receivable_id
     and p.id <> new.id;

  if v_total + new.valor_cents > v_original then
    raise exception 'financial_payment_acima_do_saldo'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.fn_financial_payment_atualiza_status()
returns trigger
language plpgsql
as $$
declare
  v_org uuid;
  v_receivable uuid;
  v_original bigint;
  v_status text;
  v_total bigint;
  v_novo text;
begin
  if tg_op = 'DELETE' then
    v_org := old.organization_id;
    v_receivable := old.receivable_id;
  else
    v_org := new.organization_id;
    v_receivable := new.receivable_id;
  end if;

  select r.valor_original_cents, r.status
    into v_original, v_status
    from public.financial_receivables r
   where r.id = v_receivable
     and r.organization_id = v_org
   for update;

  if not found then
    return null;
  end if;

  -- Cancelado é decisão explícita de quem opera: pagamento/estorno não o reabre.
  if v_status = 'cancelado' then
    return null;
  end if;

  select coalesce(sum(p.valor_cents), 0)
    into v_total
    from public.financial_payments p
   where p.organization_id = v_org
     and p.receivable_id = v_receivable;

  v_novo := case
    when v_total >= v_original then 'pago'
    when v_total > 0 then 'parcial'
    else 'aberto'
  end;

  if v_novo <> v_status then
    update public.financial_receivables
       set status = v_novo,
           updated_at = now()
     where id = v_receivable
       and organization_id = v_org;
  end if;

  return null;
end;
$$;

revoke all on function private.fn_financial_payment_valida_saldo() from public, anon;
revoke all on function private.fn_financial_payment_atualiza_status() from public, anon;
grant execute on function private.fn_financial_payment_valida_saldo() to authenticated, service_role;
grant execute on function private.fn_financial_payment_atualiza_status() to authenticated, service_role;

drop trigger if exists financial_payments_valida_saldo on public.financial_payments;
create trigger financial_payments_valida_saldo
  before insert or update on public.financial_payments
  for each row execute function private.fn_financial_payment_valida_saldo();

drop trigger if exists financial_payments_atualiza_status on public.financial_payments;
create trigger financial_payments_atualiza_status
  after insert or update or delete on public.financial_payments
  for each row execute function private.fn_financial_payment_atualiza_status();
