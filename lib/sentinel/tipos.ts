/**
 * Tipos do Nexus Sentinel v1.
 *
 * O Sentinel é a função do PRODUTO que audita o próprio produto: ele observa
 * as entidades reais (nota, pedido, recebível, fila, campanha), encontra
 * inconsistências determinísticas e abre uma ocorrência com evidência. Ele não
 * decide com IA e não executa correção nesta versão.
 *
 * Regra de ouro deste módulo: **detector puro**. Tudo abaixo recebe uma
 * fotografia (`Snapshot`) e devolve achados; nenhuma função aqui abre conexão,
 * lê relógio ou escreve. É o que permite testar caso positivo e negativo sem
 * banco, e é o que garante que uma falha de coleta/IA não derruba a detecção.
 */

export type Severidade = "info" | "baixa" | "media" | "alta" | "critica";
export const SEVERIDADES = ["info", "baixa", "media", "alta", "critica"] as const satisfies readonly Severidade[];

/** Peso canônico — a tela ordena por ele, nunca por ordem alfabética. */
export const PESO_SEVERIDADE: Record<Severidade, number> = {
  info: 0,
  baixa: 1,
  media: 2,
  alta: 3,
  critica: 4,
};

export type Categoria = "fiscal" | "operacao" | "financeiro" | "campanha";
export const CATEGORIAS = ["fiscal", "operacao", "financeiro", "campanha"] as const satisfies readonly Categoria[];

export type EstadoOcorrencia =
  | "nova"
  | "investigando"
  | "acao_necessaria"
  | "aprovada"
  | "corrigida"
  | "ignorada"
  | "recorrente"
  | "encerrada";
export const ESTADOS = [
  "nova",
  "investigando",
  "acao_necessaria",
  "aprovada",
  "corrigida",
  "ignorada",
  "recorrente",
  "encerrada",
] as const satisfies readonly EstadoOcorrencia[];

/** Estados em que a ocorrência ainda é "a mesma" para o índice único. */
export const ESTADOS_ABERTOS: readonly EstadoOcorrencia[] = [
  "nova",
  "investigando",
  "acao_necessaria",
  "aprovada",
  "recorrente",
];

/** Estados terminais — retenção LGPD só alcança estes. */
export const ESTADOS_TERMINAIS: readonly EstadoOcorrencia[] = [
  "corrigida",
  "ignorada",
  "encerrada",
];

/** Evidência: JSON plano e mínimo. Nunca conversa, documento ou contato. */
export type Evidencia = Record<string, string | number | boolean | null | string[] | number[]>;

export interface Achado {
  /** Id estável da regra, vocabulário do registry (`fiscal.nota_rejeitada`). */
  regra: string;
  categoria: Categoria;
  /** Tabela/entidade de origem, para o deep link e para o filtro da tela. */
  entidadeTipo: string;
  /** Id da linha (ou chave de grupo hasheada). Nunca PII em claro. */
  entidadeId: string;

  titulo: string;
  resumo: string;
  causaProvavel: string;
  severidade: Severidade;
  href: string | null;
  evidencia: Evidencia;
}

/**
 * Impressão digital do EVENTO. Reexecutar não duplica porque o banco tem
 * índice único parcial sobre ela enquanto a ocorrência está aberta.
 *
 * É legível de propósito: quem depura vê `fiscal.nota_rejeitada|invoices|uuid`
 * na linha. Por isso `entidadeId` de grupo é hash (e-mail, combinação de
 * valores), e não o valor cru.
 */
export function fingerprint(a: Pick<Achado, "regra" | "entidadeTipo" | "entidadeId">): string {
  return `${a.regra}|${a.entidadeTipo}|${a.entidadeId}`;
}

// ---------------------------------------------------------------------------
// Fotografia das entidades reais — só as colunas que alguma regra lê.
// ---------------------------------------------------------------------------

export interface NotaFiscal {
  id: string;
  order_id: string | null;
  serie: string;
  numero: number | null;
  chave_acesso: string | null;
  status: string;
  total_cents: number;
  erro: string | null;
  created_at: string;
  updated_at: string;
}

