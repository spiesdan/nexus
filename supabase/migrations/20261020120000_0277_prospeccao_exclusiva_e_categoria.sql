-- 0277_prospeccao_exclusiva_e_categoria
--
-- O QUE MUDOU
--
-- 1. A EMPRESA PERTENCE A UMA CAMPANHA SÓ. Até aqui `prospecting_campaigns`
--    guardava `prospect_ids` sem nenhuma trava: a segunda campanha podia
--    selecionar a mesma empresa, o público da base a oferecia de novo e o
--    disparo mandava duas mensagens — uma por campanha. O operador só descobria
--    depois, no número do cliente.
--
--    Duas travas, em camadas diferentes:
--      * TRIGGER `prospecting_campaign_reserva_unica` — a lista fechada
--        (`prospect_ids` de prospects, `contato_ids` de contatos) não pode
--        sobrepor a de outra campanha da mesma organização. É a trava da
--        SELEÇÃO, que impede a empresa de entrar em duas campanhas.
--      * UNIQUE `prospecting_sends_org_prospect_unico` — o ledger de envios
--        passa a ser único por (organização, linha da audiência), não por
--        campanha. É a trava do ENVIO: mesmo que uma lista antiga escape, a
--        segunda campanha não consegue inserir o envio nem com corrida.
--
--    `prospecting_sends.prospect_id` guarda o id da LINHA DA AUDIÊNCIA
--    (prospect ou contato) desde a 0274; a unique global vale para as duas.
--
-- 2. A CATEGORIA GANHA MEMÓRIA. `business_prospects` recebe
--    `categoria_canonica`, `categoria_confianca` e `categoria_revisar`.
--    O rótulo cru do Google continua sendo a evidência primária; a coluna
--    canônica guarda só o que foi CORRIGIDO com evidência (café dentro do
--    posto, posto de saúde, lava-jato, posto com marca classificado como
--    oficina) e o `revisar` marca o que não dá para decidir sem humano
--    (posto sem nome/site que confirme). A função `categoriaEfetiva` é a
--    mesma na tela, no público e no disparo; a coluna é o cache/filtro.
--
-- 3. O backfill abaixo é conservador de propósito: só grava onde há sinal
--    EXPLÍCITO no nome. "Branca" e "Ellg" não viram cafeteria nem posto por
--    adivinhação — viram `revisar`. Quem já tem `categoria_canonica` ou
--    revisão humana não é sobrescrito.
--
-- Idempotente: pode rodar de novo (o baseline aplica em install E update).

-- ─── 1. Categoria efetiva ───────────────────────────────────────────────────

alter table public.business_prospects
  add column if not exists categoria_canonica text,
  add column if not exists categoria_confianca text,
  add column if not exists categoria_revisar boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_prospects_categoria_confianca_check'
  ) then
    alter table public.business_prospects
      add constraint business_prospects_categoria_confianca_check
      check (
        categoria_confianca is null
        or categoria_confianca in ('alta', 'media', 'baixa')
      );
  end if;
end $$;

create index if not exists business_prospects_categoria_revisar_idx
  on public.business_prospects (organization_id)
  where categoria_revisar;

create index if not exists business_prospects_categoria_canonica_idx
  on public.business_prospects (organization_id, categoria_canonica)
  where categoria_canonica is not null;

comment on column public.business_prospects.categoria_canonica is
  'Rótulo efetivo em PT quando o rótulo cru do Google foi corrigido/revisado (café no posto, posto de saúde, lava-jato, posto com marca). NULL = usar o rótulo cru traduzido.';
comment on column public.business_prospects.categoria_confianca is
  'alta | media | baixa — confiança da categoria efetiva. NULL = não calculada.';
comment on column public.business_prospects.categoria_revisar is
  'true = categoria duvidosa; NÃO entra em campanha/disparo até revisão humana.';

