-- ============================================================================
-- 0238 — ANONIMIZAR UM CONTATO DEIXAVA PROSPECÇÃO, NOTA DE ENTRADA E CONTA A
--       PAGAR LEGÍVEIS
--
-- `fn_lgpd_cascade_redact_contact` percorre uma lista de tabelas escrita à mão,
-- e três tabelas chegadas em setembro ficaram de fora:
--
--   - `business_prospects`  guarda nome, telefone, e-mail, endereço e website
--     da empresa descoberta (migration 0220). `contact_id` vincula o prospecto
--     ao contato anonimizado.
--   - `fiscal_entradas`     guarda o snapshot do FORNECEDOR (emitente_cnpj,
--     emitente_nome, emitente_ie) e a cobrança (migration 0236).
--   - `financial_pagaveis`  guarda o snapshot do fornecedor (fornecedor_nome,
--     fornecedor_cnpj) da conta a pagar (migration 0236).
--
-- O defeito é o mesmo que a 0184 documentou em `calendar_appointments`: a
-- função reporta sucesso por tabela, a rota marca o SLA de D+15 como cumprido,
-- e o dado do titular continua legível no banco. E o `on delete set null` do
-- `contact_id` também não protege nada: este produto ANONIMIZA, não apaga.
--
-- ─── Por que TRIGGER e não um passo dentro da função ─────────────────────
-- O mesmo motivo da 0184: a função vem do `pg_dump` com ~180 linhas no corpo
-- do baseline, e carregar uma CÓPIA inteira dela no apêndice criaria duas
-- fontes que divergem no primeiro conserto. O gancho em uso é o que a 0174 usa
-- para o histórico de captação e a 0184 para a agenda: `after update of
-- is_anonymized on contacts`, disparando na MESMA transação do cascade.
--
-- ─── O que se redige, e o que se PRESERVA ────────────────────────────────
-- REDIGE o que identifica a pessoa/contraparte do contato anonimizado.
-- PRESERVA o registro de operação, conforme a doutrina de LGPD deste produto
-- (o exemplo é a agenda: o QUE aconteceu e QUANDO fica; COM QUEM sai):
--
--   - `business_prospects`: apaga telefone, e-mail, endereço, website, domínio
--     e URLs; preserva categoria, cidade/estado/pais, provider/external_id
--     (identidade da fonte FAZ a deduplicação do §8 da 0220 — remover os dois
--     faria o mesmo prospecto voltar a ser descoberto), score e flags.
--   - `fiscal_entradas`: apaga o snapshot do fornecedor (emitente_cnpj deixa
--     o valor SENTINELA 00000000000000 porque a coluna é NOT NULL — 14 dígitos
--     que não identificam ninguém) e a cobrança; PRESERVA chave, número, série,
--     emissão, valores, itens de estoque e o XML (documento fiscal legal, CPF
--     do destinatário é o do próprio tenant).
--   - `financial_pagaveis`: apaga o snapshot do fornecedor sim o CONTATO, sem
--     apagar o financeiro — parcela, vencimento e valores seguem.
--
-- ─── Por que o gate LGPD ainda a lista como DÍVIDA ───────────────────────
-- `tabelasNaCascata()` lê o CORPO da função no catálogo (`pg_get_functiondef`).
-- Trigger não entra nesse texto, então a varredura continua apontando as 3 —
-- e elas vão seguir declaradas em `DIVIDA_LGPD_CONHECIDA` com razão e quando
-- sai, exatamente como `calendar_appointments` (que tem trigger desde a 0184 e
-- segue na lista). O trigger é o conserto REAL; a entrada documenta que o gate
-- enxerga só o passo dentro da função.
--
-- Aditiva: função nova e trigger novo. Nenhuma linha existente muda ao aplicar.
-- ============================================================================

create or replace function public.fn_redigir_prospeccao_e_fiscal_do_contato_anonimizado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.business_prospects
     set nome                = 'Prospecto anonimizado',
         nome_normalizado    = 'prospecto-anonimizado',
         telefone            = null,
         telefone_normalizado = null,
         whatsapp_potencial  = false,
         website             = null,
         dominio             = null,
         email               = null,
         endereco            = null,
         logradouro          = null,
         numero_end          = null,
         bairro              = null,
         cep                 = null,
         external_url        = null,
         source              = null,
         source_url          = null,
         latitude            = null,
         longitude           = null
   where organization_id = new.organization_id
     and contact_id = new.id;

  update public.fiscal_entradas
     set emitente_cnpj = '00000000000000',
         emitente_nome = 'Fornecedor anonimizado',
         emitente_ie   = null,
         cobranca_json = '[]'::jsonb
   where organization_id = new.organization_id
     and contact_id = new.id;

  update public.financial_pagaveis
     set fornecedor_nome = null,
         fornecedor_cnpj = null,
         observacoes     = null
   where organization_id = new.organization_id
     and contact_id = new.id;

  return new;
end;
$$;

-- Função de trigger não exige EXECUTE de quem dispara o UPDATE, então revogar
-- das três origens não a quebra — e a mantém fora da lista de exceções do
-- invariante de hardening, que é congelada.
revoke execute on function public.fn_redigir_prospeccao_e_fiscal_do_contato_anonimizado() from public, anon, authenticated;
grant  execute on function public.fn_redigir_prospeccao_e_fiscal_do_contato_anonimizado() to service_role;

drop trigger if exists trg_redigir_prospeccao_e_fiscal_ao_anonimizar on public.contacts;
create trigger trg_redigir_prospeccao_e_fiscal_ao_anonimizar
  after update of is_anonymized on public.contacts
  for each row
  when (new.is_anonymized is true and old.is_anonymized is distinct from true)
  execute function public.fn_redigir_prospeccao_e_fiscal_do_contato_anonimizado();

comment on column public.business_prospects.email is
  'Dado pessoal: o trigger trg_redigir_prospeccao_e_fiscal_ao_anonimizar (migration 0238) o apaga quando o contato é anonimizado, junto com telefone, endereço, website, domínio e URLs. provider/external_id são PRESERVADOS: tiram-los faria o prospecto ser redescoberto.';
comment on column public.fiscal_entradas.emitente_cnpj is
  'Dado do fornecedor (contraparte): o trigger trg_redigir_prospeccao_e_fiscal_ao_anonimizar (migration 0238) o troca pelo sentinela 00000000000000 quando o contato é anonimizado (coluna NOT NULL). emitente_nome e emitente_ie também saem; chave, XML e valores são PRESERVADOS — o XML é documento fiscal legal.';
comment on column public.financial_pagaveis.fornecedor_nome is
  'Dado do fornecedor (contraparte): o trigger trg_redigir_prospeccao_e_fiscal_ao_anonimizar (migration 0238) o apaga quando o contato é anonimizado, junto com fornecedor_cnpj e observacoes. Parcela, vencimento e valores são PRESERVADOS — o financeiro é registro de operação.';

notify pgrst, 'reload schema';