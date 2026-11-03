/**
 * O DOCUMENTO DO CADASTRO — um só lugar para ler CPF/CNPJ do contato.
 *
 * `contacts.cnpj` guarda CNPJ. O importador do Mercos **não grava CPF ali**:
 * ele deixa o documento como veio no `source_metadata.mercos.documento` e
 * deixa `cnpj` NULL. Medido nesta instalação (2026-11-03): 917 contatos com CPF
 * nos metadados, e **907 deles com a coluna `cnpj` vazia**; 832 pedidos desses
 * clientes, 804 com o CPF só no snapshot do pedido.
 *
 * O efeito era visível: a ficha do cliente mostrava "Documento: —" e a NF-e
 * dizia que o cadastro não tinha CPF/CNPJ — para um cliente que tem CPF, só
 * que guardado no lugar que ninguém lia. O pedido 19341 é o caso concreto.
 *
 * A regra é a mesma do impresso (`rotuloDoDocumento`): o tipo declarado manda,
 * e na falta dele o número de dígitos decide. A coluna vence o metadado — se
 * alguém corrigiu o cadastro à mão, a correção vale.
 */
import { formatarCnpj } from "@/lib/brasil/cnpj";
import { rotuloDoDocumento } from "@/lib/comercial/documento";

export interface DocumentoDoCadastro {
  /** Só dígitos: 11 (CPF) ou 14 (CNPJ). É o que a NF-e e o impresso usam. */
  digitos: string;
  tipo: "CPF" | "CNPJ";
}

/** O mínimo que o resolvedor precisa de um contato. */
export interface ContatoComDocumento {
  cnpj?: string | null;
  tipo_pessoa?: string | null;
  source_metadata?: unknown;
}

/** O documento que o Mercos deixou nos metadados, quando houver. */
function documentoDoMercos(metadados: unknown): string | null {
  if (!metadados || typeof metadados !== "object") return null;
  const mercos = (metadados as Record<string, unknown>).mercos;
  if (!mercos || typeof mercos !== "object") return null;
  const documento = (mercos as Record<string, unknown>).documento;
  return typeof documento === "string" ? documento : null;
}

/**
 * CPF/CNPJ do contato, ou `null` quando não há nenhum documento válido.
 *
 * Devolver `null` para tamanho estranho é deliberado: documento pela metade no
 * XML é rejeição da SEFAZ, e "11 dígitos" é a única coisa que distingue CPF de
 * um número qualquer.
 */
export function documentoDoCadastro(
  contato: ContatoComDocumento | null | undefined,
): DocumentoDoCadastro | null {
  const candidatos = [contato?.cnpj, documentoDoMercos(contato?.source_metadata)];
  for (const bruto of candidatos) {
    const digitos = String(bruto ?? "").replace(/\D/g, "");
    if (digitos.length === 11 || digitos.length === 14) {
      return { digitos, tipo: rotuloDoDocumento(contato?.tipo_pessoa, digitos) };
    }
  }
  return null;
}

/** Só o número, para quem não se importa com o rótulo. */
export function documentoDigitos(
  contato: ContatoComDocumento | null | undefined,
): string | null {
  return documentoDoCadastro(contato)?.digitos ?? null;
}

/**
 * Formata para leitura humana: `420.409.069-91` / `27.493.187/0001-69`.
 *
 * `cnpj` tem formatador próprio (`lib/brasil/cnpj.ts`); CPF não tinha nenhum —
 * a ficha do cliente caía em "—" porque a coluna estava vazia, não porque
 * faltasse formatador.
 */
export function formatarDocumento({ digitos, tipo }: DocumentoDoCadastro): string {
  if (tipo === "CPF" && digitos.length === 11) {
    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
  }
  if (tipo === "CNPJ" && digitos.length === 14) return formatarCnpj(digitos);
  return digitos;
}
