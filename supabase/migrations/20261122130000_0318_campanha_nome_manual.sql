-- 0318 — `prospecting_campaigns.nome_manual` (D-02).
--
-- O nome automático da campanha é gerado pelas cidades (D-01). Quando o
-- operador edita o nome, a campanha precisa lembrar disso: regenerar o nome a
-- cada mudança de cidade apagaria o trabalho dele — e o prompt proíbe apagar
-- nome customizado em silêncio.
--
-- `true` = nome do operador, nunca sobrescrever; `false` = automático,
-- regenerado quando a seleção de cidades muda.
--
-- Campanhas que já existem são marcadas `true`: o nome atual foi escolhido
-- antes de existir gerador e não pode ser reescrito por uma atualização. A
-- marcação roda SÓ quando a coluna nasce (guard), senão a reaplicação do
-- baseline transformaria toda campanha nova em manual.

do $mig$
begin
  if not exists (
    select 1
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = 'prospecting_campaigns'
       and c.column_name = 'nome_manual'
  ) then
    alter table public.prospecting_campaigns
      add column nome_manual boolean not null default false;

    update public.prospecting_campaigns set nome_manual = true;
  end if;
end
$mig$;

comment on column public.prospecting_campaigns.nome_manual is
  'D-02: true = nome editado pelo operador (nunca sobrescrever); false = gerado pelas cidades (0318).';
