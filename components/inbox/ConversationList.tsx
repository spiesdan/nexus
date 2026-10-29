"use client";
import { useEffect, useMemo } from "react";
import { useT } from "@/hooks/i18n/useT";
import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { useChannelSessions } from "@/hooks/channels/useChannelSessions";
import { BTN_REF, BTN_REF_SEC } from "@/components/inbox/estilos-da-referencia";

import { useAutomaticoAtivo } from "@/hooks/ai/useAutomaticoAtivo";

import { ConversationListItem } from "./ConversationListItem";
import { EmptyInbox, EmptyFilterResults } from "@/components/empty";
import { ordenarConversas } from "@/lib/inbox/ordem-da-conversa";
import type {
  ConversationsFilters,
  ConversationWithContact,
} from "@/hooks/inbox/useConversationsRealtime";

interface ListResponse {
  data: ConversationWithContact[];
  meta?: { cursor?: string | null; has_more?: boolean };
}

interface Props {
  /** Query já montada no pai — evita duplicar subscription Realtime + refetch. */
  listQuery: UseInfiniteQueryResult<InfiniteData<ListResponse>, Error>;
  filters: ConversationsFilters;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Optional client-side filter (e.g. only-unread). */
  clientFilter?: (c: ConversationWithContact) => boolean;
  /** Notifies parent when the visible list changes (used by keyboard nav). */
  onVisibleChange?: (ids: string[]) => void;
}

export function ConversationList({
  listQuery: q,
  filters,
  selectedId,
  onSelect,
  clientFilter,
  onVisibleChange,
}: Props) {
  const t = useT();
  // Só mostra POR ONDE a conversa entrou quando há mais de um número. Com um
  // só, o rótulo seria a mesma palavra em toda linha — ruído que ensina o olho
  // a ignorar a área onde vivem os avisos que importam.
  //
  // `?? []` e não `undefined`: enquanto a lista de canais carrega, o certo é
  // NÃO mostrar. Mostrar e sumir depois é pior que aparecer um instante tarde.
  const canais = useChannelSessions().data ?? [];
  const maisDeUmCanal = canais.length > 1;

  // Fila: mostra "Aguardando há…" na linha.
  //
  // ⚠️ A POSIÇÃO ("1º, 2º…") SAIU DAQUI, e a razão é a mesma que unificou a
  // ordenação. A numeração era o índice da lista quando a lista era ordenada
  // por tempo de espera; hoje ela ordena por `last_message_at`, como todas as
  // abas. Manter o número faria o "1º" apontar para a conversa mais RECENTE —
  // o oposto do que a palavra promete — e o atendente leria prioridade onde
  // não há. O que a Fila promete continua visível e verdadeiro: há quanto tempo
  // cada conversa espera.
  const isQueue =
    filters.comando?.includes("aguardando") ?? filters.assigned_to === "unassigned";
  // Uma leitura por lista, compartilhada por todas as linhas (react-query dedupa
  // com o cabeçalho, que faz a mesma pergunta).
  const automaticoDaOrg = useAutomaticoAtivo();

  const items = useMemo(() => {
    const all: ConversationWithContact[] = q.data?.pages.flatMap((p) => p.data) ?? [];
    // A ORDEM É RECALCULADA AQUI, e não herdada da concatenação das páginas.
    //
    // Ordem e hora mostrada na linha têm de ser a MESMA pergunta: a linha
    // imprime `last_message_at`, então é por ele que a lista se ordena — em
    // todas as abas. A definição (e o motivo) vive em
    // `lib/inbox/ordem-da-conversa.ts`; aqui só se aplica, depois de juntar as
    // páginas, para que uma refetch fora de sequência ou a borda sobreposta de
    // duas páginas não apareça como "lista desordenada".
    const ordenadas = ordenarConversas(all);
    return clientFilter ? ordenadas.filter(clientFilter) : ordenadas;
  }, [q.data, clientFilter]);

  // Notify parent of currently-visible IDs (for j/k nav). Must use effect
  // (not render-time call) — invoking onVisibleChange during render triggers
  // setState in InboxLayout from inside ConversationList's render phase,
  // which React 19 forbids.

  /**
   * O badge de atendente só entra quando DISCRIMINA — mesma regra do badge de
   * canal, e pelo mesmo motivo escrito lá: rótulo que se repete em toda linha
   * ensina o olho a ignorar a área onde vivem os avisos que importam.
   *
   * Medido nas abas: "Fila" pede `comando=aguardando` (nenhuma linha tem dono —
   * a régua põe quem tem dono em `humano`), "Minhas" filtra `assigned_to=me`
   * (todas têm o MESMO) e "Automático" pede `comando=automatico` (também sem
   * dono, pela mesma razão). Sobram "Todas" e "Fechadas" — e mesmo nelas, só
   * vale se a página realmente tiver mais de um dono distinto.
   *
   * O `filters.comando` entrou junto com as abas novas: sem ele, a Fila voltaria
   * a repetir o mesmo selo de atendente em cada uma das linhas.
   */
  const mostrarAtendente = useMemo(() => {
    if (filters.assigned_to) return false;
    if (filters.comando && !filters.comando.includes("humano")) return false;
    const donos = new Set(
      items.map((i) => i.assigned_to_user_id).filter((id): id is string => Boolean(id)),
    );
    return donos.size > 1;
  }, [filters.assigned_to, filters.comando, items]);

  useEffect(() => {
    if (onVisibleChange) onVisibleChange(items.map((i) => i.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  if (q.isLoading) {
    return (
      <div className="space-y-3 p-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="p-3">
        <NexusErrorState
          description={t("Erro ao carregar conversas.")}
          onRetry={() => q.refetch()}
          className="border-0 py-6"
        />
      </div>
    );
  }

  if (items.length === 0) {
    /**
     * LISTA VAZIA PORQUE NÃO HÁ CONVERSA ≠ LISTA VAZIA PORQUE O FILTRO NÃO
     * ACHOU NADA.
     *
     * O estado vazio dizia "Sem conversas por aqui — quando chegarem mensagens,
     * elas aparecem aqui em tempo real" mesmo com a busca preenchida e 300
     * conversas carregadas. O atendente conclui que a caixa está vazia e para de
     * procurar; a saída é o outro texto, que manda ajustar o filtro.
     */
    const filtrando = Boolean(
      filters.search?.trim() || filters.tag || filters.channel_session_id || clientFilter,
    );
    return (
      <div className="flex h-full items-center justify-center p-6">
        {filtrando ? <EmptyFilterResults /> : <EmptyInbox />}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {items.map((c) => (
          <ConversationListItem
            key={c.id}
            conversation={c}
            isSelected={c.id === selectedId}
            onSelect={onSelect}
            mostrarEspera={isQueue}
            mostrarCanal={maisDeUmCanal}
            mostrarAtendente={mostrarAtendente}
            automaticoDaOrg={automaticoDaOrg.data}
          />
        ))}
        {q.hasNextPage && (
          <div className="flex justify-center p-3">
            <Button
              size="sm"
              variant="outline"
              className={`${BTN_REF} ${BTN_REF_SEC}`}
              onClick={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
            >
              {q.isFetchingNextPage ? t("Carregando…") : t("Carregar mais")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
