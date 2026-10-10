-- 0262_alerta_reabertura — resolver um alerta que continua acontecendo não pode
-- criar uma linha nova a cada tick.
--
-- ┌── O defeito, medido ───────────────────────────────────────────────────
--
-- A unique parcial de `operational_alerts` é sobre `status = 'aberto'`. Isso
-- garante que não haja DOIS alertas abertos para o mesmo evento — e é exatamente
-- por isso que resolver um alerta e deixar a condição valer cria uma linha nova:
--
--   1. o PATCH marca `status = 'resolvido'`
--   2. a unique parcial deixa de cobrir aquela linha
--   3. o próximo tick (a cada 10 minutos) insere de novo
--   4. a pessoa resolveu, e o aviso volta
--
-- Medido no banco em 10/10/2026: resolver e rodar um tick produz **2 linhas para
-- a mesma chave**. Em 30 dias, um pedido assim deixa ~4.300 linhas, e o alerta
-- que alguém fechou continua voltando — que é o pior estado possível: o aviso
-- vira ruído e a pessoa aprende a não ler nenhum.
--
-- ─── A decisão: REABRIR a linha, não criar outra ──────────────────────────
--
-- Três saídas, e duas delas são erradas:
--
--   a) Não recriar (a linha resolvida fica quieta).
--      ERRADO: a condição continua valendo. Se a pessoa resolveu por engano — ou
--      resolveu "por enquanto" — o problema some da tela sem ninguém ver, e é
--      NEVER affirmar que acabou algo que não acabou.
--
--   b) Recriar sempre (o comportamento atual).
--      ERRADO: infla a tabela e devolve um aviso que a pessoa acabou de fechar.
--
--   c) REABRIR a linha resolvida mais recente, contando quantas vezes isso
--      aconteceu. Uma linha por evento, histórico preservado, e o operador vê
--      "isto foi resolvido 3 vezes e voltou 3 vezes" — que é a informação real.
--
-- A escolha é (c). O aviso volta porque o fato continua; o que muda é que ele
-- volta NA MESMA LINHA, e `reaberturas` conta a insistência do problema em vez de
-- esconder o histórico.
--
-- ─── Por que `reaberturas` e não reaproveitar `repeticoes` ────────────────
--
-- `repeticoes` conta quantas vezes a rotina VIU o evento (rodou e manteve).
-- `reaberturas` conta quantas vezes alguém FECHOU e ele voltou. São perguntas
-- diferentes: um evento que ninguém tocou tem `repeticoes = 900` e
-- `reaberturas = 0`; um evento que a pessoa fecha toda semana tem
-- `repeticoes = 900` e `reaberturas = 52`. Misturar os dois esconde
-- exatamente o caso que o operador precisa ver — o que não se resolve sozinho.
--
-- ─── O que NÃO muda ───────────────────────────────────────────────────────
--
-- `status`, `resolvido_por`, `resolvido_em` e `motivo_resolucao` continuam sendo
-- reescritos na reabertura: a linha volta a ser um alerta aberto, e o histórico do
-- POR QUE foi fechada pela última vez vive em `audit_log`, que é onde ele já
-- estava. Guardar o motivo antigo aqui duplicaria o log de auditoria numa tabela
-- que não é de auditoria.

-- ─── 1. O contador de reabertura ──────────────────────────────────────────
--
-- `not null default 0` e não nullable: um alerta com `reaberturas` desconhecida
-- seria lido como "nunca voltou", que é a leitura perigosa.
alter table operational_alerts
  add column if not exists reaberturas integer not null default 0;

comment on column operational_alerts.reaberturas is
  'Quantas vezes o alerta foi fechado por alguém e a condição continuou valendo. '
  'Conta o problema que não se resolve sozinho — diferente de `repeticoes`, que '
  'conta quantas vezes a rotina rodou e manteve o aviso.';

-- ─── 2. O índice que faz a busca ser barata ───────────────────────────────
--
-- A rotina precisa achar "a linha resolvida mais recente desta chave". Sem
-- índice, isso é um seq scan por tick, por organização, a cada 10 minutos.
--
-- DESC porque a busca é pela MAIS RECENTE, e o planner usa o índice na ordem
-- inversa para não ordenar o resultado inteiro.
create index if not exists operational_alerts_chave_recent_idx
  on operational_alerts (chave, updated_at desc)
  where status <> 'aberto';

-- ─── 3. A prova de que a conserto é o que diz ─────────────────────────────
--
-- Uma view que responde a pergunta que a tela faz: "isto voltou?". Sem ela, a
-- pergunta responde com um COUNT que mente.
create or replace view operational_alerts_insistentes as
  select
    id,
    organization_id,
    chave,
    origem_tipo,
    origem_id,
    titulo,
    reaberturas,
    updated_at,
    -- `repeticoes / reaberturas` é a taxa de sucesso do tratamento: quantas
    -- vezes a pessoa fechou contra quantas vezes o problema voltou. Acima de
    -- 0.5, fechar de novo não está resolvendo nada — e essa é a informação que
    -- muda a conversa de "deixa pra lá" para "isso precisa de outra solução".
    case
      when reaberturas = 0 then null
      else round(repeticoes::numeric / reaberturas, 2)
    end as reaperturas_por_fechamento
  from operational_alerts
  where status = 'aberto' and reaberturas > 0;

comment on view operational_alerts_insistentes is
  'Alertas que alguém já fechou e que voltaram. `reaberturas_por_fechamento` > 0.5 '
  'significa que fechar manualmente não está funcionando para este evento.';