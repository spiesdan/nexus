/**
 * Tipos da lógica pura do catálogo do Mercos.
 *
 * O módulo é `.mjs` porque quem o consome em produção são os scripts do worker
 * (`catalogo.mjs`, `parear-itens.mjs`), que rodam direto no Node. O teste é
 * `.ts` e o `typecheck` do repositório é `allowJs: false` — então a ponte de
 * tipos mora aqui, do mesmo jeito que `status.d.mts` e `cliente.d.mts`.
 *
 * As assinaturas usam `unknown` na entrada de propósito: o dado vem de um ERP
 * de terceiro (texto livre de tabela) e a função é justamente quem decide o que
 * é código, nome e preço. Tipar como `string` faria o chamador confiar no dado
 * antes da validação.
 */

export interface ColunasDoCatalogo {
  codigo: number | null;
  nome: number | null;
  unidade: number | null;
  preco: number | null;
  ipi: number | null;
  comissao: number | null;
  estoque: number | null;
}

export interface MapeamentoDeColunas {
  mapa: ColunasDoCatalogo;
  completo: boolean;
  faltando: string[];
}

export interface LinhaColetada {
  codigo?: unknown;
  nome?: unknown;
  preco?: unknown;
  unidade?: unknown;
  foto?: unknown;
  ipi?: unknown;
  comissao?: unknown;
  estoque?: unknown;
  /** `false` só quando a linha veio da visão de inativos (`--todos`). */
  ativo?: boolean;
  situacao?: string;
  cabecalho_lido?: boolean;
  pagina?: number;
}

export interface ProdutoClassificado {
  codigo: string;
  nome: string;
  preco_cents: number;
  ativo: boolean;
  unidade: string | null;
  foto: string | null;
  bruto: LinhaColetada | null;
}

export interface DivergenciaDeLinha {
  indice: number;
  codigo?: string;
  nome?: string | null;
  motivo: string;
}

export interface ClassificacaoDoLote {
  validas: ProdutoClassificado[];
  divergentes: DivergenciaDeLinha[];
  semCodigo: Array<{ indice: number; nome: string | null; motivo: string }>;
}

export interface ProdutoExistente {
  id: string;
  codigo: string;
  nome: string;
  preco_cents?: number | null;
  unidade?: string | null;
  imagem_url?: string | null;
  ativo?: boolean | null;
}

/** O mínimo que o upsert precisa — `foto`/`bruto` são do coletor, não da decisão. */
export interface ProdutoParaUpsert {
  codigo: string;
  nome: string;
  preco_cents: number;
  /** Ausente = ativo (contrato do modo default e das coletas antigas). */
  ativo?: boolean;
  unidade?: string | null;
  foto?: string | null;
  bruto?: LinhaColetada | null;
}

export interface VisaoDoCatalogo {
  situacao: "ativos" | "inativos";
  status: "1" | "2";
  ativo: boolean;
}

export type MotivoDoAtivo =
  | "novo_ativo"
  | "novo_inativo"
  | "preserva_ativo"
  | "preserva_inativo"
  | "nao_rebaixa_ativo"
  | "nao_promove_inativo";

export interface DecisaoDeAtivo {
  ativo: boolean;
  motivo: MotivoDoAtivo;
}

export interface StatusDoUpsert {
  novos_ativos: number;
  novos_inativos: number;
  preservados_ativos: number;
  preservados_inativos: number;
  rebaixamentos_bloqueados: number;
  promocoes_bloqueadas: number;
}

export interface LinhaDoUpsert {
  organization_id: string;
  codigo: string;
  nome: string;
  preco_cents: number;
  moeda: string;
  unidade: string | null | undefined;
  imagem_url: string | null | undefined;
  ativo: boolean;
  origem?: string;
}

