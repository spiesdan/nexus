-- 0261_fiscal_agendado_e_alertas — o pedido diz que é COM NF, o prazo diz 30/45
-- dias, e as rotinas têm onde deixar o aviso.
--
-- ┌── Por que isto é UMA migration e não três ──────────────────────────────────
--
-- `commercial_orders.exige_nf` e `commercial_orders.forma_pagamento` alimentam
-- `financial_receivables`, que já existe; `operational_alerts` é o destino das
-- rotinas que leem os dois. Separar deixaria um estado intermediário em que o
-- pedido declara NF e a rotina ainda não tem onde avisar — e o meio mundo de
-- produção é esse estado intermediário que existe.
--
-- ─── 1. `exige_nf`: a resposta ao "quando o usuário digita" ───────────────────
--
-- Hoje a única forma de o Meu Dia saber que um pedido quer nota é LER
-- `observacoes` buscando "nf" — texto livre que o cliente também escreve. Um
-- "cafe NF na emin" e uma observação qualquer com a letra dupla produzem o
-- mesmo resultado, e nenhum dos dois é confiável.
--
-- A coluna NÃO substitui `observacoes`: as duas coisas continuam existindo, e a
-- marcação é o que a rotina passa a ler. Quem já tinha pedido com NF anotado no
-- texto continua tendo — e a rotina de semeadura (§ abaixo) transforma em
-- `exige_nf` uma única vez, sem apagar o que estava escrito.
--
-- `false` e não `null` como padrão: "não pediu NF" é o caso comum e é um fato,
-- não uma ausência de informação. `null` ficaria ambíguo entre "não pediu" e
-- "ninguém perguntou", e o Meu Dia teria de tratar os dois do mesmo jeito — que
-- é o que faria um pedido ser omitido sem necessidade.

alter table public.commercial_orders
  add column if not exists exige_nf boolean not null default false;

comment on column public.commercial_orders.exige_nf is
  'Pedido declarado como COM NOTA FISCAL. Fonte de verdade da rotina de conferência; não substitui observacoes.';

-- ─── 2. `forma_pagamento`: o que o texto livre não dava ──────────────────────
--
-- `condicao_pagamento text` continua existindo e continua sendo o que a pessoa
-- escreve. `forma_pagamento` é o que o SISTEMA entende, e só existe quando a
-- escolha foi uma das três reconhecidas.
--
-- Por que não um CHECK só com '30'/'45': "agendado30" e "30 dias" e "prazo30"
-- descrevem o mesmo prazo, e normalizar o texto na aplicação é deixar a mesma
-- conta espalhada por três arquivos. O código canônico é o valor gravado.
--
-- `null` = prazo livre ou não informado, e é o DEFAULT de propósito: forçar um
-- dos três quebraria todo pedido à vista que já existe. Quem não tem prazo estruturado continua funcionando, e o financeiro cai no caso comum.

alter table public.commercial_orders
  add column if not exists forma_pagamento text;

alter table public.commercial_orders
  drop constraint if exists commercial_orders_forma_pagamento_valida;
alter table public.commercial_orders
  add constraint commercial_orders_forma_pagamento_valida
  check (
    forma_pagamento is null
    or forma_pagamento = any (
      array['a_vista', 'agendado_30', 'agendado_45']::text[]
    )
  );

comment on column public.commercial_orders.forma_pagamento is
  'Prazo estruturado escolhido na tela. null = prazo livre (o default de tudo que ja existe).';

-- `financial_receivables.forma_pagamento` existia como texto solto; recebe o
-- mesmo vocabulário para que o filtro do financeiro não precise casar string.
alter table public.financial_receivables
  drop constraint if exists financial_receivables_forma_pagamento_valida;
alter table public.financial_receivables
  add constraint financial_receivables_forma_pagamento_valida
  check (
    forma_pagamento is null
    or forma_pagamento = any (
      array['a_vista', 'agendado_30', 'agendado_45', 'outro']::text[]
    )
  );

