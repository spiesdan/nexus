/**
 * Construtores de fotografia para os testes das regras.
 *
 * Não é código de produção: cada fábrica devolve o caso NEUTRO (o que não
 * dispara nada) e o teste sobrescreve só o campo que importa. Assim o caso
 * negativo é vizinho do positivo e a diferença entre os dois é legível.
 */
import type {
  CampanhaProspeccao,
  CampanhaVenda,
  ClienteDuplicado,
  ContatoEndereco,
  ConversaParada,
  CorrecaoSentinel,
  EstoqueRazao,
  ImportacaoMercos,
  JobDaFila,
  JobFiscal,
  LeadAberto,
  NotaFiscal,
  Pedido,
  Produto,
  Recebivel,
  Snapshot,
  SyncFiscal,
  WebhookEvento,
} from "./tipos";

export const AGORA = Date.parse("2026-11-18T12:00:00.000Z");

export function ha(ms: number): string {
  return new Date(AGORA - ms).toISOString();
}

export const MIN = 60_000;
export const HORA = 60 * MIN;
export const DIA = 24 * HORA;

export function nota(over: Partial<NotaFiscal> = {}): NotaFiscal {
  return {
    id: "nota-1",
    order_id: "pedido-1",
    serie: "1",
    numero: 10,
    chave_acesso: "35261112345678000199550010000000101234567890",
    status: "autorizada",
    total_cents: 10_000,
    erro: null,
    sefaz_cstat: null,
    sefaz_xmotivo: null,
    extras_fiscais: null,
    created_at: ha(HORA),
    updated_at: ha(HORA),
    ...over,
  };
}

export function pedido(over: Partial<Pedido> = {}): Pedido {
  return {
    id: "pedido-1",
    numero: 1,
    status: "faturado",
    exige_nf: false,
    total_cents: 10_000,
    subtotal_cents: 10_000,
    desconto_cents: 0,
    frete_cents: 0,
    contact_id: "contato-1",
    cliente_documento: "12345678000199",
    created_at: ha(DIA),
    updated_at: ha(HORA),
    ...over,
  };
}

export function jobFiscal(over: Partial<JobFiscal> = {}): JobFiscal {
  return {
    id: "job-fiscal-1",
    invoice_id: "nota-1",
    status: "pendente",
    tentativas: 0,
    max_tentativas: 5,
    proxima_tentativa: ha(MIN),
    ultimo_erro: null,
    updated_at: ha(MIN),
    ...over,
  };
}

export function syncFiscal(over: Partial<SyncFiscal> = {}): SyncFiscal {
  return {
    id: "sync-1",
    resultado: "sucesso",
    iniciado_em: ha(HORA),
    finalizado_em: ha(HORA - MIN),
    docs_encontrados: 1,
    docs_importados: 1,
    docs_erro: 0,
    mensagem: null,
    ...over,
  };
}

export function produto(over: Partial<Produto> = {}): Produto {
  return {
    id: "produto-1",
    codigo: "SKU-1",
    nome: "Produto",
    quantidade: 5,
    controla_estoque: true,
    estoque_minimo: 0,
    updated_at: ha(HORA),
    ...over,
  };
}

export function recebivel(over: Partial<Recebivel> = {}): Recebivel {
  return {
    id: "recebivel-1",
    order_id: "pedido-1",
    invoice_id: null,
    contact_id: "contato-1",
    parcela_n: 1,
    total_parcelas: 1,
    valor_original_cents: 10_000,
    vencimento: "2026-12-01",
    status: "aberto",
    ...over,
  };
}

export function jobFila(over: Partial<JobDaFila> = {}): JobDaFila {
  return {
    id: "job-1",
    kind: "inbound_turn",
    status: "done",
    attempts: 0,
    max_attempts: 5,
    run_after: ha(MIN),
    locked_at: null,
    last_error: null,
    created_at: ha(HORA),
    ...over,
  };
}

export function webhook(over: Partial<WebhookEvento> = {}): WebhookEvento {
  return {
    id: "webhook-1",
    provider: "teste",
    event_type: "message",
    status: "processed",
    attempts: 1,
    error_message: null,
    received_at: ha(HORA),
    ...over,
  };
}

