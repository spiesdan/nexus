/**
 * O NÚMERO DA NOTA VEM DE UM CONTADOR — e não do número do pedido.
 *
 * ─── O defeito que este arquivo conserta ───────────────────────────────────
 *
 * O `nNF` saía de `commercial_orders.numero`. Os dois números andam juntos só
 * enquanto todo pedido vira nota — e nem todo vira: pedido cancelado,
 * bonificação, amostra, ou simplesmente um pedido que ninguém faturou. Cada um
 * desses abre um buraco na sequência da série, e a SEFAZ cobra inutilização por
 * cada buraco.
 *
 * Medido nesta instalação antes da troca: 31 pedidos expedidos, 1 nota emitida,
 * e a nota levaria o número do pedido.
 *
 * ─── Por que a reserva é uma função de banco ───────────────────────────────
 *
 * Porque duas emissões simultâneas não podem receber o mesmo número. Um
 * `select` do próximo número seguido de `update` no app tem uma janela entre os
 * dois; `fn_reservar_numero_nfe` faz `update ... returning`, com a linha
 * travada, e devolve o número já consumido.
 *
 * ─── Número não configurado é recusa, não chute ────────────────────────────
 *
 * `fiscal_settings.proximo_numero` nasce nulo. Quem migra de outro sistema
 * informa o último número emitido + 1. Enquanto estiver nulo, a emissão para
 * com o motivo escrito: adivinhar aqui significa queimar faixa fiscal de
 * verdade, e não há como desfazer.
 */
import type { createAdminClient } from "@/lib/supabase/admin";

import type { ResultadoDeEmissao } from "./provedor";

type Admin = ReturnType<typeof createAdminClient>;

/** A recusa que a tela mostra quando ninguém configurou a numeração. */
export const FALTA_NUMERACAO =
  "Informe o próximo número da NF-e em Notas → Configuração fiscal (numeração). " +
  "Sem número configurado a nota não sai: a SEFAZ exige sequência por série, " +
  "e adivinhar queima faixa fiscal.";

export type ReservaDeNumero =
  | { ok: true; numero: number }
  | { ok: false; falta: string };

/**
 * Reserva o próximo número da série da organização.
 *
 * Devolve `falta` quando o contador não está configurado ou o banco recusou —
 * nunca um número inventado.
 */
export async function reservarNumeroDaNota(admin: Admin, organizationId: string): Promise<ReservaDeNumero> {
  const { data, error } = await admin.rpc("fn_reservar_numero_nfe", {
    p_organization_id: organizationId,
  });
  if (error) {
    return { ok: false, falta: `Não consegui reservar o número da NF-e (${error.message}).` };
  }
  if (typeof data !== "number" || !Number.isInteger(data) || data < 1) {
    return { ok: false, falta: FALTA_NUMERACAO };
  }
  return { ok: true, numero: data };
}

/**
 * Devolve o número reservado quando a nota NÃO chegou à SEFAZ.
 *
 * Só desfaz se ninguém tomou o número seguinte (a função de banco confere:
 * `proximo_numero = numero + 1`). Se outra emissão já avançou o contador, o
 * número fica consumido e aparece no relatório de puladas para inutilização —
 * devolvê-lo criaria uma faixa fora de ordem.
 */
export async function devolverNumeroDaNota(
  admin: Admin,
  organizationId: string,
  numero: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("fn_devolver_numero_nfe", {
    p_organization_id: organizationId,
    p_numero: numero,
  });
  if (error) return false;
  return data === true;
}

/**
 * A falha aconteceu ANTES de qualquer coisa sair para a SEFAZ?
 *
 * É o que autoriza devolver o número. Os códigos abaixo são todos locais: o
 * XML nem chegou a ser transmitido (montagem, certificado, configuração). Os
 * demais — `SEFAZ_*`, `LOTE_RECEBIDO`, tempo esgotado, resposta ilegível — são
 * ambíguos de propósito: depois de enviar, reusar o número pode duplicar nota,
 * então o número fica consumido.
 */
export function falhouAntesDaSefaz(resultado: ResultadoDeEmissao): boolean {
  if (resultado.status === "autorizada") return false;
  const codigo = (resultado.sefaz_cstat ?? "").trim();
  if (["VALIDACAO", "CERT_NAO_LIDO", "XML_INVALIDO", "CONFIG_INVALIDA"].includes(codigo)) {
    return true;
  }
  const erro = resultado.erro ?? "";
  return erro.startsWith("Falta ") || erro.includes("fora do ar (FISCAL_SIDECAR_URL");
}