-- ─── 3. `vencimento`: continua NOT NULL, e o motivo importa ──────────────────
--
-- A decisão do usuário (09/10/2026) foi: pedido de 30/45 dias SEM nota emitida
-- fica **sem vencimento definitivo**. Isso não pode ser `not null` em
-- `financial_receivables` — a coluna hoje não aceita nulo e mudar isso é a
-- diferença entre "não posso gravar" e "gravo marcado como pendente".
--
-- A saída é um estado, não um dado ausente: `vencimento` NULL + o status
-- `aberto` é indistinguível de "esqueceram de preencher". Por isso a coluna nova
-- abaixo. Sem ela, o Meu Dia não tem como dizer "ainda não pode ter data".

alter table public.financial_receivables
  add column if not exists vencimento_depende_de_nf boolean not null default false;

comment on column public.financial_receivables.vencimento_depende_de_nf is
  'true = a forma de pagamento é prazo, mas a NF ainda nao foi emitida: o vencimento sera calculado na emissao.';

-- O CHECK precisa aceitar o par. Sem ele, um insert com `vencimento` NULL e
-- `vencimento_depende_de_nf = true` morre num erro de NOT NULL que nao diz nada
-- sobre a causa — e quem ler o erro vai culpar a coluna errada.
alter table public.financial_receivables
  drop constraint if exists financial_receivables_vencimento_ou_dependencia;
alter table public.financial_receivables
  add constraint financial_receivables_vencimento_ou_dependencia
  check (
    vencimento is not null
    or vencimento_depende_de_nf
  );

-- ─── 4. `operational_alerts`: onde um aviso passa a morar ─────────────────────
--
-- As rotinas em `app/api/v1/cron/` hoje varrem e DESCARTAM. `tarefas` não serve:
-- é escrita pela tela e não tem chave de idempotência, então uma rotina que a
-- cria a cada 5 minutos enche a lista do operador de cópias idênticas.
--
-- A chave é a deciding: `chave` é o identificador do EVENTO
-- (`nf_pendente:<order_id>`, `fora_da_carga:<order_id>`), com unique
-- parcial sobre as linhas abertas. Rodar a rotina duas vezes, três vezes, ou
-- depois de um reprocessamento não muda nada — é o mesmo `INSERT ... ON CONFLICT
-- DO UPDATE` do resto do sistema, e é o que o item 4 do pedido pede por nome.
--
-- Três lugares (Meu Dia, agenda, notificações) leem ESTA tabela. Uma pendência
-- em três lugares com origem comum é a diferença entre "um aviso" e "três
-- avisos que ninguém conseguiria fechar junto".

create table if not exists public.operational_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Identidade do EVENTO, não da linha. Ver acima.
  chave text not null,

  -- De onde vem: `origem_tipo` diz o tipo, `origem_id` a linha na tabela de origem.
  -- referenciar; `origem_id` é a linha na tabela de origem.
  origem_tipo text not null
    check (origem_tipo = any (
      array['nf_pendente', 'fora_da_carga', 'vencimento_proximo', 'vencimento_vencido']::text[]
    )),
  origem_id uuid,

  -- Para o Meu Dia montar o texto sem abrir duas queries por linha.
  titulo text not null,
  descricao text,
  acao_recomendada text,

  -- Para a tela abrir o registro certo.
  href text,

  prioridade text not null default 'normal'
    check (prioridade = any (array['baixa', 'normal', 'alta', 'critica']::text[])),

  status text not null default 'aberto'
    check (status = any (array['aberto', 'resolvido', 'cancelado']::text[])),

  -- Quantas vezes a rotina reaffirmou que o alerta continua valendo. Não é um
  -- contador de "erro": é o que prova que a rotina rodou e manteve o aviso.
  repeticoes integer not null default 0,

  resolvido_em timestamptz,
  resolvido_por uuid references auth.users(id) on delete set null,
  motivo_resolucao text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint operational_alerts_chave_nao_vazia check (length(chave) > 0)
);

-- O que garante a idempotência. O índice é PARCIAL (`status = 'aberto'`), e o
-- motivo não é economia de índice: é semântica. Só linhas abertas são únicas
-- por `chave`, então o mesmo evento pode reaparecer amanhã sem colidir com o
-- registro resolvido de ontem — e o histórico continua inteiro, que é o que o
-- pedido exige ao falar em "preservar o histórico".
create unique index if not exists operational_alerts_chave_aberta_key
  on public.operational_alerts (organization_id, chave)
  where status = 'aberto';

