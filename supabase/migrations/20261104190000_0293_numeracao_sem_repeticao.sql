-- 0293 — O NÚMERO DA NF-e NÃO PODE SER ENTREGUE DUAS VEZES
--
-- ─── O defeito, medido em produção em 04/11/2026 ────────────────────────────
--
-- A nota do pedido 19415 (AUTO POSTO DE LUCA) foi AUTORIZADA pela SEFAZ às
-- 18:40 com `nNF` 4577 — e a tela continuou mostrando "Emitindo", sem número,
-- sem chave, sem protocolo. No banco, `invoices` ficou em `em_emissao` com
-- `numero` nulo, enquanto `fiscal_events` guardava `autorizada` com o
-- protocolo 242260528310688.
--
-- A nota 4577 já existia (pedido 19418, ESPONJA): ela falhou ANTES da SEFAZ
-- (faltava NCM) e `fn_devolver_numero_nfe` devolveu o 4577 ao contador. Mas a
-- LINHA da nota continuou com `numero = 4577`. A emissão seguinte reservou
-- 4577 de novo, autorizou, e na hora de gravar bateu no índice único
-- `invoices_org_serie_numero_key` — o UPDATE foi recusado e o erro foi
-- descartado em silêncio. Uma nota fiscal autorizada ficou invisível, e o
-- número 4577 passou a existir em dois lugares.
--
-- ─── O que muda ─────────────────────────────────────────────────────────────
--
-- `fn_reservar_numero_nfe` passa a PULAR todo número que alguma nota desta
-- organização/série já carrega. É a mesma garantia do índice único, mas na
-- reserva — onde ainda dá para escolher o próximo número em vez de falhar no
-- fim, depois de a SEFAZ já ter autorizado.
--
-- A devolução continua existindo (falha local não deve queimar faixa): quem a
-- chama (app) também limpa o número da linha da nota, senão o número voltaria
-- ao contador e ficaria bloqueado pela própria nota que o devolveu.
--
-- Idempotente: roda em install (baseline) e em update (migration).

create or replace function public.fn_reservar_numero_nfe(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
  v_serie text;
  v_voltas integer := 0;
begin
  loop
    -- `update ... returning` trava a linha: duas emissões simultâneas nunca
    -- recebem o mesmo número. O que muda aqui é o que se faz com o número
    -- devolvido — ele é conferido contra as notas que já existem.
    update public.fiscal_settings
       set proximo_numero = proximo_numero + 1,
           updated_at = now()
     where organization_id = p_organization_id
       and proximo_numero is not null
    returning proximo_numero - 1, serie into v_numero, v_serie;

    -- Nulo = sem numeração configurada. O app transforma isto em recusa nomeada.
    if v_numero is null then
      return null;
    end if;

    -- Alguma nota desta série já carrega este número? Então ele está em uso
    -- (autorizada, cancelada ou com falha local) e não pode ser entregue de
    -- novo. Cancelada também conta: a SEFAZ não aceita reutilizar número de
    -- nota cancelada — o caminho é inutilizar a faixa.
    if not exists (
      select 1
        from public.invoices i
       where i.organization_id = p_organization_id
         and i.serie = v_serie
         and i.numero = v_numero
    ) then
      return v_numero;
    end if;

    v_voltas := v_voltas + 1;
    -- Cinto de segurança: contador muito atrás do uso real (importação
    -- malfeita) não pode travar a emissão num laço. Devolver nulo faz o app
    -- recusar com a mensagem de numeração, que é onde alguém conserta.
    if v_voltas >= 10000 then
      return null;
    end if;
  end loop;
end;
$$;

-- A devolução NÃO muda de contrato: continua desfazendo o contador só quando
-- ninguém tomou o número seguinte. Quem limpa `invoices.numero` é o app
-- (`devolverNumeroDaNota`), no mesmo passo — as duas metades são uma operação
-- só, e separá-las é como nasceu o defeito acima.
create or replace function public.fn_devolver_numero_nfe(p_organization_id uuid, p_numero integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.fiscal_settings
     set proximo_numero = p_numero,
         updated_at = now()
   where organization_id = p_organization_id
     and proximo_numero = p_numero + 1;
  return found;
end;
$$;

comment on function public.fn_reservar_numero_nfe(uuid) is
  'Reserva o próximo número de NF-e da série, pulando números que alguma nota da organização já carrega. Nulo = numeração não configurada (o app recusa em vez de adivinhar).';

revoke all on function public.fn_reservar_numero_nfe(uuid) from public, anon, authenticated;
revoke all on function public.fn_devolver_numero_nfe(uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_reservar_numero_nfe(uuid) to service_role;
grant execute on function public.fn_devolver_numero_nfe(uuid, integer) to service_role;