export interface PlanoDeUpsert {
  criados: ProdutoParaUpsert[];
  atualizados: Array<ProdutoParaUpsert & { id: string }>;
  divergentes: Array<{
    codigo: string;
    nome_no_banco: string;
    nome_no_mercos: string;
    preco_no_banco_cents: number | null;
    preco_no_mercos_cents: number;
  }>;
}

export interface ItemSemProduto {
  id: string;
  produto_codigo: string | null;
  produto_nome: string | null;
}

export interface CatalogoIndexado {
  porCodigo: Map<string, ProdutoExistente>;
  porCodigoSemZeros: Map<string, ProdutoExistente>;
  porNome: Map<string, ProdutoExistente[]>;
  total: number;
}

export interface PlanoDePareamento {
  porCodigo: Array<{ itemId: string; codigo: string; produtoId: string }>;
  porZero: Array<{ itemId: string; codigo: string; produtoId: string; produtoCodigo: string }>;
  porNome: Array<{ itemId: string; nome: string; produtoId: string; produtoCodigo: string }>;
  ambiguos: Array<{ itemId: string; nome: string; candidatos: string[] }>;
  semProduto: Array<{ itemId: string; codigo: string | null; nome: string | null }>;
}

export declare function normalizarCodigo(valor: unknown): string | null;
export declare function normalizarNome(valor: unknown): string | null;
export declare function chaveSemZeros(codigo: unknown): string | null;
export declare function precoParaCents(valor: unknown): number | null;
export declare function mapearColunas(cabecalho: unknown[] | null | undefined): MapeamentoDeColunas;
export declare const COLUNAS_LEGADO: Readonly<ColunasDoCatalogo>;
export declare function classificarLinhas(linhas: LinhaColetada[] | null | undefined): ClassificacaoDoLote;
export declare function planejarUpsert(
  validas: ProdutoParaUpsert[] | null | undefined,
  existentesPorCodigo: Map<string, ProdutoExistente> | null | undefined,
): PlanoDeUpsert;
export declare function indexarCatalogo(produtos: ProdutoExistente[] | null | undefined): CatalogoIndexado;
export declare function planejarPareamento(
  itens: ItemSemProduto[] | null | undefined,
  catalogo: CatalogoIndexado,
): PlanoDePareamento;

/**
 * As rotas candidatas do catálogo, na ordem de tentativa.
 *
 * A primeira é `/industria/<empresa>/produtos/` — a que o menu autenticado
 * aponta. `/<empresa>/produtos/` responde 404 nesta instalação e fica como
 * rede. Ver `docs/runbooks/mercos-catalogo.md`.
 */
export declare function rotasDoCatalogo(empresa: string): string[];

/** As visões da grade. Default só ativos; `true` (= `--todos`) inclui inativos. */
export declare function visoesDoCatalogo(todos?: boolean): VisaoDoCatalogo[];

/** A URL da rota descoberta com `status` e `p=1` — os parâmetros reais da grade. */
export declare function urlComStatus(rota: string, status: string | number): string;

/** A decisão de `ativo` no upsert por `(organization_id, codigo)`. */
export declare function resolverAtivoNoUpsert(args?: {
  /** Só o status importa aqui — o resto do produto não é lido. */
  existente?: { ativo?: boolean | null } | null;
  ativoEntrante?: boolean | null;
}): DecisaoDeAtivo;

/** Monta as linhas do upsert já com `ativo` decidido — pura, sem Supabase. */
export declare function montarLinhasDoUpsert(args: {
  organizationId: string;
  criados?: ProdutoParaUpsert[] | null;
  atualizados?: ProdutoParaUpsert[] | null;
  existentesPorCodigo?: Map<string, ProdutoExistente> | null;
}): { linhas: LinhaDoUpsert[]; status: StatusDoUpsert };

/**
 * `null` quando a coleta valeu; o motivo da falha quando não valeu.
 *
 * `paginas === 0` e "página lida sem linha" são motivos distintos de propósito.
 */
export declare function motivoDoVazio(contagem: {
  paginas: number;
  produtosLidos: number;
}): string | null;