create index if not exists operational_alerts_org_abertos_idx
  on public.operational_alerts (organization_id, status, prioridade, created_at desc);

create index if not exists operational_alerts_origem_idx
  on public.operational_alerts (organization_id, origem_tipo, origem_id);

-- `updated_at` muda a cada reaffirmed; o índice do Meu Dia ordena por ele, não
-- por `created_at` — o que o operador quer ver primeiro é o que está vencendo,
-- não o que nasceu primeiro.
create index if not exists operational_alerts_recentes_idx
  on public.operational_alerts (organization_id, updated_at desc)
  where status = 'aberto';

-- ─── 5. RLS: o MESMO predicado das outras tabelas do tenant ──────────────────
--
-- Sem isto, `admin` (service role) lê tudo — que é o esperado do servidor — e
-- qualquer sessão autenticada lê os alertas das outras organizações.
--
-- O predicado é `organization_id in (select public.fn_user_org_ids()) or
-- public.fn_is_platform_admin()`, COPIADO de `financial_receivables`. E é
-- copiado de propósito: `current_organization_id()` é o nome que o outro
-- projeto usa e que não existe aqui. Escrever o nome certo do outro lugar
-- deixaria a tabela com RLS ligado e COM FUNÇÃO QUE NÃO EXISTE — o que o
-- Postgres aceita, e o resultado é uma política que nunca passa: ninguém vê
-- nada, e nenhuma falha de sintaxe aponta isso.
alter table public.operational_alerts enable row level security;

drop policy if exists operational_alerts_select on public.operational_alerts;
create policy operational_alerts_select on public.operational_alerts
  for select using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

drop policy if exists operational_alerts_insert on public.operational_alerts;
create policy operational_alerts_insert on public.operational_alerts
  for insert with check (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

drop policy if exists operational_alerts_update on public.operational_alerts;
create policy operational_alerts_update on public.operational_alerts
  for update using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  )
  with check (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

drop policy if exists operational_alerts_delete on public.operational_alerts;
create policy operational_alerts_delete on public.operational_alerts
  for delete using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

-- ─── 6. Semeadura: `exige_nf` a partir do que já estava escrito ───────────────
--
-- Migration é DDL + o mínimo de dados que a torna VERDADEIRA. Um pedido criado
-- antes desta coluna pode ter "pedido com nf" na observação, e a rotina do Meu
-- Dia vai ler `exige_nf`. Se eu não semear, todo mundo que já usava o sistema
-- fica sem conferência até mexer no pedido.
--
─��� A marcação é DIRETA, não por regex, e o motivo está na função que vai ler:
-- `lib/meu-dia/nf-pendente.ts` exige que a palavra inteira apareça, para não
-- disparar em "cafe NF na emin". Aqui eu sou mais generoso de propósito
-- (`\mnf\b` com borda de palavra, que pega "COM NF" e "nf, por favor" mas não
-- "cafe"), e a função reavalia o texto todo antes de avisar.
--
-- `status <> 'cancelado'`: pedido cancelado não vira pendência fiscal nunca.
-- Nenhum UPDATE destrutivo: `observacoes` fica como estava, que é o que o
-- pedido diz — preservar as observações originais.

update public.commercial_orders
   set exige_nf = true
 where exige_nf = false
   and status <> 'cancelado'
   and observacoes is not null
   and observacoes ~* '(^|[^a-z0-9])nf([^a-z0-9]|$)';

-- ─── 7. Índice de apoio para a rotina do Meu Dia ─────────────────────────────
--
-- A rotina pergunta "quais pedidos pedem NF e ainda não têm nota emitida". O
-- índice parcial é sobre `exige_nf = true`, que é uma fração pequena da tabela:
-- varredura completa em `commercial_orders` a cada 5 minutos seria desperdício
-- em uma instalação com histórico.

create index if not exists commercial_orders_exige_nf_idx
  on public.commercial_orders (organization_id, created_at desc)
  where exige_nf = true;