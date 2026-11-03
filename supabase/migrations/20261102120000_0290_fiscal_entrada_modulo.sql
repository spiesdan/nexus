-- 0290 — MÓDULO DE NF-E DE ENTRADA: dados que faltavam para virar módulo fiscal
--
-- A captação já existe (`fiscal_entradas`, `fiscal_entrada_cursor`,
-- `fiscal/sidecar`). O que faltava era o que transforma "lista de XMLs" em
-- módulo fiscal: itens normalizados (para relatório por produto/imposto),
-- eventos de terceiro (cancelamento/CC-e que hoje são descartados), histórico
-- de manifestação com protocolo e usuário, log de sincronização, metadados do
-- certificado e o estado de conferência que impede estoque automático.
--
-- Decisão de modelagem (spec 21, §3): NÃO duplicar o que já existe.
--   fiscal_documents      -> public.fiscal_entradas        (expandida)
--   fiscal_configurations -> public.fiscal_settings        (expandida)
--   fiscal_suppliers      -> public.suppliers              (expandida)
--   fiscal_nsu_control    -> public.fiscal_entrada_cursor  (expandida)
--   fiscal_events         -> public.fiscal_events          (só emissão; entrada
--                            ganha fiscal_document_events, porque a atual exige
--                            invoice_id NOT NULL)
--
-- Idempotente: roda em install (baseline) e em update (migration).

-- ── Configuração da entrada ────────────────────────────────────────────────
alter table public.fiscal_settings
  add column if not exists entrada_ativa boolean not null default false,
  add column if not exists frequencia_minutos integer not null default 60,
  add column if not exists ultima_sincronizacao timestamptz,
  add column if not exists ultimo_cstat text,
  add column if not exists ultimo_motivo text,
  add column if not exists manifestacao_automatica boolean not null default false;

alter table public.fiscal_settings
  drop constraint if exists fiscal_settings_frequencia_check;
alter table public.fiscal_settings
  add constraint fiscal_settings_frequencia_check
  check (frequencia_minutos between 1 and 1440);

comment on column public.fiscal_settings.entrada_ativa is
  'Liga a sincronização automática de NF-e de entrada (distribuição DF-e). Desligada por padrão: nada consulta a SEFAZ sem alguém decidir.';
comment on column public.fiscal_settings.frequencia_minutos is
  'Intervalo mínimo entre sincronizações automáticas, em minutos. Não é regra da SEFAZ: é o ritmo que o operador escolhe. O backoff de 656 manda quando a SEFAZ bloqueia.';
comment on column public.fiscal_settings.manifestacao_automatica is
  'Manifestar sem autorização humana é proibido pela spec 21 §12. Default false e a rotina automática nunca liga isto sozinha.';

-- ── Documento de entrada: estado fiscal + conferência ──────────────────────
alter table public.fiscal_entradas
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists tipo_documento text,
  add column if not exists situacao_fiscal text not null default 'desconhecida',
  add column if not exists protocolo text,
  add column if not exists dh_entrada timestamptz,
  add column if not exists natureza_operacao text,
  add column if not exists totais_json jsonb not null default '{}'::jsonb,
  add column if not exists conferencia_status text not null default 'pendente',
  add column if not exists conferida_por uuid,
  add column if not exists conferida_em timestamptz,
  add column if not exists observacoes text;

alter table public.fiscal_entradas
  drop constraint if exists fiscal_entradas_tipo_documento_check;
alter table public.fiscal_entradas
  add constraint fiscal_entradas_tipo_documento_check
  check (tipo_documento is null or tipo_documento in ('resumo', 'completa'));

alter table public.fiscal_entradas
  drop constraint if exists fiscal_entradas_situacao_fiscal_check;
alter table public.fiscal_entradas
  add constraint fiscal_entradas_situacao_fiscal_check
  check (situacao_fiscal in ('autorizada', 'cancelada', 'denegada', 'desconhecida'));

alter table public.fiscal_entradas
  drop constraint if exists fiscal_entradas_conferencia_status_check;
alter table public.fiscal_entradas
  add constraint fiscal_entradas_conferencia_status_check
  check (conferencia_status in ('pendente', 'em_conferencia', 'aprovada', 'rejeitada'));

