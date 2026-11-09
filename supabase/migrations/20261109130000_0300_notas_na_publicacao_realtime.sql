-- ============================================================================
-- 0300 — AS NOTAS DA CONVERSA ENTRAM NA PUBLICAÇÃO DO REALTIME
--
-- ─── O que aconteceu (medido em 09/11/2026, VPS de produção) ───────────────
--
-- `hooks/notifications/useCrmAlerts.ts` está montado no `AppShell`, ou seja, em
-- TODA página autenticada, e assina `conversation_notes` por
-- `postgres_changes`. `hooks/inbox/useConversationNotes.ts` assina a mesma
-- tabela na conversa aberta. Nenhuma das duas estava na publicação
-- `supabase_realtime` — e este Realtime NÃO responde SUBSCRIBED em silêncio
-- como o comentário de `tests/unit/realtime-assinatura-tem-publicacao.test.ts`
-- supõe: ele devolve
--
--   "Unable to subscribe to changes with given parameters. Please check
--    Realtime is enabled for the given connect parameters: [event: *, schema:
--    public, table: conversation_notes, ...]"
--
-- O hook trata isso como `CHANNEL_ERROR` e agenda retomada. Medido no socket:
-- SEIS canais (dois de notas, mais inbox, mensagens, avisos de lead e avisos de
-- mensagem) rejoinando a 1 Hz cada, com o nome preso em `#1`.
--
-- ─── O efeito em cascata, e por que a tela dava "algo deu errado" ──────────
--
-- Cada reassinatura dispara a entrega sintética `{ tipo: "reassinado" }`, que
-- invalida as queries da tela. O resultado medido: ~45 requisições a
-- `/api/v1/conversations` a cada 10 s, cada uma levando ~1 s sob RLS, ~900
-- validações de sessão por minuto, load average 15 numa VPS de 2 vCPU com 32%
-- de steal. O `getUser()` passou a estourar 504 ("Processing this request
-- timed out"), o app tratou como não autenticado, e o inbox caiu no erro.
--
-- O laço em si é um defeito do hook (nome de canal reaproveitado + remoção não
-- aguardada) e foi corrigido em `hooks/realtime/useRealtimeChannel.ts`. Esta
-- migration remove o GATILHO: com a tabela na publicação, a assinatura sobe e
-- não há mais erro para o hook reagir.
--
-- ─── Por que `conversation_notes` ENTRA ────────────────────────────────────
--
-- Nota interna é mudança de estado que outra pessoa precisa ver: quem foi
-- mencionado recebe o aviso (`alerts-notes`) e a conversa aberta mostra a nota
-- nova. É o mesmo critério de `calendar_appointments` na 0183 — e não o de
-- `crm_lead_scores` ("recálculo é telemetria").
--
-- `replica identity full` porque o consumidor assina `event: "*"` com
-- `filter: conversation_id=eq.<id>`: com a identidade padrão (PK) o DELETE
-- chega só com o `id` e não casa o filtro, então apagar uma nota não sairia da
-- tela até o refetch de 45 s. Aqui o custo de WAL é irrelevante — notas são
-- poucas e escritas à mão, ao contrário de uma tabela de pulso.
--
-- Aditiva e idempotente: só acrescenta a tabela à publicação e ajusta a
-- identidade de réplica. Nada de schema, nada de dados.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'conversation_notes'
  ) then
    execute 'alter publication supabase_realtime add table public.conversation_notes';
  end if;
end $$;

-- DELETE com filtro por coluna que não é a PK (ver cabeçalho).
alter table public.conversation_notes replica identity full;

comment on table public.conversation_notes is
  'Nota interna da conversa. ESTÁ na publicação supabase_realtime (migration 0300) porque nota nova é mudança de estado que outra pessoa precisa ver (aviso de menção e a conversa aberta). replica identity FULL para o DELETE casar filter por conversation_id.';

notify pgrst, 'reload schema';
