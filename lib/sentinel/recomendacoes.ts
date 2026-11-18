/**
 * Nível 1 — o plano de correção REVISÁVEL de cada regra.
 *
 * Nada aqui executa nada. O motor anexa o plano ao achado, o runner persiste
 * junto da ocorrência e a tela mostra passos, pendências, risco,
 * reversibilidade e fonte. É o que separa "o sistema achou um problema" de
 * "alguém sabe o que fazer com ele".
 *
 * Por que um mapa por `regra.id` e não um campo em cada detector: o ID já é o
 * contrato do registry; um teste garante que toda regra tem plano e que todo
 * plano tem os campos obrigatórios. Regra nova sem plano reprova no CI em vez
 * de nascer muda na tela.
 */
import type { Achado, Confianca, Recomendacao, Reversibilidade, RiscoDaAcao } from "./tipos";

interface OpcoesDoPlano {
  fonte: string[];
  risco: RiscoDaAcao;
  reversibilidade: Reversibilidade;
  exigeAprovacao?: boolean;
  limitacao?: string | null;
  confianca?: Confianca;
}

function plano(
  resumo: string,
  passos: string[],
  camposPendentes: string[],
  opcoes: OpcoesDoPlano,
): Recomendacao {
  return {
    resumo,
    passos,
    campos_pendentes: camposPendentes,
    risco: opcoes.risco,
    reversibilidade: opcoes.reversibilidade,
    exige_aprovacao: opcoes.exigeAprovacao ?? true,
    fonte: opcoes.fonte,
    limitacao: opcoes.limitacao ?? null,
    confianca: opcoes.confianca ?? "alta",
  };
}

type Construtor = (achado: Achado) => Recomendacao;

/**
 * Uma entrada por `regra.id`. O teste `recomendacoes.test.ts` compara este mapa
 * com o registry — faltar uma reprova; sobrar uma também (regra removida e
 * plano órfão é dívida silenciosa).
 */