-- Linha que já entrou no estoque não pode voltar a "pendente" numa atualização:
-- a importação é a aprovação implícita que existia antes desta migration.
update public.fiscal_entradas
   set conferencia_status = 'aprovada'
 where status = 'importada'
   and conferencia_status = 'pendente';

comment on column public.fiscal_entradas.situacao_fiscal is
  'Situação do documento na SEFAZ. Resumo nasce "desconhecida" (o resumo não traz a situação); vira "autorizada" com o XML completo e "cancelada" com o evento 110111.';
comment on column public.fiscal_entradas.conferencia_status is
  'Portão da importação: estoque e contas a pagar só se movem com "aprovada". Antes desta coluna, clicar em Importar já movia estoque e criava produto — o oposto da spec 21 §9/§14.';
comment on column public.fiscal_entradas.totais_json is
  'Totais do ICMSTot (produtos, frete, seguro, desconto, outras despesas, impostos) como vieram do XML. Itens normalizados ficam em fiscal_document_items.';

create index if not exists fiscal_entradas_org_situacao_idx
  on public.fiscal_entradas (organization_id, situacao_fiscal);
create index if not exists fiscal_entradas_org_conferencia_idx
  on public.fiscal_entradas (organization_id, conferencia_status);
create index if not exists fiscal_entradas_org_supplier_idx
  on public.fiscal_entradas (organization_id, supplier_id);
create index if not exists fiscal_entradas_org_tipo_idx
  on public.fiscal_entradas (organization_id, tipo_documento);

-- ── Fornecedor: identidade fiscal, sem criar tabela paralela ───────────────
alter table public.suppliers
  add column if not exists ie text,
  add column if not exists endereco_json jsonb not null default '{}'::jsonb,
  add column if not exists ultima_nota_em timestamptz,
  add column if not exists total_notas integer not null default 0,
  add column if not exists total_comprado_cents bigint not null default 0;

comment on column public.suppliers.endereco_json is
  'Endereço do emitente como veio no XML. Snapshot: o cadastro do fornecedor pode mudar, o documento não.';
comment on column public.suppliers.total_notas is
  'Denormalizado para a lista de Fornecedores não varrer fiscal_entradas a cada linha. Recalculado pela sincronização.';