-- Backfill: só toca linha que ainda não tem correção/ revisão. O `case` é a
-- mesma ordem da função `lib/prospeccao/categoria-efetiva.ts`.
update public.business_prospects
set categoria_canonica = case
  when categoria = 'Gas station'
    and nome ~* '(esta[cç][aã]o[[:space:]]*caf[eé]|caf[eé]|cafeteria|coffee[[:space:]]*shop)'
    then 'Café'
  when categoria = 'Gas station'
    and nome ~* '(posto[[:space:]]+de[[:space:]]+sa[uú]de|(^|[^a-z])ubs([^a-z]|$)|(^|[^a-z])usf([^a-z]|$)|unidade[[:space:]]+b[aá]sica[[:space:]]+de[[:space:]]+sa[uú]de|posto[[:space:]]+de[[:space:]]+vacina|posto[[:space:]]+de[[:space:]]+enfermagem)'
    then 'Centro público de saúde'
  when categoria = 'Gas station'
    and nome ~* '(posto[[:space:]]+de[[:space:]]+atendimento|posto[[:space:]]+de[[:space:]]+coleta|posto[[:space:]]+policial|posto[[:space:]]+de[[:space:]]+assist[eê]ncia)'
    then 'Órgão público'
  when categoria = 'Gas station'
    and nome ~* '(posto[[:space:]]+de[[:space:]]+molas|molas|suspens[aã]o|alinhamento)'
    then 'Oficina mecânica'
  when categoria = 'Gas station'
    and nome ~* '(lava[cç][aã]o|lavagem|lava[[:space:]-]?jato)'
    then 'Lavejão'
  when categoria = 'Gas station' and nome ~* 'restaurante'
    then 'Restaurante'
  when categoria = 'Gas station' and nome ~* 'lanchonete'
    then 'Lanchonete'
  when categoria = 'Gas station' and nome ~* '(padaria|panificadora)'
    then 'Padaria'
  when categoria = 'Gas station' and nome ~* '(farm[aá]cia|drogaria)'
    then 'Farmácia'
  when categoria = 'Gas station' and nome ~* '(supermercado|hipermercado)'
    then 'Supermercado'
  when categoria = 'Gas station'
    and nome ~* '([[:<:]]loja[[:>:]]|conveni[eê]ncia|[[:<:]]mercado[[:>:]])'
    then 'Mercearia de bairro'
  when categoria = 'Auto repair shop'
    and nome ~* '(auto[[:space:]]*posto|posto[[:space:]]+(ipiranga|shell|petrobras|vibra|br)|posto[[:space:]]+de[[:space:]]+gasolina|posto[[:space:]]+de[[:space:]]+combust[ií]vel)'
    then 'Posto de combustível'
  else categoria_canonica
end,
categoria_confianca = case
  when categoria = 'Gas station'
    and nome ~* '(esta[cç][aã]o[[:space:]]*caf[eé]|caf[eé]|cafeteria|coffee[[:space:]]*shop)'
    then 'alta'
  when categoria = 'Gas station'
    and nome ~* '(posto[[:space:]]+de[[:space:]]+sa[uú]de|(^|[^a-z])ubs([^a-z]|$)|(^|[^a-z])usf([^a-z]|$)|unidade[[:space:]]+b[aá]sica[[:space:]]+de[[:space:]]+sa[uú]de|posto[[:space:]]+de[[:space:]]+vacina|posto[[:space:]]+de[[:space:]]+enfermagem)'
    then 'alta'
  when categoria = 'Auto repair shop'
    and nome ~* '(auto[[:space:]]*posto|posto[[:space:]]+(ipiranga|shell|petrobras|vibra|br)|posto[[:space:]]+de[[:space:]]+gasolina|posto[[:space:]]+de[[:space:]]+combust[ií]vel)'
    then 'media'
  else categoria_confianca
end
where categoria_canonica is null
  and categoria_revisar = false
  and categoria in ('Gas station', 'Auto repair shop');

-- Posto sem nenhuma evidência de combustível e sem site: revisar, não adivinhar.
update public.business_prospects
set categoria_revisar = true,
    categoria_confianca = 'baixa'
where categoria = 'Gas station'
  and categoria_canonica is null
  and categoria_revisar = false
  and nullif(btrim(website), '') is null
  and nome !~* '(posto|combust[ií]vel|gasolina|etanol|diesel|gnv|ipiranga|shell|petrobras|vibra|auto[[:space:]]*posto)';

