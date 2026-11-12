import { z } from "zod";

/**
 * O CONTRATO FISCAL — um só, lido pela tela E pela rota.
 */

export const STATUS_DA_NOTA = [
  "pendente",
  "em_emissao",
  "autorizada",
  "denegada",
  "cancelada",
  "erro",
] as const;
export type StatusDaNota = (typeof STATUS_DA_NOTA)[number];

export const ROTULO_DA_NOTA: Record<StatusDaNota, string> = {
  pendente: "Pendente",
  em_emissao: "Emitindo",
  autorizada: "Autorizada",
  denegada: "Denegada",
  cancelada: "Cancelada",
  erro: "Erro",
};

/**
 * EXTRAS DA EMISSÃO (migration 0257) — os grupos da NF-e que o pedido não
 * tem: transporte, cobrança, informações adicionais e local de entrega.
 *
 * Os vocabulários abaixo estão nas fontes, não na minha cabeça:
 * - `MODALIDADES_DE_FRETE` e `FORMAS_DE_PAGAMENTO`: comentários do exemplo
 *   oficial do sped-nfe (`examples/ExampleMake.php`, v5.2.8) e, para o
 *   `tPag`, a NT 2020.006 que ele espelha.
 * - `INF_CPL_MAX`/`INF_FISCO_MAX`/`MAX_DUPLICATAS`: `maxLength`/`maxOccurs`
 *   do leiaute oficial (`schemes/PL_009_V4/leiauteNFe_v4.00.xsd`): infCpl
 *   5000, infAdFisco 2000, `dup` até 120 ocorrências.
 *
 * Sem CHECK no banco (0257): este schema É o vocabulário, validado antes de
 * gravar. Um CHECK espelhado manteria a regra em dois lugares e envelheceria
 * no primeiro campo novo.
 */

export const MODALIDADES_DE_FRETE = ["0", "1", "2", "3", "4", "9"] as const;
export type ModalidadeDeFrete = (typeof MODALIDADES_DE_FRETE)[number];

export const ROTULO_DA_MODALIDADE_DE_FRETE: Record<ModalidadeDeFrete, string> = {
  "0": "CIF — por conta do remetente",
  "1": "FOB — por conta do destinatário",
  "2": "Por conta de terceiros",
  "3": "Transporte próprio — conta do remetente",
  "4": "Transporte próprio — conta do destinatário",
  "9": "Sem operação de frete",
};

export const FORMAS_DE_PAGAMENTO = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "10",
  "11",
  "12",
  "13",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "90",
  "99",
] as const;
export type FormaDePagamento = (typeof FORMAS_DE_PAGAMENTO)[number];

export const ROTULO_DA_FORMA_DE_PAGAMENTO: Record<FormaDePagamento, string> = {
  "01": "Dinheiro",
  "02": "Cheque",
  "03": "Cartão de crédito",
  "04": "Cartão de débito",
  "05": "Crédito na loja",
  "10": "Vale alimentação",
  "11": "Vale refeição",
  "12": "Vale presente",
  "13": "Vale combustível",
  "15": "Boleto bancário",
  "16": "Depósito bancário",
  "17": "Pagamento instantâneo (PIX)",
  "18": "Transferência bancária / carteira digital",
  "19": "Programa de fidelidade / cashback / crédito virtual",
  "20": "PIX estático",
  "21": "Crédito em loja",
  "22": "Pagamento eletrônico não informado",
  "90": "Sem pagamento",
  "99": "Outros",
};

/** infCpl — maxLength do XSD do leiaute 4.00. */
export const INF_CPL_MAX = 5000;
/** infAdFisco — maxLength do XSD do leiaute 4.00. */
export const INF_FISCO_MAX = 2000;
/** `dup` — maxOccurs do XSD do leiaute 4.00. */
export const MAX_DUPLICATAS = 120;

