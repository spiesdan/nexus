/**
 * O DESTINATÁRIO DA NF-e — do cadastro do cliente, não digitado à mão.
 *
 * Medido antes de escrever isto: o formulário de emissão pedia o endereço
 * inteiro do destinatário em "Dados adicionais", e a nota só levava do pedido
 * `cliente_nome` e `cliente_documento` — duas fotos do dia da importação.
 * Cliente com endereço no cadastro era obrigado a redigitar; cliente renomeado
 * saía com o nome velho; e o `cMun` (IBGE) não existia em lugar nenhum, o que
 * era a razão real do formulário manual (o sidecar documenta isso).
 *
 * O que este módulo resolve, na mesma precedência que o romaneio já usa:
 * 1. nome — `display_name`/`name` do contato; o do pedido só como reserva;
 * 2. documento — CNPJ do contato; o do pedido só como reserva;
 * 3. local de entrega (TLocal) — colunas estruturadas do contato + o código
 *    IBGE resolvido por cidade/UF (`municipioIbge`).
 *
 * O que NÃO faz: inventar. Campo que o cadastro não tem volta em `faltando`,
 * e quem chama decide entre recusar com o nome do campo ou deixar o operador
 * completar na tela.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AjusteDoDestinatario, ExtrasFiscais } from "@/lib/schemas/fiscal";

import { documentoDoCadastro } from "@/lib/contacts/documento-do-cadastro";

import { municipioIbge } from "./municipio-ibge";

export type LocalDeEntrega = NonNullable<ExtrasFiscais["entrega"]>;

export interface PedidoParaDestinatario {
  cliente_nome?: string | null;
  cliente_documento?: string | null;
  contact_id?: string | null;
}

export interface ContatoFiscal {
  id: string;
  name?: string | null;
  display_name?: string | null;
  cnpj?: string | null;
  tipo_pessoa?: string | null;
  /** Onde o Mercos deixa o CPF de quem não tem CNPJ (`mercos.documento`). */
  source_metadata?: unknown;
  /** Inscrição Estadual do cliente — é ela que decide o `indIEDest`. */
  ie?: string | null;
  logradouro?: string | null;
  numero_end?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}

/** `indIEDest` do leiaute: 1 contribuinte (com IE), 2 isento, 9 não contribuinte. */
export type IndicadorIe = "1" | "2" | "9";

export interface DestinatarioDaNota {
  nome: string;
  documento: string | null;
  /** IE normalizada para o `TIe` da NF-e (2..14 alfanuméricos), quando houver. */
  ie: string | null;
  indicador_ie: IndicadorIe;
  /** null quando o cadastro não fecha o TLocal; ver `faltando`. */
  entrega: LocalDeEntrega | null;
  /**
   * O que impede o TLocal, em português direto: campo que falta ou que passa
   * do limite da NF-e. Vazio = completo.
   */
  faltando: string[];
}

const COLUNAS_DO_CONTATO =
  "id, name, display_name, cnpj, tipo_pessoa, source_metadata, ie, logradouro, numero_end, " +
  "complemento, bairro, cidade, uf, cep";

/** Exportado para a tela de correção ler o cadastro cru (sem o resolvedor). */
export const COLUNAS_DO_CONTATO_FISCAL = COLUNAS_DO_CONTATO;

function texto(v: string | null | undefined): string {
  return (v ?? "").trim().replace(/\s+/g, " ");
}

/**
 * O AJUSTE DA NOTA SOBRE O CADASTRO — campo a campo, sem apagar o resto.
 *
 * A correção é cirúrgica de propósito: quem preenche a IE do cliente na hora
 * de desentupir uma nota não está reescrevendo o cadastro inteiro, e um
 * `update` com os campos vazios apagaria endereço que ninguém pediu para
 * apagar. Só o que veio no ajuste muda.
 */
