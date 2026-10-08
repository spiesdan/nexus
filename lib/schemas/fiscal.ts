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

export const extrasFiscaisSchema = z.object({
  transporte: transporteSchema.optional(),
  cobranca: cobrancaSchema.optional(),
  adicionais: adicionaisSchema.optional(),
  entrega: entregaSchema.optional(),
});

export type ExtrasFiscais = z.infer<typeof extrasFiscaisSchema>;

/** Os extras já validados, como a nota os guarda (jsonb, 0257). */
export type ExtrasFiscaisGravados = ExtrasFiscais | null | undefined;

export const notaCreateSchema = z.object({
  /** O pedido que origina a nota. Sem pedido, sem nota (avulsa é fase futura). */
  order_id: z.string().uuid(),
  /**
   * Grupos da emissão que não vêm do pedido (0257). Opcionais: sem extras a
   * nota sai com o que o pedido traz, como sempre. Ao escolher extras a
   * pessoa está declarando um fato fiscal — por isso vão NA NOTA e não no
   * pedido: a nota autorizada não se reescreve quando o pedido muda.
   */
  extras: extrasFiscaisSchema.optional(),
});

export type NotaCreate = z.infer<typeof notaCreateSchema>;

export const configFiscalSchema = z.object({
  serie: z.string().trim().min(1).max(10).default("1"),
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
});

export type ConfigFiscal = z.infer<typeof configFiscalSchema>;

/** A config como a tela lê (sem a senha — ela nunca volta do servidor). */
export interface ConfigFiscalSalva {
  serie: string;
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

/** Só pedido faturado vira nota: antes disso é intenção, não fato fiscal. */
export const STATUS_FATURAVEL = ["faturado"] as const;

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
