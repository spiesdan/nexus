/**
 * Troca parâmetros da QUERY da URL sem pedir um render RSC ao servidor.
 *
 * ─── Por que existe ──────────────────────────────────────────────────────────
 * `router.replace("?...")` dentro de um clique de aba/filtro é uma NAVEGAÇÃO
 * para o App Router: mesmo rota, mesmo HTML, ele ainda faz o roundtrip de RSC
 * (e em produção, com o Supabase cloud a 120–225ms por ida, a cascata de
 * loads do layout repete a cada clique — medido na auditoria de 2026-09-30).
 * Para aba que só muda o que o cliente já busca, o servidor não tem nada a
 * dizer: basta mudar a URL no histórico.
 *
 * ─── O contrato ──────────────────────────────────────────────────────────────
 * - O valor VIVO passa a ser `useState` local de quem chama; a URL é espelho
 *   (compartilhável/deep-link via leitura inicial de `useSearchParams`), não a
 *   fonte. Quem precisa ler de volta, lê `window.location`.
 * - `window.history.state` é repassado, nunca `null`: é ali que o Next guarda
 *   o estado do router; zerar quebra voltar/avançar e a navegação seguinte.
 * - `replace` e não `push`: trocar de aba não deve virar item do histórico
 *   (era assim com `router.replace` também).
 * - O Next intercepta `history.replaceState` e re-renderiza quem lê
 *   `useSearchParams` — client-side, sem request.
 */
export function atualizarQueryDaUrl(mutate: (params: URLSearchParams) => void): void {
  const url = new URL(window.location.href);
  mutate(url.searchParams);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

/**
 * Versão que SUBSTITUI a query inteira (o `router.replace(qs ? p?qs : p)` de
 * antes) — para quando o estado local é um objeto que a URL só espelha, como
 * os filtros do funil (`lib/kanban/filters.ts`). Mesmos contratos de cima:
 * histórico preservado, `replace` e não `push`, sem request de RSC.
 */
export function substituirQueryDaUrl(query: string): void {
  const url = new URL(window.location.href);
  url.search = query ? `?${query}` : "";
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}