const transportadorSchema = z.object({
  /** xNome, 2..60 (TTransporta). */
  nome: z.string().trim().min(2, "Nome do transportador curto demais").max(60),
  /** CPF (11) ou CNPJ (14) — só dígitos. */
  documento: z
    .string()
    .trim()
    .regex(/^\d{11}$|^\d{14}$/, "Documento do transportador: CPF com 11 ou CNPJ com 14 dígitos"),
  /** IE do transportador — opcional no leiaute. */
  ie: z.string().trim().max(20).optional(),
  /** xEnder, 1..60. */
  endereco: z.string().trim().max(60).optional(),
  municipio: z.string().trim().max(60).optional(),
  uf: z.string().trim().length(2, "UF com 2 letras").toUpperCase().optional(),
});

const volumesSchema = z.object({
  /** qVol — quantos volumes/transporte. */
  quantidade: z.number().int().min(1, "Ao menos 1 volume").max(999999),
  /** esp, 1..60 (ex.: CAIXAS). */
  especie: z.string().trim().min(1).max(60).optional(),
  marca: z.string().trim().max(60).optional(),
  numeracao: z.string().trim().max(60).optional(),
  /** pesoL, em kg. */
  peso_liquido_kg: z.number().min(0).max(999999).optional(),
  /** pesoB, em kg. */
  peso_bruto_kg: z.number().min(0).max(999999).optional(),
});

const transporteSchema = z.object({
  /**
   * modFrete, obrigatório mesmo sem transportador — é ele que diz se o frete
   * está cobrado (e entra no vNF) ou não. Default `9` = sem operação.
   */
  modalidade_frete: z.enum(MODALIDADES_DE_FRETE).default("9"),
  transportador: transportadorSchema.optional(),
  volumes: volumesSchema.optional(),
});

const cobrancaSchema = z
  .object({
    /** tPag — como a nota é paga. `99` exige `descricao` (xPag). */
    forma_pagamento: z.enum(FORMAS_DE_PAGAMENTO),
    /** xPag: obrigatório quando `forma_pagamento` é `99`. */
    descricao: z.string().trim().min(2, "Descrição da forma de pagamento").max(60).optional(),
    /**
     * Quantas duplicatas (tag `dup`). 1 = à vista. Acima de 1 vira cobrança
     * a prazo: cada parcela vira uma `dup` e o `indPag` do pagamento é 1.
     */
    parcelas: z.number().int().min(1).max(MAX_DUPLICATAS),
    /** 1º vencimento (AAAA-MM-DD). Obrigatório quando `parcelas > 1`. */
    primeiro_vencimento: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Vencimento no formato AAAA-MM-DD")
      .optional(),
    /** Dias entre um vencimento e o próximo. */
    dias_entre: z.number().int().min(0).max(365),
  })
  .superRefine((v, ctx) => {
    if (v.parcelas > 1 && !v.primeiro_vencimento) {
      ctx.addIssue({
        code: "custom",
        path: ["primeiro_vencimento"],
        message: "Com mais de 1 parcela, informe o primeiro vencimento",
      });
    }
    if (v.forma_pagamento === "99" && !v.descricao) {
      ctx.addIssue({
        code: "custom",
        path: ["descricao"],
        message: 'Com "Outros" (99), descreva a forma de pagamento',
      });
    }
  });

const adicionaisSchema = z.object({
  /** infCpl — informação complementar de interesse do contribuinte. */
  informacoes_complementares: z.string().trim().max(INF_CPL_MAX).optional(),
  /** infAdFisco — de interesse do Fisco. */
  informacoes_fisco: z.string().trim().max(INF_FISCO_MAX).optional(),
});