-- Categoria genérica sem secundária específica: revisar.
update public.business_prospects
set categoria_revisar = true,
    categoria_confianca = 'baixa'
where categoria in (
    'Store', 'Service', 'Establishment', 'Point of interest', 'Business',
    'Local business', 'Corporate office', 'Organization',
    'Association or organization', 'Non-profit organization'
  )
  and categoria_revisar = false
  and categoria_canonica is null
  and (categorias is null or cardinality(categorias) = 0);

-- ─── 2. Reserva exclusiva da campanha ───────────────────────────────────────

create index if not exists prospecting_campaigns_prospect_ids_gin
  on public.prospecting_campaigns using gin (prospect_ids);
create index if not exists prospecting_campaigns_contato_ids_gin
  on public.prospecting_campaigns using gin (contato_ids);

create or replace function public.prospecting_campaign_reserva_unica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conflito_id uuid;
  conflito_nome text;
  conflito_campo text;
begin
  -- A lista de PROSPECTS não pode sobrepor a de outra campanha.
  if new.prospect_ids is not null and cardinality(new.prospect_ids) > 0 then
    select c.id, c.nome into conflito_id, conflito_nome
    from public.prospecting_campaigns c
    where c.organization_id = new.organization_id
      and c.id is distinct from new.id
      and c.prospect_ids && new.prospect_ids
    limit 1;
    if conflito_id is not null then
      raise exception 'prospect_em_outra_campanha'
        using errcode = '23505',
          detail = format(
            'A empresa já está reservada na campanha %s (%s).', conflito_id, conflito_nome
          ),
          hint = 'Remova a empresa da outra campanha antes de adicioná-la a esta.';
    end if;
  end if;

  -- A lista de CONTATOS (campanha de recuperação) segue a mesma regra.
  if new.contato_ids is not null and cardinality(new.contato_ids) > 0 then
    select c.id, c.nome into conflito_id, conflito_nome
    from public.prospecting_campaigns c
    where c.organization_id = new.organization_id
      and c.id is distinct from new.id
      and c.contato_ids && new.contato_ids
    limit 1;
    if conflito_id is not null then
      raise exception 'contato_em_outra_campanha'
        using errcode = '23505',
          detail = format(
            'O contato já está reservado na campanha %s (%s).', conflito_id, conflito_nome
          ),
          hint = 'Remova o contato da outra campanha antes de adicioná-lo a esta.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.prospecting_campaign_reserva_unica() is
  'Impede que a mesma empresa/contato seja reservado por duas campanhas da mesma organização. Trava da SELEÇÃO; o envio é travado pela unique global de prospecting_sends.';

-- Trigger não é chamado pela sessão: o EXECUTE não é exigido na invocação
-- pelo trigger, e concedê-lo a authenticated abriria uma definer volátil.
revoke execute on function public.prospecting_campaign_reserva_unica() from public, anon, authenticated;
grant execute on function public.prospecting_campaign_reserva_unica() to service_role;

drop trigger if exists prospecting_campaign_reserva_unica on public.prospecting_campaigns;
create trigger prospecting_campaign_reserva_unica
  before insert or update of prospect_ids, contato_ids, organization_id
  on public.prospecting_campaigns
  for each row
  execute function public.prospecting_campaign_reserva_unica();

-- ─── 3. Ledger de envio único por organização ───────────────────────────────

-- Se uma instalação antiga já tiver a mesma linha enviada por duas campanhas,
-- a unique não pode ser criada. Mantém o envio MAIS ANTIGO (o primeiro contato
-- foi o real) e remove só os duplicados do ledger — não toca em pedido,
-- contato nem conversa.
delete from public.prospecting_sends a
using public.prospecting_sends b
where a.organization_id = b.organization_id
  and a.prospect_id = b.prospect_id
  and (a.enviado_em, a.id) > (b.enviado_em, b.id);

create unique index if not exists prospecting_sends_org_prospect_unico
  on public.prospecting_sends (organization_id, prospect_id);

comment on index public.prospecting_sends_org_prospect_unico is
  'Uma linha da audiência só pode ser enviada uma vez por organização, em qualquer campanha. Trava do ENVIO; a da seleção é o trigger prospecting_campaign_reserva_unica.';
