/**
 * A ORDEM DA LISTA DO INBOX — uma definição só.
 *
 * ─── O defeito que este módulo fecha ────────────────────────────────────────
 *
 * A lista mostrava a hora de `last_message_at` e, na aba Fila, ordenava por
 * `last_inbound_at`. São dois relógios diferentes: a resposta do atendente
 * adianta o primeiro e não mexe no segundo. O resultado na tela era uma lista
 * que PARECIA fora de ordem — um item com "14:32" acima de outro com "14:35",
 * porque o de baixo era o que tinha recebido mensagem do cliente por último.
 * Medido no relato do dono: "as mensagens não estão em ordem de tempo".
 *
 * A regra do WhatsApp, e a que vale em todas as abas sem exceção: **a lista é
 * ordenada pelo mesmo relógio que ela mostra**. É `last_message_at` — a última
 * mensagem, de qualquer lado. O tempo de espera da Fila continua visível na
 * linha, mas deixa de ser a régua de posição.
 *
 * ─── Por que também no cliente ─────────────────────────────────────────────
 *
 * O servidor já devolve nesta ordem. O cliente reordena por dois motivos que o
 * servidor não alcança:
 *
 *   1. `useInfiniteQuery` concatena páginas na ordem em que elas foram
 *      buscadas. Uma página em cache de antes de um deploy, ou uma refetch que
 *      volta com outro estado, pode chegar fora de sequência — e a tela não
 *      tem como saber sem olhar os timestamps.
 *   2. Realtime + refetch podem sobrepor a borda de duas páginas. Duplicar
 *      item numa lista parece "mensagem repetida"; a deduplicação por id
 *      resolve na origem.
 *
 * Função pura de propósito: o teste de unidade vigia a regra sem DB, sem
 * React e sem mock de react-query.
 */

/** O mínimo que a ordenação precisa saber de uma conversa. */
export interface ConversaOrdenavel {
  id: string;
  last_message_at: string | null;
}

/** `null`, vazio ou inválido não tem tempo — vai para o fim, nunca para o topo. */
function instante(iso: string | null | undefined): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/**
 * Mais recente primeiro, sem duplicata, com desempate determinístico.
 *
 * O empate cai no `id` DESC porque é o mesmo desempate que a consulta usa
 * (`order last_message_at desc, id desc`). Um empate resolvido por ordem de
 * chegada faria a posição de duas conversas do mesmo instante mudar a cada
 * refetch — movimento que não significa nada.
 *
 * `nulls last` não é preferência estética: conversa sem nenhuma mensagem
 * (prospecção recém-criada) não pode aparecer acima de quem acabou de falar.
 */
export function ordenarConversas<T extends ConversaOrdenavel>(conversas: readonly T[]): T[] {
  const porId = new Map<string, T>();
  for (const c of conversas) {
    // Primeira ocorrência vence: as páginas vêm da mais nova para a mais
    // antiga, então a cópia da página de cima é a que acabou de ser buscada.
    if (!porId.has(c.id)) porId.set(c.id, c);
  }

  return [...porId.values()].sort((a, b) => {
    const ta = instante(a.last_message_at);
    const tb = instante(b.last_message_at);
    if (ta !== tb) return tb > ta ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}
