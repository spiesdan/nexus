/**
 * A URL DOS FILTROS DAS EMPRESAS — pura, testável, e sem perder o que é de
 * outra tela.
 *
 * ─── O DEFEITO QUE ISSO CORRIGE (F-27, medido em 17/11/2026) ────────────────
 *
 * O efeito que sincroniza filtros com a URL montava a query do ZERO e escrevia
 * caminho fixo: `router.replace("/app/prospeccao?...")`. Só que
 * `/app/prospeccao` é um **alias** que redireciona para
 * `/app/campanhas?subtela=prospeccao`. Resultado: ao abrir a aba Empresas, o
 * efeito disparava na montagem, navegava para o alias, o servidor redirecionava,
 * a árvore remontava — e a aba voltava para "Campanhas". O mapa nunca aparecia,
 * e o `?aba=` do deep-link era perdido no caminho.
 *
 * A regra agora é: **o caminho é o de quem está na tela (`usePathname`)**, e as
 * chaves que este efeito não governa (`subtela`, `aba`, o que o futuro trouxer)
 * são preservadas. Somente as chaves listadas em `CHAVES_DOS_FILTROS` são
 * reescritas — o resto tem outro dono.
 */

/** As chaves que a tela de Empresas controla. Nenhuma outra é tocada. */
export const CHAVES_DOS_FILTROS = [
  "busca_id",
  "busca",
  "categoria",
  "cidade",
  "estado",
  "status",
  "nota_min",
  "com_telefone",
  "com_website",
  "com_whatsapp",
  "so_sem_cliente",
  "minha_fila",
  "ordem",
  "empresa",
] as const;

/** O recorte que vira URL. Campo vazio significa "sem a chave", não "vazio". */
export interface RecorteDaUrl {
  buscaId: string | null;
  busca: string;
  categorias: string[];
  cidade: string;
  estado: string;
  status: string;
  notaMin: string;
  comTelefone: boolean;
  comWebsite: boolean;
  comWhatsapp: boolean;
  soSemCliente: boolean;
  minhaFila: boolean;
  /** `relevancia` é o padrão e não entra na URL — URL curta, link legível. */
  ordem: string;
  selecionadoId: string | null;
}

/**
 * Devolve o caminho + query alvo, preservando o que não é dos filtros.
 *
 * @param pathname o caminho REAL da tela (nunca o alias)
 * @param params a query atual, de onde saem as chaves preservadas
 */
export function montarUrlDosFiltros(
  pathname: string,
  params: URLSearchParams,
  recorte: RecorteDaUrl,
): string {
  const qs = new URLSearchParams(params.toString());
  for (const chave of CHAVES_DOS_FILTROS) qs.delete(chave);

  if (recorte.buscaId) qs.set("busca_id", recorte.buscaId);
  if (recorte.busca.trim()) qs.set("busca", recorte.busca.trim());
  for (const categoria of recorte.categorias) qs.append("categoria", categoria);
  if (recorte.cidade.trim()) qs.set("cidade", recorte.cidade.trim());
  if (recorte.estado.trim()) qs.set("estado", recorte.estado.trim());
  if (recorte.status) qs.set("status", recorte.status);
  if (recorte.notaMin) qs.set("nota_min", recorte.notaMin);
  if (recorte.comTelefone) qs.set("com_telefone", "true");
  if (recorte.comWebsite) qs.set("com_website", "true");
  if (recorte.comWhatsapp) qs.set("com_whatsapp", "true");
  if (recorte.soSemCliente) qs.set("so_sem_cliente", "true");
  if (recorte.minhaFila) qs.set("minha_fila", "true");
  if (recorte.ordem !== "relevancia") qs.set("ordem", recorte.ordem);
  if (recorte.selecionadoId) qs.set("empresa", recorte.selecionadoId);

  return `${pathname}${qs.toString() ? `?${qs}` : ""}`;
}