export function aplicarAjusteNoContato(
  contato: ContatoFiscal | null | undefined,
  ajuste: AjusteDoDestinatario | null | undefined,
): ContatoFiscal | null {
  if (!contato && !ajuste) return null;
  const base: ContatoFiscal = { id: contato?.id ?? "" };
  if (contato) Object.assign(base, contato);
  if (!ajuste) return base;
  // `nome` do ajuste vai para `display_name`: é o campo que o resolvedor lê
  // primeiro (`display_name` → `name` → pedido), então é o único que de fato
  // muda o `<xNome>` sem renomear o cliente no CRM (`name` é o nome da ficha).
  if (ajuste.nome !== undefined) base.display_name = ajuste.nome;
  if (ajuste.documento !== undefined) base.cnpj = ajuste.documento;
  if (ajuste.ie !== undefined) base.ie = ajuste.ie;
  if (ajuste.logradouro !== undefined) base.logradouro = ajuste.logradouro;
  if (ajuste.numero !== undefined) base.numero_end = ajuste.numero;
  if (ajuste.complemento !== undefined) base.complemento = ajuste.complemento;
  if (ajuste.bairro !== undefined) base.bairro = ajuste.bairro;
  if (ajuste.cidade !== undefined) base.cidade = ajuste.cidade;
  if (ajuste.uf !== undefined) base.uf = ajuste.uf;
  if (ajuste.cep !== undefined) base.cep = ajuste.cep;
  return base;
}

/** O ajuste mexe no endereço? Só então o snapshot de `entrega` da nota é refeito. */
export function ajusteMexeNoEndereco(
  ajuste: AjusteDoDestinatario | null | undefined,
): boolean {
  if (!ajuste) return false;
  return (
    ajuste.logradouro !== undefined ||
    ajuste.numero !== undefined ||
    ajuste.complemento !== undefined ||
    ajuste.bairro !== undefined ||
    ajuste.cidade !== undefined ||
    ajuste.uf !== undefined ||
    ajuste.cep !== undefined
  );
}

/** CNPJ ou CPF: só dígitos, e só os tamanhos que a SEFAZ aceita. */
export function documentoFiscal(valor: string | null | undefined): string | null {
  const digitos = (valor ?? "").replace(/\D/g, "");
  return digitos.length === 14 || digitos.length === 11 ? digitos : null;
}

/**
 * O `indIEDest` NÃO é escolha da tela: é o leiaute que define.
 *
 * - IE de verdade → 1 (contribuinte ICMS), e a IE vai em `<IE>`;
 * - "ISENTO" → 2 (contribuinte isento), sem `<IE>`;
 * - sem IE → 9 (não contribuinte), sem `<IE>`.
 *
 * O sidecar gravava 9 fixo, então cliente contribuinte com IE no cadastro saía
 * classificado como não contribuinte — dado fiscal errado, não cosmético.
 */
export function indicadorIe(valor: string | null | undefined): {
  ie: string | null;
  indicador: IndicadorIe;
} {
  const bruto = texto(valor).toUpperCase();
  if (!bruto) return { ie: null, indicador: "9" };
  if (bruto.startsWith("ISENT")) return { ie: null, indicador: "2" };
  // O `TIe` do XSD aceita de 2 a 14 alfanuméricos; o cadastro traz máscara
  // ("90176799-85"), que o leiaute não aceita.
  const limpo = bruto.replace(/[^0-9A-Z]/g, "");
  if (limpo.length < 2 || limpo.length > 14) return { ie: null, indicador: "9" };
  return { ie: limpo, indicador: "1" };
}