const entregaSchema = z.object({
  /** xLgr, 2..60 (TLocal). */
  logradouro: z.string().trim().min(2, "Logradouro curto demais").max(60),
  /** nro, 1..60. */
  numero: z.string().trim().min(1, "Número do endereço").max(60),
  /** xCpl, 1..60. */
  complemento: z.string().trim().max(60).optional(),
  /** xBairro, 2..60. */
  bairro: z.string().trim().min(2, "Bairro curto demais").max(60),
  /** xMun, 2..60. */
  municipio: z.string().trim().min(2, "Município curto demais").max(60),
  /** cMun — código IBGE de 7 dígitos (TLocal exige). */
  codigo_municipio: z
    .string()
    .trim()
    .regex(/^\d{7}$/, "Código IBGE tem 7 dígitos"),
  uf: z.string().trim().length(2, "UF com 2 letras").toUpperCase(),
  /** CEP de 8 dígitos, sem hífen. */
  cep: z
    .string()
    .trim()
    .regex(/^\d{8}$/, "CEP com 8 dígitos")
    .optional(),
});

/**
 * O DESTINATÁRIO AJUSTADO NA NOTA — o que a tela de correção grava.
 *
 * A nota lê o destinatário do cadastro (`contacts`), e é isso que mantém um
 * cliente, um endereço. Mas quando o cadastro está errado e a SEFAZ recusa a
 * nota (232 = IE não informada, 726 = endereço ausente), a correção precisa
 * valer para ESTA nota **agora** — e não depois de a pessoa achar a ficha do
 * cliente noutra tela. Por isso o ajuste mora na nota (jsonb) e o drain o
 * aplica por cima do cadastro. A tela oferece, em paralelo, gravar o mesmo
 * ajuste no cadastro (`aplicar_no_cadastro`), que é o que faz a próxima nota
 * já sair certa.
 *
 * Os limites são os do XML (TLocal/xNome), não os do banco `text` — aceitar
 * 200 caracteres aqui só empurraria a recusa para a SEFAZ.
 */
const destinatarioAjusteSchema = z.object({
  /** xNome, 2..60. */
  nome: z.string().trim().min(2, "Nome curto demais").max(60).optional(),
  /** CPF (11) ou CNPJ (14) — só dígitos, como o XML leva. */
  documento: z
    .string()
    .trim()
    .regex(/^\d{11}$|^\d{14}$/, "Documento: CPF com 11 ou CNPJ com 14 dígitos")
    .optional(),
  /**
   * IE do destinatário. "ISENTO" é aceito (vira `indIEDest` 2); vazio limpa a
   * IE e leva o destinatário para não contribuinte (9).
   */
  ie: z.string().trim().max(20).optional(),
  logradouro: z.string().trim().min(2, "Logradouro curto demais").max(60).optional(),
  numero: z.string().trim().min(1, "Informe o número").max(60).optional(),
  complemento: z.string().trim().max(60).optional(),
  bairro: z.string().trim().min(2, "Bairro curto demais").max(60).optional(),
  cidade: z.string().trim().min(2, "Município curto demais").max(60).optional(),
  uf: z.string().trim().length(2, "UF com 2 letras").toUpperCase().optional(),
  /** CEP de 8 dígitos, sem hífen (o formulário tira a máscara). */
  cep: z.string().trim().regex(/^\d{8}$/, "CEP com 8 dígitos").optional(),
});

export type AjusteDoDestinatario = z.infer<typeof destinatarioAjusteSchema>;

/**
 * O ITEM AJUSTADO NA NOTA — NCM, CFOP, unidade e descrição.
 *
 * O drain monta os itens do pedido (`commercial_order_items`) + do cadastro do
 * produto (`catalog_products`). Só que o cadastro do produto é editável apenas
 * por manager, e a pessoa que emite a nota — que é quem vê a rejeição — pode
 * ser agent. Sem esta camada, "corrigir o NCM" viraria "pedir para alguém
 * mudar o catálogo", e a nota continuaria parada.
 *
 * O ajuste é POR NOTA e por item do pedido (`order_item_id`): o documento
 * fiscal carrega a classificação daquela venda, e o catálogo continua sendo a
 * verdade para as próximas.
 */
const itemAjusteSchema = z.object({
  order_item_id: z.string().uuid(),
  /** xProd, 1..120. */
  descricao: z.string().trim().min(1, "Informe a descrição").max(120).optional(),
  /** NCM: 8 dígitos. */
  ncm: z
    .string()
    .trim()
    .regex(/^\d{8}$/, "NCM tem 8 dígitos")
    .optional(),
  /** CFOP: 4 dígitos. */
  cfop: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "CFOP tem 4 dígitos")
    .optional(),
  /** uCom/uTrib, 1..6. */
  unidade: z.string().trim().min(1, "Informe a unidade").max(6).optional(),
});