-- Unicidade por CNPJ só quando o banco já não tem duplicata. Criar o índice
-- numa base com duplicata derrubaria o update inteiro; e apagar/mergear
-- fornecedor automaticamente é decisão de negócio, não de migration. Em base
-- nova (o self-host) o índice nasce e a garantia vale desde o primeiro dia.
do $$
begin
  if not exists (
    select 1
      from public.suppliers
     where cnpj is not null
     group by organization_id, regexp_replace(cnpj, '\D', '', 'g')
    having count(*) > 1
  ) then
    execute 'create unique index if not exists suppliers_org_cnpj_digits_key
               on public.suppliers (organization_id, regexp_replace(cnpj, ''\D'', '''', ''g''))
             where cnpj is not null';
  end if;
end $$;

create index if not exists suppliers_org_cnpj_digits_lookup_idx
  on public.suppliers (organization_id, regexp_replace(cnpj, '\D', '', 'g'))
  where cnpj is not null;

-- ── Metadados do certificado (o .pfx continua fora do banco) ───────────────
create table if not exists public.fiscal_certificates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  arquivo text not null default 'certificado.pfx',
  titular text,
  cnpj text,
  validade timestamptz,
  sha256 text,
  enviado_por uuid,
  enviado_em timestamptz not null default now(),
  revogado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.fiscal_certificates is
  'Metadados do A1 para a tela avisar vencimento. O arquivo NUNCA entra aqui: fica em /srv/fiscal/certs, fora do Storage e do banco.';
comment on column public.fiscal_certificates.sha256 is
  'Hash do .pfx para detectar troca silenciosa do arquivo no volume. Não permite reconstruir o certificado.';

create unique index if not exists fiscal_certificates_ativo_key
  on public.fiscal_certificates (organization_id)
  where revogado_em is null;

create index if not exists fiscal_certificates_org_idx
  on public.fiscal_certificates (organization_id, enviado_em desc);

-- ── Itens normalizados (relatório por produto/imposto sem varrer JSON) ─────
create table if not exists public.fiscal_document_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entrada_id uuid not null references public.fiscal_entradas(id) on delete cascade,
  numero_item integer not null check (numero_item > 0),
  codigo text not null,
  ean text,
  descricao text not null,
  ncm text,
  cfop text,
  unidade text,
  quantidade numeric(18, 4) not null default 0,
  valor_unitario_cents bigint not null default 0 check (valor_unitario_cents >= 0),
  valor_total_cents bigint not null default 0 check (valor_total_cents >= 0),
  icms_cents bigint not null default 0,
  ipi_cents bigint not null default 0,
  pis_cents bigint not null default 0,
  cofins_cents bigint not null default 0,
  cst text,
  produto_id uuid references public.catalog_products(id) on delete set null,
  associado_por uuid,
  associado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_document_items_item_unico unique (entrada_id, numero_item)
);

comment on table public.fiscal_document_items is
  'Item da nota, normalizado. `fiscal_entradas.itens_json` continua sendo o snapshot bruto do XML — este é o lado consultável.';
comment on column public.fiscal_document_items.produto_id is
  'Vínculo com o catálogo, feito por aprovação humana na conferência. Nulo = item ainda não associado (não cria produto sozinho).';

create index if not exists fiscal_document_items_entrada_idx
  on public.fiscal_document_items (organization_id, entrada_id, numero_item);
create index if not exists fiscal_document_items_produto_idx
  on public.fiscal_document_items (organization_id, produto_id)
  where produto_id is not null;
create index if not exists fiscal_document_items_ncm_idx
  on public.fiscal_document_items (organization_id, ncm)
  where ncm is not null;

-- ── Eventos de terceiro (cancelamento, CC-e) ───────────────────────────────
create table if not exists public.fiscal_document_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entrada_id uuid references public.fiscal_entradas(id) on delete cascade,
  chave text not null check (chave ~ '^\d{44}$'),
  nsu bigint not null default 0,
  tipo text not null check (tipo in ('cancelamento', 'carta_correcao', 'manifestacao', 'outro')),
  tp_evento text not null default '',
  descricao text,
  protocolo text,
  dh_evento timestamptz,
  sequencia integer,
  xml text,
  created_at timestamptz not null default now(),
  constraint fiscal_document_events_nsu_unico unique (organization_id, chave, nsu)
);

comment on table public.fiscal_document_events is
  'Evento de nota RECEBIDA (110111 cancelamento, 110110 CC-e, manifestações). Separada de fiscal_events porque aquela exige invoice_id (nota emitida por nós) e tem outro contrato.';
comment on column public.fiscal_document_events.nsu is
  'NSU do docZip. É a chave de idempotência do replay: a mesma faixa reconsumida não duplica evento.';

create index if not exists fiscal_document_events_chave_idx
  on public.fiscal_document_events (organization_id, chave, dh_evento desc);
create index if not exists fiscal_document_events_tipo_idx
  on public.fiscal_document_events (organization_id, tipo, dh_evento desc);

-- ── Histórico de manifestação (a coluna em fiscal_entradas é só o estado) ──
create table if not exists public.fiscal_manifestations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entrada_id uuid not null references public.fiscal_entradas(id) on delete cascade,
  evento text not null check (evento in ('ciencia', 'confirmacao', 'desconhecimento', 'nao_realizada')),
  justificativa text,
  protocolo text,
  cstat text,
  resultado text not null check (resultado in ('sucesso', 'erro')),
  mensagem text,
  usuario_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.fiscal_manifestations is
  'Uma linha por TRANSMISSÃO (sucesso ou erro). fiscal_entradas.manifestacao guarda só o último estado, para a lista não fazer join.';

create index if not exists fiscal_manifestations_entrada_idx
  on public.fiscal_manifestations (organization_id, entrada_id, created_at desc);

-- ── Log de sincronização ───────────────────────────────────────────────────
create table if not exists public.fiscal_sync_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  origem text not null check (origem in ('manual', 'cron')),
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  nsu_inicial bigint,
  nsu_final bigint,
  max_nsu bigint,
  docs_encontrados integer not null default 0,
  docs_importados integer not null default 0,
  docs_erro integer not null default 0,
  resultado text not null default 'em_andamento'
    check (resultado in ('em_andamento', 'sucesso', 'vazio', 'erro', 'bloqueado')),
  cstat text,
  mensagem text,
  request_id text,
  usuario_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.fiscal_sync_logs is
  'Uma linha por execução, inclusive a que falhou. É o que a subtela Histórico de Sincronização lê — e o que prova que o NSU não andou sem persistência.';

create index if not exists fiscal_sync_logs_org_idx
  on public.fiscal_sync_logs (organization_id, iniciado_em desc);

-- ── Cursor: trava de concorrência e backoff ────────────────────────────────
alter table public.fiscal_entrada_cursor
  add column if not exists max_nsu bigint not null default 0,
  add column if not exists locked_until timestamptz,
  add column if not exists locked_by text,
  add column if not exists ultimo_erro text,
  add column if not exists proxima_tentativa timestamptz;

comment on column public.fiscal_entrada_cursor.locked_until is
  'Lease da sincronização. Manual e cron disputam a MESMA linha: quem não consegue o update atômico recebe 409 em vez de consultar a SEFAZ em paralelo (consumo indevido 656).';
comment on column public.fiscal_entrada_cursor.proxima_tentativa is
  'Backoff após 656/erro. O cron respeita; o botão manual avisa o horário em vez de insistir.';

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Leitura: membro da organização. Escrita: service_role (o serviço de sync usa
-- admin client com organization_id resolvido do guard, nunca do body). A única
-- exceção é fiscal_certificates (manager) e fiscal_manifestations (a policy
-- repete a regra da rota: ciência = agent, o resto = manager).
alter table public.fiscal_certificates enable row level security;
alter table public.fiscal_document_items enable row level security;
alter table public.fiscal_document_events enable row level security;
alter table public.fiscal_manifestations enable row level security;
alter table public.fiscal_sync_logs enable row level security;

drop policy if exists fiscal_certificates_select on public.fiscal_certificates;
create policy fiscal_certificates_select on public.fiscal_certificates
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists fiscal_certificates_write on public.fiscal_certificates;
create policy fiscal_certificates_write on public.fiscal_certificates
  for all using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

drop policy if exists fiscal_document_items_select on public.fiscal_document_items;
create policy fiscal_document_items_select on public.fiscal_document_items
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists fiscal_document_events_select on public.fiscal_document_events;
create policy fiscal_document_events_select on public.fiscal_document_events
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists fiscal_manifestations_select on public.fiscal_manifestations;
create policy fiscal_manifestations_select on public.fiscal_manifestations
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists fiscal_manifestations_insert on public.fiscal_manifestations;
create policy fiscal_manifestations_insert on public.fiscal_manifestations
  for insert with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and (evento = 'ciencia' or public.fn_role_at_least(organization_id, 'manager')))
  );

drop policy if exists fiscal_sync_logs_select on public.fiscal_sync_logs;
create policy fiscal_sync_logs_select on public.fiscal_sync_logs
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

revoke all on public.fiscal_certificates from anon;
revoke all on public.fiscal_document_items from anon;
revoke all on public.fiscal_document_events from anon;
revoke all on public.fiscal_manifestations from anon;
revoke all on public.fiscal_sync_logs from anon;

grant select, insert, update, delete on public.fiscal_certificates to authenticated;
grant select on public.fiscal_document_items to authenticated;
grant select on public.fiscal_document_events to authenticated;
grant select, insert on public.fiscal_manifestations to authenticated;
grant select on public.fiscal_sync_logs to authenticated;

grant all on public.fiscal_certificates to service_role;
grant all on public.fiscal_document_items to service_role;
grant all on public.fiscal_document_events to service_role;
grant all on public.fiscal_manifestations to service_role;
grant all on public.fiscal_sync_logs to service_role;

-- ── updated_at ─────────────────────────────────────────────────────────────
drop trigger if exists trg_fiscal_certificates_updated_at on public.fiscal_certificates;
create trigger trg_fiscal_certificates_updated_at
  before update on public.fiscal_certificates
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_fiscal_document_items_updated_at on public.fiscal_document_items;
create trigger trg_fiscal_document_items_updated_at
  before update on public.fiscal_document_items
  for each row execute function public.fn_set_updated_at();