export function montarDestinatario(
  pedido: PedidoParaDestinatario,
  contato: ContatoFiscal | null | undefined,
  ajuste?: AjusteDoDestinatario | null,
): DestinatarioDaNota {
  const c = aplicarAjusteNoContato(contato, ajuste);
  const nome = texto(c?.display_name) || texto(c?.name) || texto(pedido.cliente_nome);
  // O documento vem do cadastro inteiro, não só da coluna `cnpj`: o
  // importador do Mercos deixa o CPF em `source_metadata.mercos.documento` e
  // deixa `cnpj` NULL (907 contatos nesta instalação). Sem esta leitura, a nota
  // pedia CPF a um cliente que tem CPF — o pedido 19341 é o caso.
  const documento =
    documentoDoCadastro(c)?.digitos ?? documentoFiscal(pedido.cliente_documento);
  const { ie, indicador: indicador_ie } = indicadorIe(c?.ie);

  const faltando: string[] = [];
  const logradouro = texto(c?.logradouro);
  const numero = texto(c?.numero_end);
  const bairro = texto(c?.bairro);
  const ufBruto = texto(c?.uf).toUpperCase();
  const municipio = municipioIbge(c?.cidade, c?.uf);
  // O cadastro às vezes deixa o `uf` estruturado vazio e escreve o estado por
  // extenso na cidade ("Mafra, Santa Catarina" / "Irati, Paraná"). A sigla sai da
  // mesma regra do `UF_POR_NOME` dentro do IBGE (via município resolvido) — o que
  // fecha o TLocal da NF-e sem a emissão pedir o endereço de novo.
  const uf = ufBruto.length === 2 ? ufBruto : (municipio?.uf ?? ufBruto);

  if (!nome) faltando.push("nome");
  if (!logradouro) faltando.push("logradouro");
  if (!numero) faltando.push("número do endereço");
  if (!bairro) faltando.push("bairro");
  if (!municipio) faltando.push("cidade/UF (ou o código IBGE do município)");
  if (uf.length !== 2) faltando.push("UF");
  if (!documento) faltando.push("CPF/CNPJ");

  // O leiaute da NF-e limita cada campo do TLocal a 60 caracteres (xLgr, nro,
  // xCpl, xBairro — o XSD). O cadastro é `text`, sem limite: cortar aqui
  // mandaria endereço pela metade para a SEFAZ, então o campo é NOMEADO para
  // quem emite corrigir no cadastro.
  const cep = (c?.cep ?? "").replace(/\D/g, "");
  const complemento = texto(c?.complemento);
  for (const [rotulo, valor] of [
    ["logradouro", logradouro],
    ["número do endereço", numero],
    ["complemento", complemento],
    ["bairro", bairro],
  ] as const) {
    if (valor.length > 60) {
      faltando.push(`${rotulo} com mais de 60 caracteres`);
    }
  }
  const entrega: LocalDeEntrega | null =
    faltando.length === 0 && municipio
      ? {
          logradouro,
          numero,
          ...(complemento ? { complemento } : {}),
          bairro,
          municipio: municipio.nome,
          codigo_municipio: municipio.codigo,
          uf,
          ...(cep.length === 8 ? { cep } : {}),
        }
      : null;

  return { nome, documento, ie, indicador_ie, entrega, faltando };
}

/**
 * Carrega o contato do pedido (vínculo primeiro, documento depois — mesmo
 * caminho dos importados que o romaneio usa) e monta o destinatário.
 *
 * A busca por documento só alcança a coluna `cnpj`: o CPF que o Mercos deixa em
 * `source_metadata.mercos.documento` não é alcançável por igualdade (o metadado
 * guarda máscara, e filtrar caminho JSON faria uma consulta por emissão). São
 * 4 pedidos nesta instalação nessa situação, e todos têm o documento no próprio
 * snapshot — a nota sai com ele; o endereço é o que falta, e a tela diz isso.
 */
export async function carregarDestinatario(
  supabase: SupabaseClient,
  organizationId: string,
  pedido: PedidoParaDestinatario,
  /** Correções gravadas NA NOTA (jsonb), aplicadas por cima do cadastro. */
  ajuste?: AjusteDoDestinatario | null,
): Promise<DestinatarioDaNota> {
  let contato: ContatoFiscal | null = null;

  if (pedido.contact_id) {
    const { data } = await supabase
      .from("contacts")
      .select(COLUNAS_DO_CONTATO)
      .eq("organization_id", organizationId)
      .eq("id", pedido.contact_id)
      .maybeSingle();
    contato = (data as unknown as ContatoFiscal) ?? null;
  }

  if (!contato) {
    const documento = documentoFiscal(pedido.cliente_documento);
    if (documento) {
      const { data } = await supabase
        .from("contacts")
        .select(COLUNAS_DO_CONTATO)
        .eq("organization_id", organizationId)
        .eq("cnpj", documento)
        .maybeSingle();
      contato = (data as unknown as ContatoFiscal) ?? null;
    }
  }

  return montarDestinatario(pedido, contato, ajuste);
}