export type AjusteDoItem = z.infer<typeof itemAjusteSchema>;

/**
 * O ITEM da venda avulsa — o que o operador informou no balcão. Mesmo vocabulário
 * fiscal do item do pedido (`itemAjusteSchema`), sem o vínculo com
 * `commercial_order_items`: na avulsa a nota é a própria verdade do fato.
 */
const itemAvulsaSchema = z.object({
  /** Vínculo com o catálogo quando o item nasceu de um produto cadastrado. */
  product_id: z.string().uuid().nullable().optional(),
  /** Código do produto — atalho de resolução de NCM/CFOP/unidade no catálogo. */
  codigo: z.string().trim().min(1, "Código do produto").max(60).optional(),
  /** Descrição do item (xProd). */
  descricao: z.string().trim().min(1, "Informe a descrição").max(120).optional(),
  /** NCM: 8 dígitos. */
  ncm: z.string().trim().regex(/^\d{8}$/, "NCM tem 8 dígitos").optional(),
  /** CFOP: 4 dígitos. */
  cfop: z.string().trim().regex(/^\d{4}$/, "CFOP tem 4 dígitos").optional(),
  /** uCom/uTrib, 1..6. */
  unidade: z.string().trim().min(1, "Informe a unidade").max(6).optional(),
  quantidade: z.number().int().min(1, "quantidade precisa ser ao menos 1").max(999999),
  preco_cents: z.number().int().min(0, "preço não pode ser negativo").max(2_000_000_000),
  desconto_pct: z.number().min(0).max(100).default(0),
});

/** Um item da venda avulsa, pronto para a NF-e. */
export type ItemAvulsa = z.infer<typeof itemAvulsaSchema>;

/**
 * A venda avulsa — NF-e sem pedido. `itens` é o fato; `frete_cents` entra no
 * vNF; o destinatário pode vir do cadastro (`contato_id`) ou do que foi
 * informado na própria venda.
 */
export const avulsaSchema = z
  .object({
    /** Contato do cadastro quando o cliente já existe no CRM (opcional). */
    contato_id: z.string().uuid().nullable().optional(),
    /** Nome do destinatário na venda (xNome) — obrigatório sem contato cadastrado. */
    cliente_nome: z.string().trim().min(2, "Nome curto demais").max(60).optional(),
    /** CPF (11) ou CNPJ (14) — só dígitos, como o XML leva. */
    cliente_documento: z
      .string()
      .trim()
      .regex(/^\d{11}$|^\d{14}$/, "Documento: CPF com 11 ou CNPJ com 14 dígitos")
      .optional(),
    /** Frete em centavos — entra no vNF. */
    frete_cents: z.number().int().min(0).default(0),
    /** Itens vendidos no balcão. */
    itens: z.array(itemAvulsaSchema).min(1, "A venda avulsa precisa de ao menos 1 item").max(50),
  })
  .superRefine((v, ctx) => {
    if (!v.contato_id && !v.cliente_nome) {
      ctx.addIssue({
        code: "custom",
        path: ["cliente_nome"],
        message: "Informe o nome do cliente (ou escolha o contato cadastrado).",
      });
    }
  });

/** A venda avulsa, como a nota a guarda e a tela a envia. */
export type AvulsaNota = z.infer<typeof avulsaSchema>;

