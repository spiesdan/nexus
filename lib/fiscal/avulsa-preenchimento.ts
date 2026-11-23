/**
 * O PREENCHIMENTO DA VENDA AVULSA A PARTIR DO CADASTRO.
 *
 * A NF-e de balcão tinha dois buracos medidos (20/11): ao escolher um contato,
 * a tela lia só `cnpj` — e 907 clientes têm CPF apenas em
 * `source_metadata.mercos.documento`; e a emissão mandava só `{avulsa}`,
 * descartando tudo que o operador digitou em "Dados adicionais".
 *
 * Este módulo NÃO tem regra fiscal própria: o documento vem de
 * `documentoDoCadastro()` e o destinatário/endereço de `montarDestinatario()`,
 * as mesmas funções que o pedido e o servidor usam. Aqui só se traduz o
 * resultado para os campos do formulário e se aplica a precedência — o que foi
 * digitado vence o que veio do cadastro.
 */
import { documentoDoCadastro } from "@/lib/contacts/documento-do-cadastro";
import {
  montarDestinatario,
  type ContatoFiscal,
} from "@/lib/fiscal/destinatario-da-nota";

/** Os campos do formulário que o cadastro pode preencher na avulsa. */
export interface CamposDaAvulsa {
  cliente_nome: string;
  cliente_documento: string;
  destinatarioNome: string;
  destinatarioDocumento: string;
  destinatarioIe: string;
  entregaLogradouro: string;
  entregaNumero: string;
  entregaComplemento: string;
  entregaBairro: string;
  entregaMunicipio: string;
  entregaCodigoMunicipio: string;
  entregaUf: string;
  entregaCep: string;
}

/** O que o cadastro resolve — e o que ele não consegue fechar (nomes em pt-BR). */
export function camposDaAvulsa(
  contato: ContatoFiscal | null | undefined,
  nomeDaBusca: string,
  documentoDigitado = "",
): { campos: CamposDaAvulsa; faltando: string[] } {
  const destinatario = montarDestinatario(
    {
      cliente_nome: nomeDaBusca,
      cliente_documento: documentoDigitado || null,
      contact_id: contato?.id ?? null,
    },
    contato,
  );
  const entrega = destinatario.entrega;
  // `montarDestinatario` já lê o metadado do Mercos; chamar a função aqui também
  // deixa explícito no cliente de onde sai o CPF que a coluna `cnpj` não tem.
  const documento = documentoDoCadastro(contato)?.digitos ?? destinatario.documento ?? "";
  const campos: CamposDaAvulsa = {
    cliente_nome: destinatario.nome,
    cliente_documento: documento,
    destinatarioNome: destinatario.nome,
    destinatarioDocumento: destinatario.documento ?? "",
    destinatarioIe: destinatario.ie ?? "",
    entregaLogradouro: entrega?.logradouro ?? "",
    entregaNumero: entrega?.numero ?? "",
    entregaComplemento: entrega?.complemento ?? "",
    entregaBairro: entrega?.bairro ?? "",
    entregaMunicipio: entrega?.municipio ?? "",
    entregaCodigoMunicipio: entrega?.codigo_municipio ?? "",
    entregaUf: entrega?.uf ?? "",
    entregaCep: entrega?.cep ?? "",
  };
  return { campos, faltando: destinatario.faltando };
}

/** Digitado vence cadastro — inclusive quando o operador apagou para corrigir. */
export function precedenciaDigitado(digitado: string, doCadastro: string): string {
  return digitado.trim() !== "" ? digitado : doCadastro;
}
