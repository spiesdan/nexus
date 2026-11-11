-- 0303_campanha_por_regiao
--
-- O QUE MUDOU
--
-- `prospecting_campaigns.session_id` — o NÚMERO escolhido para a campanha.
--
-- POR QUE ISSO EXISTE
--
-- A campanha por região fala com clientes que já compraram nas cidades
-- escolhidas, por um número NÃO OFICIAL (WAHA). Até aqui o motor escolhia a
-- primeira sessão compatível com o tipo da mensagem
-- (`escolherSessaoDaCampanha`, lib/prospeccao/canal-da-campanha.ts). Com mais de
-- um número pareado, quem decidia era a MÁQUINA — e a campanha podia sair por
-- um número que não é o da operação daquela região.
--
-- A regra do produto é explícita: o operador escolhe o número na tela. Esta
-- coluna guarda a escolha, e o tick obedece. Se o número escolhido deixar de
-- estar WORKING, a campanha PAUSA com motivo — trocar de número em silêncio
-- seria mandar pela porta errada e chamar isso de sucesso.
--
-- NULL = campanha anterior a esta entrega (ou de prospecção/recuperação, que
-- continuam com a escolha automática por capability). A campanha por região
-- SEMPRE grava um id.
--
-- ON DELETE SET NULL: sessão é ARQUIVADA, não apagada — não existe caminho de
-- produto que a remova. O SET NULL está aqui para não travar a remoção da
-- organização (cascade), que apaga as duas tabelas. Nesse caso a campanha já
-- vai embora junto.
--
-- SEM RLS NOVO: coluna numa tabela que já tem RLS e policies — quem enxerga a
-- campanha já podia ler todas as colunas dela. Nada de policy nova.
--
-- Idempotente: o baseline aplica em modo install E update.

alter table public.prospecting_campaigns
  add column if not exists session_id uuid
    references public.channel_sessions(id) on delete set null;

comment on column public.prospecting_campaigns.session_id is
  'Número (channel_sessions.id) escolhido pelo operador para esta campanha. NULL = escolha automática por capability (campanhas anteriores à 0303, prospecção e recuperação).';

create index if not exists prospecting_campaigns_session_id_idx
  on public.prospecting_campaigns (session_id)
  where session_id is not null;