export const extrasFiscaisSchema = z.object({
  transporte: transporteSchema.optional(),
  cobranca: cobrancaSchema.optional(),
  adicionais: adicionaisSchema.optional(),
  entrega: entregaSchema.optional(),
  /** Correções feitas NA NOTA depois de uma rejeição (ver `ajusteDaNotaSchema`). */
  destinatario: destinatarioAjusteSchema.optional(),
  itens: z.array(itemAjusteSchema).max(500).optional(),
  /**
   * NF-e AVULSA (venda sem pedido): o fato da venda em si, que não vem de um
   * `commercial_orders`. Enquanto o campo está ausente a emissão é sempre de
   * pedido (concluído/faturado/expedido/entregue); com ele presente, a nota nasce sem
   * pedido — a venda avulsa/balcão.
   */
  avulsa: avulsaSchema.optional(),
});

/**
 * O corpo do PATCH da tela de correção.
 *
 * `aplicar_no_cadastro` existe porque as duas coisas são verdade ao mesmo
 * tempo: a nota precisa sair hoje, e o cadastro precisa parar de gerar nota
 * errada amanhã. Default `true` — quem corrige a IE de um cliente está
 * corrigindo o cadastro dele, não inventando um fato só para esta nota.
 */
export const ajusteDaNotaSchema = z
  .object({
    destinatario: destinatarioAjusteSchema.optional(),
    itens: z.array(itemAjusteSchema).max(500).optional(),
    adicionais: adicionaisSchema.optional(),
    aplicar_no_cadastro: z.boolean().default(true),
    /** Salva e devolve a nota para a fila na mesma ação (o botão "Salvar e reenviar"). */
    reenviar: z.boolean().default(false),
  })
  .refine(
    (v) =>
      v.destinatario !== undefined ||
      (v.itens?.length ?? 0) > 0 ||
      v.adicionais !== undefined,
    { message: "Nada para corrigir.", path: ["destinatario"] },
  );

export type AjusteDaNota = z.infer<typeof ajusteDaNotaSchema>;

export type ExtrasFiscais = z.infer<typeof extrasFiscaisSchema>;

/** Os extras já validados, como a nota os guarda (jsonb, 0257). */
export type ExtrasFiscaisGravados = ExtrasFiscais | null | undefined;

export const notaCreateSchema = z.object({
  /**
   * O pedido que origina a nota (agora opcional: venda avulsa/balcão). Sem
   * pedido, sem nota — salvo a venda avulsa, que vai em `extras.avulsa`.
   *
   * Opcional quando `order_ids` vem preenchido: o primeiro pedido continua
   * sendo o `order_id` da nota (compatibilidade com tudo que lê uma nota por
   * pedido), e os demais entram em `invoice_orders`.
   */
  order_id: z.string().uuid().optional(),
  /**
   * AGRUPAMENTO — vários pedidos do MESMO cliente numa NF-e só.
   *
   * Cliente que tirou 3 pedidos no mês quer 1 nota, não 3. A NF-e aceita
   * vários itens por documento; o que ela NÃO aceita é um destinatário
   * diferente por item, e por isso a emissão recusa pedidos de clientes
   * distintos (a regra mora em `emitirNota`, não aqui).
   */
  order_ids: z.array(z.string().uuid()).min(1).max(50).optional(),
  /**
   * Grupos da emissão que não vêm do pedido (0257). Opcionais: sem extras a
   * nota sai com o que o pedido traz, como sempre. Ao escolher extras a
   * pessoa está declarando um fato fiscal — por isso vão NA NOTA e não no
   * pedido: a nota autorizada não se reescreve quando o pedido muda.
   */
  extras: extrasFiscaisSchema.optional(),
})
  // Tudo o que dá para emitir: o pedido único, a lista do agrupamento (o
  // primeiro continua sendo o `order_id` da nota) — ou a venda avulsa, que não
  // nasce de pedido nenhum. A recusa aqui nomeia o campo em vez de deixar a
  // emissão falhar com "pedido não encontrado" no meio.
  .refine(
    (v) => v.order_id != null || (v.order_ids?.length ?? 0) > 0 || v.extras?.avulsa != null,
    {
      message:
        "Informe o pedido (order_id) ou os pedidos agrupados (order_ids), ou a venda avulsa (extras.avulsa).",
      path: ["order_id"],
    },
  );

export type NotaCreate = z.infer<typeof notaCreateSchema>;

