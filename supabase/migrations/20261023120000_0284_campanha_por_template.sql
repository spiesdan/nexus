-- 0284 — a campanha passa a declarar COMO fala, não só o que fala.
--
-- ─── O defeito que isto resolve ─────────────────────────────────────────────
--
-- O motor de campanha escolhia a primeira sessão WORKING da organização, sem
-- perguntar o que o canal permite. Com um número oficial conectado, a campanha
-- de texto livre continuava sendo enfileirada nele: a API aceitava o POST (200 +
-- wamid) e a Meta recusava a ENTREGA depois (131047 — janela de 24h fechada).
-- O operador via "enviado" no CRM e o cliente não recebia nada.
--
-- No sentido oposto, o canal oficial exige um MODELO APROVADO para falar com
-- quem não abriu conversa. Sem um lugar para guardar qual modelo a campanha
-- usa e quais valores preenchem seus slots, não havia como o motor escolher o
-- canal certo nem como a tela mostrar o que vai sair.
--
-- ─── O desenho ──────────────────────────────────────────────────────────────
--
-- `mensagem_tipo` é a DECLARAÇÃO do que a campanha precisa do canal:
--   'texto'    → texto livre (rotação anti-ban), só em canal que permite;
--   'template' → modelo aprovado, com valores por slot.
--
-- Quem escolhe a sessão é o motor, pela capability do canal
-- (`freeformOutsideWindow` × `requiresTemplates`), nunca por `if provider`.
--
-- `template_contract_hash` é a trava de obsolescência: guarda o hash do contrato
-- no momento em que o operador preencheu os valores. Se o modelo mudar na Meta
-- depois, o tick não tenta "mais ou menos": para a campanha com erro visível.
--
-- `template_values` é jsonb chaveado pelo `slotKey` composto (corpo "1",
-- cabeçalho "header:1", botão "button0:1", card "card0:corpo:1"). O mesmo
-- `slotKey` de `lib/channels/meta/build-components.ts` — duas chaves diferentes
-- mandariam o valor para o slot errado.
--
-- `ultimo_erro`/`ultimo_erro_em` existem para o invariante 4 do sistema vivo:
-- campanha que parou por modelo inválido não pode parar em silêncio. A tela de
-- controle lê os dois e diz o que aconteceu.

alter table public.prospecting_campaigns
  add column if not exists mensagem_tipo text not null default 'texto',
  add column if not exists template_name text,
  add column if not exists template_language text,
  add column if not exists template_contract_hash text,
  add column if not exists template_values jsonb not null default '{}'::jsonb,
  add column if not exists ultimo_erro text,
  add column if not exists ultimo_erro_em timestamptz;

alter table public.prospecting_campaigns
  drop constraint if exists prospecting_campaigns_mensagem_tipo_valido;
alter table public.prospecting_campaigns
  add constraint prospecting_campaigns_mensagem_tipo_valido
  check (mensagem_tipo in ('texto', 'template'));

-- Campanha de template sem o bind completo é campanha que nunca vai sair. O
-- CHECK impede o estado meio-configurado de nascer; a rota valida o modelo e
-- os valores contra o espelho antes de gravar.
alter table public.prospecting_campaigns
  drop constraint if exists prospecting_campaigns_template_bind_coerente;
alter table public.prospecting_campaigns
  add constraint prospecting_campaigns_template_bind_coerente
  check (
    mensagem_tipo <> 'template'
    or (
      template_name is not null
      and template_language is not null
      and template_contract_hash is not null
    )
  );

alter table public.prospecting_campaigns
  drop constraint if exists prospecting_campaigns_template_values_objeto;
alter table public.prospecting_campaigns
  add constraint prospecting_campaigns_template_values_objeto
  check (jsonb_typeof(template_values) = 'object');

comment on column public.prospecting_campaigns.mensagem_tipo is
  'texto = texto livre (rotação anti-ban); template = modelo aprovado no canal oficial. O motor escolhe a sessão pela capability, nunca pelo provider.';
comment on column public.prospecting_campaigns.template_name is
  'Nome exato do modelo aprovado no canal (Meta: name). Só quando mensagem_tipo = template.';
comment on column public.prospecting_campaigns.template_language is
  'Idioma do modelo (ex.: pt_BR). pt e pt_BR são modelos DISTINTOS.';
comment on column public.prospecting_campaigns.template_contract_hash is
  'Hash do contrato derivado no momento em que os valores foram preenchidos. Divergiu = campanha pausada com erro visível.';
comment on column public.prospecting_campaigns.template_values is
  'Valor por slot, chaveado pelo slotKey composto de build-components.ts. Aceita {{nome}}, {{primeiro_nome}}, {{cidade}} e {{categoria}} para interpolar por prospect.';
comment on column public.prospecting_campaigns.ultimo_erro is
  'Por que a campanha parou ou falhou. Visível na tela de controle; limpo no envio seguinte bem-sucedido.';
comment on column public.prospecting_campaigns.ultimo_erro_em is
  'Quando o último erro foi registrado.';
