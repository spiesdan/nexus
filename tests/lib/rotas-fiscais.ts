/**
 * A RÉGUA DA MATRIZ FISCAL — mesmas duas provas da captura de público/auth.
 *
 * Cada rota declara o **h1** que a tela dela tem (o `NexusPageHeader` renderiza
 * `h1` por padrão) e, quando redireciona de propósito, o **destino** — a
 * medição é dele. `semRedirect` marca a rota que tem de renderizar a si mesma.
 *
 * Só entram aqui as rotas com tela própria. `/app/fiscal/notas/[id]` fica de
 * fora porque exige uma nota real: medir com id inventado cairia em 404 e a
 * linha passaria a atestar uma tela que não é a do detalhe.
 */
export const ROTAS_FISCAIS = [
  { slug: "fiscal", path: "/app/fiscal", h1: /^NF-e recebidas$/, semRedirect: true },
  { slug: "fiscal-pendentes", path: "/app/fiscal/pendentes", h1: /^Pendentes de conferência$/, semRedirect: true },
  { slug: "fiscal-notas", path: "/app/fiscal/notas", h1: /^Todas as notas$/, semRedirect: true },
  { slug: "fiscal-xml", path: "/app/fiscal/xml", h1: /^XML recebidos$/, semRedirect: true },
  { slug: "fiscal-resumos", path: "/app/fiscal/resumos", h1: /^Resumos de notas$/, semRedirect: true },
  { slug: "fiscal-relatorios", path: "/app/fiscal/relatorios", h1: /^Relatórios de entradas$/, semRedirect: true },
  { slug: "fiscal-eventos", path: "/app/fiscal/eventos", h1: /^Cancelamentos e eventos$/, semRedirect: true },
  { slug: "fiscal-manifestacoes", path: "/app/fiscal/manifestacoes", h1: /^Manifestação do destinatário$/, semRedirect: true },
  { slug: "fiscal-fornecedores", path: "/app/fiscal/fornecedores", h1: /^Fornecedores das notas$/, semRedirect: true },
  { slug: "fiscal-produtos", path: "/app/fiscal/produtos", h1: /^Produtos das notas$/, semRedirect: true },
  { slug: "fiscal-sincronizacoes", path: "/app/fiscal/sincronizacoes", h1: /^Histórico de sincronização$/, semRedirect: true },
  { slug: "fiscal-configuracoes", path: "/app/fiscal/configuracoes", h1: /^Configurações fiscais$/, semRedirect: true },
  { slug: "financeiro", path: "/app/financeiro", h1: /^Financeiro$/, semRedirect: true },
  // Títulos virou aba do Financeiro: a medição é do DESTINO.
  { slug: "titulos", path: "/app/titulos", h1: /^Financeiro$/, destino: "/app/financeiro" },
] as const;

export type RotaFiscal = (typeof ROTAS_FISCAIS)[number];