/** O pedido principal da nota: `order_ids` quando veio agrupada. */
export function pedidoPrincipalDaNota(entrada: NotaCreate): string | null {
  return entrada.order_ids?.[0] ?? entrada.order_id ?? null;
}

export const configFiscalSchema = z.object({
  serie: z.string().trim().min(1).max(10).default("1"),
  /**
   * Próximo número de NF-e a reservar (0291). Nulo = não configurado, e a
   * emissão recusa nomeando o campo — adivinhar aqui queima faixa fiscal.
   * Quem migra de outro sistema informa o último número emitido + 1.
   */
  proximo_numero: z.number().int().min(1).max(999999999).nullable().optional(),
  natureza_operacao: z.string().trim().min(2).max(120).default("Venda de mercadoria"),
  cfop_padrao: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "CFOP tem 4 dígitos")
    .default("5102"),
  emitente_documento: z.string().trim().max(25).nullable().optional(),
  ie: z.string().trim().max(20).nullable().optional(),
  crt: z.enum(["1", "2", "3"]).default("1"),
  logradouro: z.string().trim().max(200).nullable().optional(),
  numero_end: z.string().trim().max(20).nullable().optional(),
  bairro: z.string().trim().max(100).nullable().optional(),
  municipio: z.string().trim().max(100).nullable().optional(),
  codigo_municipio: z
    .string()
    .trim()
    .regex(/^\d{7}$/, "IBGE tem 7 dígitos")
    .nullable()
    .optional(),
  uf: z.string().trim().length(2).toUpperCase().nullable().optional(),
  cep: z.string().trim().max(10).nullable().optional(),
  ambiente: z.enum(["homologacao", "producao"]).default("homologacao"),
  provedor: z.enum(["stub", "spednfe"]).default("stub"),
  certificado_path: z.string().trim().max(300).nullable().optional(),
  /**
   * Senha do .pfx em PLAINTEXT no request — a rota cifra antes de gravar e
   * nunca a devolve. String vazia = mantém a atual; null = não mexe.
   */
  certificado_senha: z.string().max(200).nullable().optional(),
  // ── Entrada (0290) ──────────────────────────────────────────────────────
  /**
   * Liga a sincronização automática de NF-e de entrada. Ausente = mantém o
   * que está gravado (o PUT da tela de emissão não manda este campo, e um
   * default aqui desligaria a entrada toda vez que alguém salvasse a série).
   */
  entrada_ativa: z.boolean().optional(),
  /** Intervalo mínimo entre sincronizações automáticas, em minutos. */
  frequencia_minutos: z.number().int().min(1).max(1440).optional(),
  /**
   * Manifestar sozinho é proibido pela spec 21 §12. O campo existe para o
   * operador LIGAR conscientemente; o default do banco é falso.
   */
  manifestacao_automatica: z.boolean().optional(),
});

export type ConfigFiscal = z.infer<typeof configFiscalSchema>;

/** A config como a tela lê (sem a senha — ela nunca volta do servidor). */
export interface ConfigFiscalSalva {
  serie: string;
  /** Próximo número de NF-e a reservar (0291); nulo = não configurado. */
  proximo_numero?: number | null;
  natureza_operacao: string;
  cfop_padrao: string;
  emitente_documento: string | null;
  ie: string | null;
  crt: string;
  logradouro: string | null;
  numero_end: string | null;
  bairro: string | null;
  municipio: string | null;
  codigo_municipio: string | null;
  uf: string | null;
  cep: string | null;
  ambiente: string;
  provedor: string;
  certificado_path: string | null;
  /**
   * O arquivo do certificado EXISTE no servidor.
   *
   * Não confundir com `certificado_path`: aquele é um texto, este é a verdade.
   * A instalação ficou com `certificado_path` gravado e nenhum `.pfx` na
   * máquina, e a tela mostrava "certificado configurado" — porque a tela só
   * lia o texto. Quem responde isto é o servidor, com um `stat`.
   */
  certificado_presente?: boolean;
  // ── Entrada (0290) ──────────────────────────────────────────────────────
  entrada_ativa?: boolean;
  frequencia_minutos?: number;
  manifestacao_automatica?: boolean;
  ultima_sincronizacao?: string | null;
  ultimo_cstat?: string | null;
  ultimo_motivo?: string | null;
}