/** Pedidos que compõem a nota (0294): o principal fica em `invoices.order_id`
 * e os secundários nesta tabela. */
export interface NotaPedido {
  invoice_id: string;
  order_id: string;
}

export interface Pedido {
  id: string;
  numero: number;
  status: string;
  exige_nf: boolean;
  total_cents: number;
  subtotal_cents: number;
  desconto_cents: number;
  frete_cents: number;
  contact_id: string | null;
  cliente_documento: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobFiscal {
  id: string;
  invoice_id: string;
  status: string;
  tentativas: number;
  max_tentativas: number;
  proxima_tentativa: string;
  ultimo_erro: string | null;
  updated_at: string;
}

export interface SyncFiscal {
  id: string;
  resultado: string;
  iniciado_em: string;
  finalizado_em: string | null;
  docs_encontrados: number;
  docs_importados: number;
  docs_erro: number;
  mensagem: string | null;
}

export interface Produto {
  id: string;
  codigo: string;
  nome: string;
  quantidade: number;
  controla_estoque: boolean;
  estoque_minimo: number;
  updated_at: string;
}

export interface Recebivel {
  id: string;
  order_id: string | null;
  invoice_id: string | null;
  contact_id: string | null;
  parcela_n: number;
  total_parcelas: number;
  valor_original_cents: number;
  vencimento: string;
  status: string;
}

export interface JobDaFila {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface WebhookEvento {
  id: string;
  provider: string;
  event_type: string | null;
  status: string;
  attempts: number;
  error_message: string | null;
  received_at: string;
}

export interface ImportacaoMercos {
  id: string;
  status: string;
  origem: string;
  started_at: string | null;
  finished_at: string | null;
  orders_new: number;
  errors: unknown;
  created_at: string;
}

export interface CampanhaProspeccao {
  id: string;
  nome: string;
  status: string;
  cidades: unknown;
  categorias: string[];
  recorrencia_dias: number | null;
}

export interface CampanhaVenda {
  id: string;
  nome: string;
  status: string;
  cidade: string;
  uf: string | null;
  categorias: string[];
}

export interface ClienteDuplicado {
  organization_id: string;
  chave: string;
  total: number;
  ids: string[];
}

/**
 * A fotografia de uma organização numa execução. `agoraMs` entra como dado
 * (não como `Date.now()` dentro das regras) para que o teste de tempo seja
 * determinístico e a mesma varredura seja reproduzível.
 */
export interface Snapshot {
  organizationId: string;
  agoraMs: number;
  notas: NotaFiscal[];
  notasPedidos: NotaPedido[];
  pedidos: Pedido[];
  jobsFiscais: JobFiscal[];
  sincronizacoesFiscais: SyncFiscal[];
  produtos: Produto[];
  recebiveis: Recebivel[];
  fila: JobDaFila[];
  webhooks: WebhookEvento[];
  importacoesMercos: ImportacaoMercos[];
  campanhasProspeccao: CampanhaProspeccao[];
  campanhasVenda: CampanhaVenda[];
  clientesDuplicados: ClienteDuplicado[];
}

/** Metadados da regra no registry — a tela lê daqui a explicação. */
export interface Regra {
  id: string;
  categoria: Categoria;
  /** Por que ela existe, em uma frase que a pessoa entende sem ler código. */
  descricao: string;
  detectar: (snapshot: Snapshot) => Achado[];
}

export function snapshotVazio(organizationId: string, agoraMs = 0): Snapshot {
  return {
    organizationId,
    agoraMs,
    notas: [],
    notasPedidos: [],
    pedidos: [],
    jobsFiscais: [],
    sincronizacoesFiscais: [],
    produtos: [],
    recebiveis: [],
    fila: [],
    webhooks: [],
    importacoesMercos: [],
    campanhasProspeccao: [],
    campanhasVenda: [],
    clientesDuplicados: [],
  };
}
