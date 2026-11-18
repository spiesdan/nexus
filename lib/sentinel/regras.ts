/**
 * Registry das regras do Sentinel v1.
 *
 * A lista é a fonte única: a execução percorre daqui, a tela lê daqui a
 * explicação e o teste cobre cada item. Regra nova entra com id estável e uma
 * função pura; nada de `if` espalhado pelo runner.
 */
import * as correcao from "./regras-correcao";
import * as fiscal from "./regras-fiscal";
import * as operacao from "./regras-operacao";
import type { Regra } from "./tipos";

export const REGRAS: readonly Regra[] = [
  // ─── Fiscal ───────────────────────────────────────────────────────────────
  {
    id: "fiscal.nota_rejeitada",
    categoria: "fiscal",
    descricao:
      "Nota denegada ou com erro de envio: o documento não existe para o cliente e precisa de decisão.",
    detectar: fiscal.notasRejeitadas,
  },
  {
    id: "fiscal.nota_em_emissao_travada",
    categoria: "fiscal",
    descricao: "Nota em emissão há mais de 30 minutos — o estado entre envio e resposta não fechou.",
    detectar: fiscal.notasTravadasEmEmissao,
  },
  {
    id: "fiscal.nota_pendente_antiga",
    categoria: "fiscal",
    descricao: "Nota criada e nunca enviada há mais de 24 horas.",
    detectar: fiscal.notasPendentesAntigas,
  },
  {
    id: "fiscal.nota_sem_vinculo",
    categoria: "fiscal",
    descricao: "Nota autorizada sem pedido vinculado — faturamento e estoque sem origem.",
    detectar: fiscal.notasSemVinculo,
  },
  {
    id: "fiscal.nota_sem_chave",
    categoria: "fiscal",
    descricao: "Nota marcada como autorizada sem chave de acesso persistida.",
    detectar: fiscal.notasAutorizadasSemChave,
  },
  {
    id: "fiscal.nota_duplicada_por_pedido",
    categoria: "fiscal",
    descricao: "Mais de uma nota viva para o mesmo pedido (principal ou secundário do agrupamento).",
    detectar: fiscal.notasDuplicadasPorPedido,
  },
  {
    id: "fiscal.divergencia_valor_nota",
    categoria: "fiscal",
    descricao: "Total da nota diferente do total do pedido vinculado.",
    detectar: fiscal.divergenciaDeValorDaNota,
  },
  {
    id: "fiscal.nota_autorizada_pedido_nao_faturado",
    categoria: "fiscal",
    descricao: "Nota autorizada e pedido ainda em rascunho/análise/aprovado.",
    detectar: fiscal.notasAutorizadasComPedidoNaoFaturado,
  },
  {
    id: "fiscal.pedido_com_nf_sem_nota",
    categoria: "fiscal",
    descricao: "Pedido marcado como COM NOTA e sem nenhuma nota ativa depois do prazo.",
    detectar: fiscal.pedidosComNfSemNota,
  },
  {
    id: "fiscal.job_fiscal_travado",
    categoria: "fiscal",
    descricao: "Job fiscal preso em processamento ou pendente fora da janela de retry.",
    detectar: fiscal.jobsFiscaisTravados,
  },
  {
    id: "fiscal.job_retry_excessivo",
    categoria: "fiscal",
    descricao: "Job fiscal com três ou mais tentativas na mesma nota.",
    detectar: fiscal.jobsFiscaisComRetryExcessivo,
  },
  {
    id: "fiscal.sincronizacao_falhou",
    categoria: "fiscal",
    descricao: "Sincronização de NF-e recebidas falhou nas últimas 24 horas.",
    detectar: fiscal.sincronizacaoFiscalComFalha,
  },

  // ─── Operação ─────────────────────────────────────────────────────────────
  {
    id: "operacao.estoque_negativo",
    categoria: "operacao",
    descricao: "Produto controlado com saldo abaixo de zero.",
    detectar: operacao.estoqueNegativo,
  },
  {
    id: "operacao.estoque_divergente",
    categoria: "operacao",
    descricao:
      "Saldo cacheado difere do razão desde 0242 — hipótese de baixa confiança, confirme com contagem.",
    detectar: operacao.estoqueDivergente,
  },
  {
    id: "operacao.pedido_total_incoerente",
    categoria: "operacao",
    descricao: "Total do pedido não é subtotal − desconto + frete.",
    detectar: operacao.pedidosComTotalIncoerente,
  },
  {
    id: "operacao.pedido_preso",
    categoria: "operacao",
    descricao: "Rascunho ou pedido em análise sem toque há mais de 7 dias.",
    detectar: operacao.pedidosPresos,
  },
  {
    id: "operacao.pedido_sem_cliente",
    categoria: "operacao",
    descricao: "Pedido avançado sem contato vinculado.",
    detectar: operacao.pedidosAvancadosSemCliente,
  },
  {
    id: "operacao.pedido_com_nf_sem_documento",
    categoria: "operacao",
    descricao: "Pedido que exige NF sem o documento do destinatário.",
    detectar: operacao.pedidosComNfSemDocumento,
  },
  {
    id: "operacao.recebivel_sem_origem",
    categoria: "financeiro",
    descricao: "Recebível aberto sem pedido, nota ou cliente.",
    detectar: operacao.recebiveisSemOrigem,
  },
  {
    id: "operacao.recebivel_duplicado",
    categoria: "financeiro",
    descricao: "Recebíveis iguais (cliente, valor e vencimento) em mais de uma linha.",
    detectar: operacao.recebiveisDuplicados,
  },
  {
    id: "operacao.recebivel_parcela_invalida",
    categoria: "financeiro",
    descricao: "Parcela com número maior que o total do plano.",
    detectar: operacao.recebiveisComParcelaInvalida,
  },
  {
    id: "operacao.mercos_importacao_travada",
    categoria: "operacao",
    descricao: "Importação Mercos presa em fila/execução há mais de 45 minutos.",
    detectar: operacao.importacaoMercosTravada,
  },
  {
    id: "operacao.mercos_importacao_falhou",
    categoria: "operacao",
    descricao: "Importação Mercos terminou com erro ou parcial nas últimas 24 horas.",
    detectar: operacao.importacaoMercosFalhou,
  },
  {
    id: "operacao.job_fila_travado",
    categoria: "operacao",
    descricao: "Job de fila preso, atrasado, esgotado ou na dead-letter.",
    detectar: operacao.jobsDaFilaTravados,
  },
  {
    id: "operacao.webhook_falhas",
    categoria: "operacao",
    descricao: "Webhooks com erro ou na dead-letter nas últimas 24 horas.",
    detectar: operacao.webhooksComFalha,
  },
  {
    id: "campanha.cidade_invalida",
    categoria: "campanha",
    descricao: "Campanha ativa com cidade vazia ou UF fora do formato de duas letras.",
    detectar: operacao.campanhasComCidadeInvalida,
  },
  {
    id: "campanha.cidade_repetida",
    categoria: "campanha",
    descricao: "Campanha ativa repete a mesma cidade no recorte.",
    detectar: operacao.campanhasComCidadeRepetida,
  },
  {
    id: "operacao.cliente_duplicado_email",
    categoria: "operacao",
    descricao: "Mais de um cliente ativo com o mesmo e-mail normalizado.",
    detectar: operacao.clientesDuplicadosPorEmail,
  },
  {
    id: "operacao.lead_duplicado",
    categoria: "operacao",
    descricao:
      "Mais de um lead aberto no mesmo funil para o mesmo contato, telefone ou e-mail normalizado.",
    detectar: operacao.leadsDuplicados,
  },
  {
    id: "operacao.correcao_sem_reversao",
    categoria: "operacao",
    descricao:
      "Correção aprovada cujo job saiu do estado/valor que a reversão exigia — reverter agora seria mentira.",
    detectar: correcao.correcaoSemReversao,
  },
  {
    id: "cadastro.endereco_com_lixo",
    categoria: "operacao",
    descricao:
      "Cadastro com endereço em branco ou literal NULL/undefined/NaN, agrupado por organização.",
    detectar: operacao.enderecoComLixo,
  },
  {
    id: "operacao.aprovacao_expirada",
    categoria: "operacao",
    descricao:
      "Ocorrência aprovada além da janela de 5 min do plano revisado; executar exige nova simulação.",
    detectar: correcao.aprovacaoExpirada,
  },
];

export const REGRA_POR_ID = new Map(REGRAS.map((r) => [r.id, r]));

/** Ids válidos — usado por configuração, filtro de tela e teste de contrato. */
export const IDS_DAS_REGRAS = REGRAS.map((r) => r.id);