export interface NotaFiscal {
  id: string;
  order_id: string | null;
  serie: string;
  numero: number | null;
  chave_acesso: string | null;
  protocolo: string | null;
  sefaz_cstat: string | null;
  sefaz_xmotivo: string | null;
  status: StatusDaNota;
  provedor: string;
  erro: string | null;
  total_cents: number;
  created_at: string;
}

export const COLUNAS_DA_NOTA =
  "id, order_id, serie, numero, chave_acesso, protocolo, sefaz_cstat, sefaz_xmotivo, " +
  "status, provedor, erro, total_cents, created_at";

/**
 * Os status do pedido que já são fato comercial e podem virar nota.
 *
 * `faturado` é o caminho normal. `expedido` e `entregue` entraram em 2026-11-03
 * porque a mercadoria sai antes da nota em parte da rotina: a expedição leva o
 * pedido para `expedido` ao embarcar e para `entregue` quando a rota termina —
 * e sem eles quem emite a NF-e depois da saída ficava travado num pedido que já
 * existe de verdade. Antes disso (`rascunho`, `em_analise`, `aprovado`) ainda é
 * intenção, não fato fiscal.
 *
 * `concluido` entrou em 2026-11-12 e é o caso mais comum da operação: a
 * migration 0302 separou "venda fechada no ERP sem nota" (`concluido`) de
 * "nota já emitida no ERP" (`faturado`) — e a lista ficou sem o status novo,
 * embora ele seja EXATAMENTE o pedido que espera a nossa NF-e. Medido no
 * pedido 19538: concluído no Mercos, sem nota, e a emissão recusava dizendo
 * "só faturado, expedido ou entregue vira nota". O Mercos não escreve
 * `faturado` em venda fechada; ele escreve `concluido`. Sem esta linha, todo
 * pedido vindo do ERP precisava de um avanço manual de status — que mente
 * (diz que já tem nota) para liberar a emissão.
 */
export const STATUS_FATURAVEL = ["concluido", "faturado", "expedido", "entregue"] as const;

/** Uma pergunta só, usada pela emissão, pela pré-validação e pelo assistente. */
export function statusFaturavel(status: string): boolean {
  return (STATUS_FATURAVEL as readonly string[]).includes(status);
}

export function identificacaoDaNota(serie: string, numero: number | null): string {
  return numero === null ? `Série ${serie} · sem número (pendente)` : `${numero}/${serie}`;
}

/**
 * CC-E — a SEFAZ só aceita texto de 15 a 1000 caracteres, e no máximo 20
 * cartas por nota (a sequência é a ordem de chegada). A rota conta antes
 * de gravar; aqui vai só o formato.
 */
export const cartaCorrecaoSchema = z.object({
  correcao: z
    .string()
    .trim()
    .min(15, "Correção curta demais (mínimo 15 caracteres)")
    .max(1000, "Correção longa demais (máximo 1000 caracteres)"),
});

export type CartaCorrecao = z.infer<typeof cartaCorrecaoSchema>;

export const MAX_CARTAS_POR_NOTA = 20;

/**
 * A mensagem da carta na timeline: `[n/20] texto`, e quando a SEFAZ recusa vai
 * `\n[Motivo] ...` no fim. O retransmitir separa os dois — a correção enviada
 * não pode mudar, senão a sequência da SEFAZ sai do lugar. Mora aqui (contrato)
 * porque a tela e a rota leem o mesmo formato.
 */
const MARCA_MOTIVO = "\n[Motivo] ";

export function montarMensagemCarta(
  sequencia: number,
  correcao: string,
  motivo?: string | null,
): string {
  const base = `[${sequencia}/${MAX_CARTAS_POR_NOTA}] ${correcao}`;
  const texto = motivo?.trim() ? motivo.trim() : null;
  return texto ? `${base}${MARCA_MOTIVO}${texto}` : base;
}