export const RECOMENDACOES: Record<string, Construtor> = {
  // ─── Fiscal ───────────────────────────────────────────────────────────────
  "fiscal.nota_rejeitada": () =>
    plano(
      "Resolver a rejeição antes de qualquer reemissão.",
      [
        "Abra a nota e leia a mensagem retornada pela SEFAZ/provedor.",
        "Corrija o cadastro fiscal do destinatário ou o item que motivou a rejeição.",
        "Confirme que não existe outra nota viva para o mesmo pedido.",
        "Só então reenfileire a emissão pela tela de notas.",
      ],
      ["motivo exato da rejeição", "campo fiscal a corrigir", "confirmação de nota única por pedido"],
      {
        fonte: ["invoices", "fiscal_events", "commercial_orders"],
        risco: "alto",
        reversibilidade: "parcial",
        limitacao:
          "Reemissão só é segura depois de confirmar que a tentativa anterior não chegou à SEFAZ.",
      },
    ),

  "fiscal.nota_em_emissao_travada": () =>
    plano(
      "Verificar o dreno fiscal e o provedor antes de retomar a nota.",
      [
        "Confira se o cron `fiscal-drain` está rodando e se o job da nota existe.",
        "Leia o último evento/erro da nota para separar timeout de rejeição.",
        "Não enfileire uma segunda emissão enquanto a primeira puder estar em voo.",
        "Se o lease venceu, retome pelo próprio dreno; não crie nota nova.",
      ],
      ["estado do job", "último evento da nota", "se o provedor recebeu a transmissão"],
      {
        fonte: ["invoices", "fiscal_jobs", "fiscal_events"],
        risco: "alto",
        reversibilidade: "parcial",
        exigeAprovacao: false,
        limitacao: "Estado `em_emissao` não prova que a SEFAZ recebeu; a confirmação vem do job/provedor.",
      },
    ),

  "fiscal.nota_pendente_antiga": () =>
    plano(
      "Decidir se a nota ainda deve ser emitida.",
      [
        "Confira o pedido e se o cliente ainda espera a nota.",
        "Verifique por que a nota nunca foi enfileirada.",
        "Enfileire a emissão ou cancele a nota pendente com motivo.",
      ],
      ["decisão do comercial", "motivo do não-envio"],
      {
        fonte: ["invoices", "commercial_orders", "fiscal_jobs"],
        risco: "medio",
        reversibilidade: "reversivel",
      },
    ),

  "fiscal.nota_sem_vinculo": () =>
    plano(
      "Vincular a nota autorizada ao pedido correto.",
      [
        "Identifique o pedido que a nota deveria faturar.",
        "Confira total, destinatário e itens antes de vincular.",
        "Vincule pela tela do pedido/nota e confira o status `faturado`.",
      ],
      ["pedido de origem", "confirmação de valor e destinatário"],
      {
        fonte: ["invoices", "commercial_orders", "invoice_orders"],
        risco: "medio",
        reversibilidade: "reversivel",
      },
    ),

  "fiscal.nota_sem_chave": () =>
    plano(
      "Recuperar a chave de acesso da nota autorizada.",
      [
        "Consulte a nota no provedor/SEFAZ pelo protocolo ou série/número.",
        "Persista a chave e o XML pela sincronização oficial.",
        "Se a autorização não for confirmável, trate a nota como não autorizada.",
      ],
      ["protocolo/chave devolvidos pela SEFAZ", "XML autorizado"],
      {
        fonte: ["invoices", "fiscal_events"],
        risco: "alto",
        reversibilidade: "parcial",
        limitacao: "Não invente chave: sem retorno oficial, a nota não é conferível.",
      },
    ),

  "fiscal.nota_duplicada_por_pedido": (achado) =>
    plano(
      "Escolher UMA nota viva e cancelar as demais com segurança.",
      [
        "Liste as notas do pedido e o estado de cada uma na SEFAZ.",
        "Mantenha a nota correta e confirme que as outras não foram transmitidas.",
        "Cancele/denegue as duplicadas pela via fiscal, com motivo.",
        "Confira que o pedido ficou com uma única nota ativa.",
      ],
      ["nota a manter", "estado de cada duplicada na SEFAZ", "motivo do cancelamento"],
      {
        fonte: ["invoices", "invoice_orders", "fiscal_events"],
        risco: "alto",
        reversibilidade: "irreversivel",
        limitacao: String(
          achado.evidencia.total_notas
            ? "Cancelamento fiscal é irreversível; a conferência na SEFAZ é obrigatória."
            : "Confira na SEFAZ antes de cancelar.",
        ),
      },
    ),

  "fiscal.divergencia_valor_nota": () =>
    plano(
      "Reconciliar o valor antes de qualquer novo documento.",
      [
        "Compare itens, desconto e frete do pedido com os da nota.",
        "Defina qual dos dois é o valor correto e por quê.",
        "Se a nota estiver errada, cancele e reemita; se o pedido estiver errado, ajuste o pedido.",
      ],
      ["valor correto", "origem da diferença", "decisão de cancelar/reemitir"],
      {
        fonte: ["invoices", "commercial_orders"],
        risco: "alto",
        reversibilidade: "parcial",
      },
    ),

  "fiscal.nota_autorizada_pedido_nao_faturado": () =>
    plano(
      "Alinhar o status do pedido com a nota já autorizada.",
      [
        "Confirme que a nota pertence a este pedido.",
        "Avance o pedido para `faturado` pela tela.",
        "Confira estoque, financeiro e expedição gerados a partir do faturamento.",
      ],
      ["confirmação de vínculo", "quem executa o faturamento"],
      {
        fonte: ["invoices", "commercial_orders", "financial_receivables"],
        risco: "medio",
        reversibilidade: "reversivel",
      },
    ),

  "fiscal.pedido_com_nf_sem_nota": () =>
    plano(
      "Emitir a nota que o pedido já declarou precisar.",
      [
        "Confira cadastro fiscal do destinatário e itens do pedido.",
        "Enfileire a emissão pela tela de notas.",
        "Acompanhe o job até autorização, rejeição ou estado honesto sem emissor.",
      ],
      ["dados fiscais completos", "confirmação de que não há outra nota viva"],
      {
        fonte: ["commercial_orders", "invoices", "fiscal_jobs"],
        risco: "alto",
        reversibilidade: "parcial",
        limitacao: "Se o pedido já teve nota rejeitada, o motivo precisa ser resolvido antes.",
      },
    ),

  "fiscal.job_fiscal_travado": () =>
    plano(
      "Destravar o job sem criar uma segunda emissão.",
      [
        "Leia `ultimo_erro`, tentativas e `proxima_tentativa`.",
        "Verifique se o dreno está ativo e se o certificado/provedor respondem.",
        "Deixe o retry acontecer ou libere o lease; não enfileire nota nova.",
      ],
      ["causa do travamento", "se a transmissão anterior saiu"],
      {
        fonte: ["fiscal_jobs", "fiscal_events", "invoices"],
        risco: "alto",
        reversibilidade: "parcial",
        exigeAprovacao: false,
      },
    ),

  "fiscal.job_retry_excessivo": () =>
    plano(
      "Parar o retry cego e corrigir a causa.",
      [
        "Leia o último erro e classifique: dado fiscal, credencial ou indisponibilidade.",
        "Se for dado/credencial, corrija antes de qualquer novo retry.",
        "Se for indisponibilidade, aguarde o backoff; não force reenvio.",
      ],
      ["classificação do erro", "se houve transmissão parcial"],
      {
        fonte: ["fiscal_jobs", "fiscal_events", "invoices"],
        risco: "alto",
        reversibilidade: "parcial",
        limitacao: "Retry repetido na mesma nota aumenta o risco de duplicidade fiscal.",
      },
    ),

  "fiscal.sincronizacao_falhou": () =>
    plano(
      "Restabelecer a entrada de NF-e e só então reprocessar.",
      [
        "Abra o histórico de sincronização e leia `resultado`, `cstat` e mensagem.",
        "Confira certificado, validade e consumo indevido (656).",
        "Corrija a causa e rode a sincronização manual uma vez.",
        "Confirme que o NSU/cursor avançou sem pular documento.",
      ],
      ["causa (certificado/656/indisponibilidade)", "NSU antes e depois"],
      {
        fonte: ["fiscal_sync_logs", "fiscal_entrada_cursor", "fiscal_entradas"],
        risco: "medio",
        reversibilidade: "reversivel",
        exigeAprovacao: false,
      },
    ),

  // ─── Operação ─────────────────────────────────────────────────────────────
  "operacao.estoque_negativo": () =>
    plano(
      "Contar fisicamente e corrigir com movimento, nunca com UPDATE direto.",
      [
        "Confira o saldo físico do produto e as últimas movimentações.",
        "Identifique a saída/entrada faltante ou duplicada.",
        "Lance o ajuste de inventário com motivo e responsável.",
        "Confirme que o saldo voltou a refletir a contagem.",
      ],
      ["contagem física", "motivo do ajuste", "responsável"],
      {
        fonte: ["catalog_products", "inventory_movements"],
        risco: "medio",
        reversibilidade: "reversivel",
        limitacao: "Alterar o cache sem movimento apaga a trilha do razão.",
      },
    ),

  "operacao.estoque_divergente": () =>
    plano(
      "Tratar a diferença como HIPÓTESE e confirmar com contagem física.",
      [
        "Confira a contagem física e as movimentações do produto.",
        "Verifique se a diferença é saldo inicial anterior ao razão (0242).",
        "Se a contagem confirmar divergência, lance ajuste de inventário com motivo.",
        "Não corrija o saldo por UPDATE direto: o razão precisa registrar o porquê.",
      ],
      ["contagem física", "saldo de abertura conhecido", "motivo do ajuste"],
      {
        fonte: ["catalog_products", "inventory_movements"],
        risco: "medio",
        reversibilidade: "reversivel",
        confianca: "baixa",
        limitacao:
          "O razão não tem saldo de abertura; a diferença pode ser estoque inicial. Confirme antes de ajustar.",
      },
    ),

  "operacao.pedido_total_incoerente": () =>
    plano(
      "Recalcular o pedido a partir dos itens.",
      [
        "Some os itens e confira desconto e frete.",
        "Corrija o item/desconto que divergiu e salve o pedido pela tela.",
        "Confirme que total, financeiro e nota usam o mesmo valor.",
      ],
      ["item/valor divergente", "quem autorizou o desconto"],
      {
        fonte: ["commercial_orders", "commercial_order_items"],
        risco: "medio",
        reversibilidade: "reversivel",
      },
    ),

  "operacao.pedido_preso": () =>
    plano(
      "Decidir o próximo passo do pedido parado.",
      [
        "Confira se o cliente ainda quer o pedido.",
        "Falte follow-up ou avance para aprovação/faturamento.",
        "Se não houver interesse, cancele com motivo.",
      ],
      ["decisão do cliente", "responsável pelo próximo passo"],
      {
        fonte: ["commercial_orders", "crm_lead_activities"],
        risco: "baixo",
        reversibilidade: "reversivel",
        exigeAprovacao: false,
      },
    ),

  "operacao.pedido_sem_cliente": () =>
    plano(
      "Vincular o pedido ao cliente correto.",
      [
        "Identifique o contato pelo nome/documento/telefone do pedido.",
        "Vincule o contato na ficha do pedido.",
        "Confira histórico, financeiro e endereço de entrega.",
      ],
      ["contato correto", "confirmação de documento"],
      {
        fonte: ["commercial_orders", "contacts"],
        risco: "baixo",
        reversibilidade: "reversivel",
      },
    ),

  "operacao.pedido_com_nf_sem_documento": () =>
    plano(
      "Completar o documento do destinatário antes de emitir.",
      [
        "Peça/confirme CPF ou CNPJ do destinatário.",
        "Atualize o cadastro do cliente.",
        "Só então enfileire a nota.",
      ],
      ["documento do destinatário", "tipo de pessoa"],
      {
        fonte: ["commercial_orders", "contacts", "invoices"],
        risco: "baixo",
        reversibilidade: "reversivel",
        limitacao: "Não invente documento fiscal: a nota precisa do dado real.",
      },
    ),

  "operacao.recebivel_sem_origem": () =>
    plano(
      "Vincular ou cancelar o recebível sem origem.",
      [
        "Localize o pedido/nota/cliente que originou o valor.",
        "Vincule o recebível à origem correta.",
        "Se não houver origem, cancele com motivo — não deixe valor órfão.",
      ],
      ["origem do valor", "motivo do cancelamento"],
      {
        fonte: ["financial_receivables", "commercial_orders", "invoices"],
        risco: "alto",
        reversibilidade: "parcial",
      },
    ),

  "operacao.recebivel_duplicado": () =>
    plano(
      "Manter um recebível e cancelar os duplicados.",
      [
        "Confira pagamentos já registrados em cada linha.",
        "Mantenha a linha correta e cancele as demais com motivo.",
        "Confirme que o total a receber do cliente não dobrou.",
      ],
      ["linha correta", "pagamentos já vinculados", "motivo do cancelamento"],
      {
        fonte: ["financial_receivables", "financial_payments"],
        risco: "alto",
        reversibilidade: "parcial",
      },
    ),

  "operacao.recebivel_parcela_invalida": () =>
    plano(
      "Corrigir o plano de parcelas do recebível.",
      [
        "Confira o número de parcelas combinado com o cliente.",
        "Ajuste `parcela_n`/`total_parcelas` pela tela ou cancele e regenere.",
        "Confirme que a soma das parcelas fecha o valor original.",
      ],
      ["plano de parcelas correto", "valor original"],
      {
        fonte: ["financial_receivables", "financial_payments"],
        risco: "alto",
        reversibilidade: "parcial",
      },
    ),

  "operacao.mercos_importacao_travada": () =>
    plano(
      "Encerrar a execução órfã antes de tentar de novo.",
      [
        "Confira se o worker do Mercos ainda está rodando.",
        "Se morreu, marque a execução como erro e libere a próxima.",
        "Rode uma importação manual e confira o resumo.",
      ],
      ["estado do worker", "execução a encerrar"],
      {
        fonte: ["mercos_import_runs"],
        risco: "medio",
        reversibilidade: "reversivel",
        exigeAprovacao: false,
      },
    ),

  "operacao.mercos_importacao_falhou": () =>
    plano(
      "Ler o resumo da falha e reimportar com o de-para corrigido.",
      [
        "Abra o resumo/erros da execução.",
        "Corrija credencial, payload ou de-para apontado.",
        "Reimporte e confira pedidos novos/ignorados.",
      ],
      ["causa da falha", "pedidos que ficaram de fora"],
      {
        fonte: ["mercos_import_runs", "commercial_orders"],
        risco: "medio",
        reversibilidade: "reversivel",
      },
    ),

  "operacao.job_fila_travado": () =>
    plano(
      "Destravar a fila sem duplicar o turno.",
      [
        "Leia `last_error`, tentativas e o horário do lease.",
        "Se o worker morreu, libere o lease/dead-letter pela ferramenta de operação.",
        "Reprocesse uma vez e confirme que o contato não recebeu em dobro.",
      ],
      ["causa", "se o turno anterior saiu", "job a reprocessar"],
      {
        fonte: ["job_queue", "send_ledger", "event_log"],
        risco: "alto",
        reversibilidade: "parcial",
      },
    ),

  "operacao.webhook_falhas": () =>
    plano(
      "Corrigir a causa e só então reprocessar o evento.",
      [
        "Leia o erro e o tipo do evento.",
        "Confirme assinatura, contrato e idempotência do consumidor.",
        "Reprocesse o evento uma vez e confira se o efeito apareceu.",
      ],
      ["causa", "eventos a reprocessar"],
      {
        fonte: ["webhook_events_log", "event_log"],
        risco: "medio",
        reversibilidade: "parcial",
      },
    ),

  "campanha.cidade_invalida": () =>
    plano(
      "Completar cidade/UF antes de ativar a campanha.",
      [
        "Abra a campanha e confira o recorte geográfico.",
        "Preencha cidade e UF válidas (duas letras).",
        "Salve e confirme o público antes de disparar.",
      ],
      ["cidade/UF corretas", "público esperado"],
      {
        fonte: ["prospecting_campaigns", "automatic_sales_campaigns"],
        risco: "baixo",
        reversibilidade: "reversivel",
        exigeAprovacao: false,
      },
    ),

  "campanha.cidade_repetida": () =>
    plano(
      "Deduplicar o recorte antes de gastar cota.",
      [
        "Remova a cidade repetida da campanha.",
        "Confirme quantas cidades únicas restaram.",
      ],
      ["cidade a remover"],
      {
        fonte: ["prospecting_campaigns"],
        risco: "baixo",
        reversibilidade: "reversivel",
        exigeAprovacao: false,
      },
    ),

  "operacao.cliente_duplicado_email": () =>
    plano(
      "Unificar os cadastros preservando histórico e consentimento.",
      [
        "Confira se os cadastros são a mesma pessoa.",
        "Escolha o registro principal e mescle o outro pela ferramenta de clientes.",
        "Confira pedidos, conversas e consentimentos depois da mescla.",
      ],
      ["confirmação de identidade", "registro principal", "consentimento aplicável"],
      {
        fonte: ["contacts", "crm_leads", "commercial_orders"],
        risco: "alto",
        reversibilidade: "irreversivel",
        confianca: "media",
        limitacao: "E-mail normalizado é indício, não prova; confirme antes de mesclar.",
      },
    ),

  "operacao.lead_duplicado": () =>
    plano(
      "Manter um lead aberto por identidade e funil.",
      [
        "Confira se os cards são a mesma pessoa/empresa.",
        "Escolha o card que tem o histórico mais completo.",
        "Feche ou mescle o duplicado, registrando o motivo.",
      ],
      ["confirmação de identidade", "card a manter", "motivo do fechamento"],
      {
        fonte: ["crm_leads", "contacts"],
        risco: "medio",
        reversibilidade: "parcial",
        confianca: "media",
        limitacao:
          "Só é possível comparar leads com contato vinculado; e-mail/telefone normalizados são indício.",
      },
    ),

  "operacao.correcao_sem_reversao": () =>
    plano(
      "Conferir o efeito do job e registrar por que a reversão não vale mais.",
      [
        "Leia o resultado/erro do job e confirme se ele rodou como esperado.",
        "Se o job não deveria ter rodado, registre o impacto no histórico da ocorrência.",
        "Não tente reverter por SQL: a janela honesta passou quando o worker reclamou o job.",
      ],
      ["resultado do job", "impacto observado", "quem confirma"],
      {
        fonte: ["sentinel_occurrences", "sentinel_occurrence_events", "job_queue"],
        risco: "baixo",
        reversibilidade: "irreversivel",
        exigeAprovacao: false,
        limitacao:
          "Reverter agora exigiria mexer em job já reclamado; a máquina não finge desfazer.",
      },
    ),

  "operacao.aprovacao_expirada": () =>
    plano(
      "Revalidar a aprovação antes de executar a correção.",
      [
        "Confira se o job ainda está pendente e atrasado.",
        "Simule a correção de novo para ver o antes/depois atual.",
        "Confirme a execução ou encerre a ocorrência com motivo.",
      ],
      ["estado atual do job", "novo antes/depois", "decisão do gestor"],
      {
        fonte: ["sentinel_occurrences", "sentinel_occurrence_events", "job_queue"],
        risco: "baixo",
        reversibilidade: "reversivel",
        exigeAprovacao: false,
        limitacao:
          "A janela de 5 min é a mesma da RPC; o dry-run não é persistido, então a contagem começa na aprovação.",
      },
    ),
};
