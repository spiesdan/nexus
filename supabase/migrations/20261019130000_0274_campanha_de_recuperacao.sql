-- 0274_campanha_de_recuperacao
--
-- O QUE MUDOU
--
-- A prospecção até aqui só sabia falar com PROSPECT: linha de
-- `business_prospects`, empresa que nunca comprou. O motor de agendamento
-- (0273) herdou isso — `prospect_ids` é a lista fechada e `escolherProspect`
-- lê a tabela de prospects, pulando de propósito quem tem
-- `status_comercial = 'cliente'` (cliente não é alvo de prospecção, é cliente).
--
-- O pedido do dono do produto é o INVERSO: uma campanha para quem COMPRAVA e
-- PAROU — a lista do radar de recuperação (`lib/comercial/inatividade.ts`,
-- `app/api/v1/comercial/inativos`). Essa gente não é prospect; é contato
-- (`contacts`) com histórico de compra. Empurrá-los para `business_prospects`
-- seria mentir no cadastro (apareceriam na aba Empresas como empresa fria para
-- garimpar) e ainda colidiria com a regra acima.
--
-- Então a campanha ganha DUAS coisas, e o motor passa a escolher a audiência:
--
--   publico       — 'prospects' (default, o de sempre) ou 'contatos'.
--   contato_ids   — a lista fechada quando a audiência é `contacts`.
--
-- Duas colunas em vez de sobrecarregar `prospect_ids`: o array continua sem
-- ambiguidade — quem lê `prospect_ids` sabe que é prospect, quem lê
-- `contato_ids` sabe que é contato, e o `publico` diz qual das duas manda.
--
-- ─── O ledger deixa de ter FK para business_prospects ──────────────────────
--
-- `prospecting_sends.prospect_id` era FK para `business_prospects(id)`. Com
-- duas audiências, a coluna passa a ser "o id da LINHA DA AUDIÊNCIA" — prospect
-- numa campanha de prospecção, contato numa de recuperação. A FK sai; a UNIQUE
-- (campaign_id, prospect_id), que é a trava de idempotência, FICA — e continua
-- sendo o que impede dois ticks sobrepostos de mandarem duas vezes.
--
-- O que se perde: apagar um prospect não apaga mais o rastro do envio dele. O
-- rastro é histórico (o que foi mandado, quando, com que variação) e apagar
-- histórico junto com o cadastro é o comportamento errado de qualquer forma.
--
-- SEM TABELA NOVA: não há policy nova, nem grant novo. As duas colunas são
-- tenant-aware como o resto da linha, e a escrita segue com agent+ pela policy
-- de `prospecting_campaigns` (0271/0273).

alter table public.prospecting_campaigns
  add column if not exists publico text not null default 'prospects';

alter table public.prospecting_campaigns
  add column if not exists contato_ids uuid[] not null default '{}';

-- O CHECK é a defesa do WORKER contra uma linha gravada por caminho torto: um
-- `publico` desconhecido faria o tick ler a audiência errada.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prospecting_campaigns_publico_check'
      and conrelid = 'public.prospecting_campaigns'::regclass
  ) then
    alter table public.prospecting_campaigns
      add constraint prospecting_campaigns_publico_check
      check (publico in ('prospects', 'contatos'));
  end if;
end $$;

-- A audiência `contatos` precisa ter gente: campanha sem lista não manda para
-- ninguém e o operador acharia que mandou (mesma régua do CHECK de `janelas`).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prospecting_campaigns_contatos_check'
      and conrelid = 'public.prospecting_campaigns'::regclass
  ) then
    alter table public.prospecting_campaigns
      add constraint prospecting_campaigns_contatos_check
      check (publico <> 'contatos' or cardinality(contato_ids) >= 1);
  end if;
end $$;

alter table public.prospecting_sends
  drop constraint if exists prospecting_sends_prospect_id_fkey;

comment on column public.prospecting_campaigns.publico is
  'Audiência: prospects (business_prospects) ou contatos (contacts). Ver 0274.';

comment on column public.prospecting_sends.prospect_id is
  'O id da LINHA DA AUDIÊNCIA: prospect ou contato, conforme prospecting_campaigns.publico.';