export interface CartaLida {
  sequencia: number;
  correcao: string;
  motivo: string | null;
}

export function lerMensagemCarta(mensagem: string): CartaLida | null {
  const m = /^\[(\d+)\/\d+\]\s([\s\S]*)$/.exec(mensagem ?? "");
  if (!m) return null;
  const sequencia = Number(m[1] ?? "");
  const corpo = m[2] ?? "";
  const fimDoTexto = corpo.indexOf(MARCA_MOTIVO);
  const correcao = fimDoTexto >= 0 ? corpo.slice(0, fimDoTexto) : corpo;
  const motivo =
    fimDoTexto >= 0 ? corpo.slice(fimDoTexto + MARCA_MOTIVO.length).trim() || null : null;
  if (!Number.isInteger(sequencia) || sequencia < 1) return null;
  return { sequencia, correcao: correcao.trim(), motivo };
}

/**
 * INUTILIZAÇÃO — faixa de numeração que nunca virou nota, por série, com
 * motivo de 15 a 255 caracteres (mesma régua da SEFAZ para o motivo).
 */
export const inutilizacaoSchema = z
  .object({
    serie: z.string().trim().min(1).max(10),
    numero_inicial: z.number().int().positive(),
    numero_final: z.number().int().positive(),
    motivo: z
      .string()
      .trim()
      .min(15, "Motivo curto demais (mínimo 15 caracteres)")
      .max(255, "Motivo longo demais (máximo 255 caracteres)"),
    // Ano e modelo vão junto do inutNFe (se faltar, o sped-nfe completa: ano =
    // ano atual, modelo = 55). Valem na transmissão imediata do POST; a
    // REtransmissão não os reenvia porque `fiscal_inutilizacoes` ainda não tem
    // coluna para eles (pendência: migration 0253 + regenerar database.types.ts).
    ano: z
      .string()
      .trim()
      .regex(/^\d{2}$/, "Ano com 2 dígitos (ex.: 26)")
      .optional(),
    modelo: z.enum(["55", "65"]).optional(),
  })
  .refine((v) => v.numero_final >= v.numero_inicial, {
    message: "Número final menor que o inicial",
    path: ["numero_final"],
  });

export type Inutilizacao = z.infer<typeof inutilizacaoSchema>;

/** CFOP EQUIVALENTE — de/para de 4 dígitos, nunca iguais. */
export const cfopEquivalenteSchema = z
  .object({
    cfop_origem: z
      .string()
      .trim()
      .regex(/^\d{4}$/, "CFOP tem 4 dígitos"),
    cfop_destino: z
      .string()
      .trim()
      .regex(/^\d{4}$/, "CFOP tem 4 dígitos"),
  })
  .refine((v) => v.cfop_destino !== v.cfop_origem, {
    message: "Destino igual à origem",
    path: ["cfop_destino"],
  });

export type CfopEquivalente = z.infer<typeof cfopEquivalenteSchema>;

export interface InutilizacaoSalva {
  id: string;
  serie: string;
  numero_inicial: number;
  numero_final: number;
  motivo: string;
  ambiente: string;
  status: string;
  sefaz_protocolo: string | null;
  sefaz_xmotivo: string | null;
  created_at: string;
}

export interface CfopEquivalenteSalvo {
  id: string;
  cfop_origem: string;
  cfop_destino: string;
  created_at: string;
}

/**
 * Uma carta de correção como a lista mostra: o evento (`fiscal_events` com
 * `tipo = carta_correcao`) junto da nota que ela corrige. O texto e a
 * sequência saem da `mensagem` (`[n/20] texto`), lida com `lerMensagemCarta`.
 */
export interface CartaDeCorrecao {
  id: string;
  invoice_id: string;
  serie: string;
  numero: number | null;
  status: string | null;
  protocolo: string | null;
  mensagem: string | null;
  created_at: string;
}
