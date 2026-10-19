/**
 * PAGINAÇÃO DO CATÁLOGO — 50 por página, número na URL.
 *
 * Por que existe: a tela entregava os 500 primeiros produtos e filtrava no
 * navegador. Numa loja com 1141 itens, "saco de lixo" mora nas posições
 * 904–958 e a busca respondia vazio para produto que existe — o mesmo
 * "afirmar ausência sobre amostra" da issue #480, agora na tela em vez do
 * agente. A página pede a fatia ao banco (`range` + `count`) e a busca vira
 * filtro do SERVIDOR: o que volta é a resposta, não uma amostra.
 */

export const POR_PAGINA_DO_CATALOGO = 50;

/** Página pedida na URL vira página válida: inteiro ≥ 1, padrão 1. */
export function lerPagina(bruta: string | undefined | null): number {
  const n = Number.parseInt(bruta ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1;
}

/**
 * Total de páginas. NULL quando o `count` não veio — sem `Content-Range` não
 * há total honesto, e a tela mostra "Página N" sem "de Y" em vez de chutar.
 */
export function totalDePaginas(total: number | null, porPagina: number): number | null {
  if (total === null) return null;
  return Math.max(1, Math.ceil(total / porPagina));
}

/** Deslocamento do `range`: página 1 começa em 0. */
export function faixaDaPagina(pagina: number, porPagina: number): { de: number; ate: number } {
  const de = (pagina - 1) * porPagina;
  return { de, ate: de + porPagina - 1 };
}

/**
 * Janela de números para os botões: todas quando cabem (≤ 7), senão
 * primeira, vizinhas da atual e última, com "…" no vão. "…" é texto, não botão.
 */
export function janelaDePaginas(pagina: number, totalPaginas: number): (number | "…")[] {
  if (totalPaginas <= 7) return Array.from({ length: totalPaginas }, (_, i) => i + 1);
  const visiveis = new Set(
    [1, 2, pagina - 1, pagina, pagina + 1, totalPaginas - 1, totalPaginas].filter(
      (p) => p >= 1 && p <= totalPaginas,
    ),
  );
  const ordenados = [...visiveis].sort((a, b) => a - b);
  const saida: (number | "…")[] = [];
  let anterior: number | null = null;
  for (const p of ordenados) {
    if (anterior !== null && p - anterior > 1) saida.push("…");
    saida.push(p);
    anterior = p;
  }
  return saida;
}

/**
 * A vírgula separa termos no `or()` do PostgREST e a barra invertida é escape
 * do LIKE: qualquer uma das duas na busca quebra o filtro (ou vira erro). As
 * duas viram espaço — o resto passa como substring, igual à rota da API.
 */
export function sanitizarBuscaParaIlike(busca: string): string {
  return busca.replace(/[,\\]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Reconstrói a URL do catálogo preservando os filtros ativos — é o único
 * lugar que monta essa URL, para a troca de página não derrubar a busca nem
 * a aba (e vice-versa). Página 1 é omitida: URL limpa é URL compartilhável.
 *
 * 0275 acrescentou os filtros da barra do Mercos — categoria e situação —, e
 * eles TÊM de viajar junto: trocar de página com categoria escolhida e voltar
 * para "todas" é o mesmo defeito de antes, só que com outro campo.
 */
export function urlDoCatalogo(op: {
  busca?: string;
  semFoto?: boolean;
  pagina?: number;
  /** Nome da categoria, como a coluna `categoria` guarda. */
  categoria?: string;
  /** `todos` (default) | `ativos` | `inativos`. */
  status?: "todos" | "ativos" | "inativos";
  /** "Promoções" e "Destaques" como FILTRO DO SERVIDOR, não da página. */
  promo?: boolean;
  destaque?: boolean;
  /** A aba "Configurações" (categorias/tabelas) — também é URL, não estado. */
  config?: "categorias" | "tabelas";
}): string {
  const qs = new URLSearchParams();
  const termo = (op.busca ?? "").trim();
  if (termo) qs.set("busca", termo);
  if (op.semFoto) qs.set("sem_foto", "1");
  if (op.categoria?.trim()) qs.set("categoria", op.categoria.trim());
  if (op.status && op.status !== "todos") qs.set("status", op.status);
  if (op.promo) qs.set("promo", "1");
  if (op.destaque) qs.set("destaque", "1");
  if (op.config) qs.set("config", op.config);
  if ((op.pagina ?? 1) > 1) qs.set("pagina", String(op.pagina));
  const sufixo = qs.toString();
  return sufixo ? `/app/products?${sufixo}` : "/app/products";
}