export function mercos(over: Partial<ImportacaoMercos> = {}): ImportacaoMercos {
  return {
    id: "mercos-1",
    status: "success",
    origem: "cron",
    started_at: ha(HORA),
    finished_at: ha(HORA - MIN),
    orders_new: 3,
    errors: [],
    created_at: ha(HORA),
    ...over,
  };
}

export function campanhaProspeccao(
  over: Partial<CampanhaProspeccao> = {},
): CampanhaProspeccao {
  return {
    id: "campanha-1",
    nome: "Campanha",
    status: "ativa",
    cidades: [{ cidade: "Campinas", estado: "SP" }],
    categorias: ["padaria"],
    recorrencia_dias: 7,
    ...over,
  };
}

export function campanhaVenda(over: Partial<CampanhaVenda> = {}): CampanhaVenda {
  return {
    id: "campanha-venda-1",
    nome: "Venda automática",
    status: "active",
    cidade: "Campinas",
    uf: "SP",
    categorias: ["padaria"],
    ...over,
  };
}

export function duplicado(over: Partial<ClienteDuplicado> = {}): ClienteDuplicado {
  return {
    organization_id: "org-1",
    chave: "ana@loja.test",
    total: 2,
    ids: ["contato-1", "contato-2"],
    ...over,
  };
}

export function estoqueRazao(over: Partial<EstoqueRazao> = {}): EstoqueRazao {
  return {
    product_id: "produto-1",
    codigo: "SKU-1",
    nome: "Produto",
    quantidade: 10,
    saldo_razao: 10,
    diferenca: 0,
    movimentos: 2,
    criado_em: ha(7 * DIA),
    ultimo_movimento: ha(HORA),
    ...over,
  };
}

export function leadAberto(over: Partial<LeadAberto> = {}): LeadAberto {
  return {
    id: "lead-1",
    pipeline_id: "pipeline-1",
    stage_id: "etapa-1",
    contact_id: "contato-1",
    created_at: ha(HORA),
    crm_stages: { name: "Novo" },
    contatos: {
      name: "Ana",
      display_name: null,
      phone_number: "+5511999998888",
      email_normalized: "ana@loja.test",
    },
    ...over,
  };
}

export function contatoEndereco(over: Partial<ContatoEndereco> = {}): ContatoEndereco {
  return {
    id: "contato-1",
    logradouro: null,
    complemento: null,
    bairro: null,
    cidade: null,
    ...over,
  };
}

export function conversaParada(over: Partial<ConversaParada> = {}): ConversaParada {
  return {
    id: "conversa-1",
    status: "claimed",
    assigned_to_user_id: "atendente-1",
    assigned_at: ha(10 * DIA),
    last_message_at: ha(9 * DIA),
    ...over,
  };
}

export function correcaoSentinel(over: Partial<CorrecaoSentinel> = {}): CorrecaoSentinel {
  return {
    ocorrencia_id: "ocorrecao-1",
    estado: "corrigida",
    job_id: "job-1",
    aprovada_em: ha(20 * MIN),
    correcao: {
      job_id: "job-1",
      run_after_antes: ha(3 * HORA),
      run_after_depois: ha(10 * MIN),
      executada_em: ha(10 * MIN),
    },
    job: {
      id: "job-1",
      kind: "watchdog",
      status: "pending",
      run_after: ha(10 * MIN),
    },
    ...over,
  };
}

export function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    organizationId: "org-1",
    agoraMs: AGORA,
    notas: [],
    notasPedidos: [],
    pedidos: [],
    jobsFiscais: [],
    sincronizacoesFiscais: [],
    produtos: [],
    estoqueRazao: [],
    recebiveis: [],
    leadsAbertos: [],
    fila: [],
    webhooks: [],
    importacoesMercos: [],
    campanhasProspeccao: [],
    campanhasVenda: [],
    clientesDuplicados: [],
    correcoes: [],
    contatosEndereco: [],
    conversasParadas: [],
    sloApi: null,
    ...over,
  };
}

/** Primeiro item com erro legível — o teste diz "esperava um achado" quando não veio. */
export function primeiro<T>(lista: readonly T[]): T {
  const [item] = lista;
  if (item === undefined) throw new Error("esperava ao menos um item na lista");
  return item;
}
