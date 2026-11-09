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

import { cstatNumerico } from "./cstat";
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
 * ─── Duas metades, e o defeito que nasceu de separá-las ────────────────────
 *
 * O contador `proximo_numero` e a linha `invoices.numero` são O MESMO dado em
 * dois lugares. No defeito medido em 04/11/2026 a devolução desfez só o
 * contador: a nota 4577 (falha local, sem NCM) continuou com `numero = 4577`,
 * o contador voltou para 4577, a emissão seguinte reservou 4577, a SEFAZ
 * AUTORIZOU — e o UPDATE final morreu no índice único
 * `invoices_org_serie_numero_key`. A nota autorizada ficou invisível por horas.
 *
 * Por isso a devolução bem-sucedida limpa o número da linha da mesma nota:
 * ou as duas metades voltam, ou nenhuma volta. Quando a devolução falha (outra
 * emissão já tomou o número seguinte), a linha MANTÉM o número e ele aparece
 * entre as puladas para inutilização — nunca some.
 *
 * Só é chamada quando `podeDevolverNumero` dá true: falha local ou rejeição
 * DEFINITIVA da SEFAZ. Depois de uma resposta ambígua (timeout, lote em
 * processamento) o número continua consumido — reusar pode duplicar nota.
 */
export async function devolverNumeroDaNota(
  admin: Admin,
  organizationId: string,
  numero: number,
  invoiceId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("fn_devolver_numero_nfe", {
    p_organization_id: organizationId,
    p_numero: numero,
  });
  if (error) return false;
  if (data !== true) return false;

  // A segunda metade. Se falhar, o número volta ao contador mas continua na
  // linha — e a reserva nova pula ele, então não há reuso; o pior caso é uma
  // faixa pulada, nunca um número entregue a duas notas.
  await admin
    .from("invoices")
    .update({ numero: null, updated_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .neq("status", "autorizada");
  return true;
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

/**
 * O número pode voltar ao contador? — a pergunta que faltava.
 *
 * ─── A rejeição da SEFAZ NÃO CONSOME NUMERAÇÃO ─────────────────────────────
 *
 * Rejeição é documento NÃO autorizado: a SEFAZ descarta a nota e o número
 * continua livre. Todo emissor reenvia a MESMA nota com o MESMO número depois
 * de corrigir o cadastro. Este dreno reservava um número novo a cada tentativa
 * e tratava a rejeição como se ela tivesse chegado ao fisco — foi assim que
 * 4595, 4596, 4602 e 4604 viraram buraco na série 1:
 *
 *   4602 → rejeição 232 (IE do destinatário não informada), pedido 19451
 *   4604 → rejeição 234 (IE não vinculada ao CNPJ), pedido 19448
 *
 * As notas saíram depois como 4603 e 4605, e os números recusados ficaram
 * órfãos. Devolver o número na rejeição faz a reemissão reservar o MESMO
 * número — não existe buraco, não existe inutilização a fazer.
 *
 * ─── Quando NÃO devolver ───────────────────────────────────────────────────
 *
 * - **Número/chave já no fisco** (204/205/218/539): duplicidade significa que
 *   o documento existe; reusar criaria duas notas com o mesmo número.
 * - **Resposta ambígua** (103/104/105/108/109, timeout, lote em processamento):
 *   a SEFAZ pode ter recebido a nota. Só a certeza de recusa autoriza reusar.
 * - **Autorizada/denegada**: o número pertence ao documento.
 *
 * Falha local (`falhouAntesDaSefaz`) continua devolvendo — nada foi transmitido.
 */
const CSTAT_JA_NO_FISCO = new Set(["204", "205", "218", "539"]);
const CSTAT_RESPOSTA_AMBIGUA = new Set(["103", "104", "105", "108", "109"]);

export function podeDevolverNumero(resultado: ResultadoDeEmissao): boolean {
  if (resultado.status !== "erro") return false;
  if (falhouAntesDaSefaz(resultado)) return true;
  const cstat = cstatNumerico(resultado.sefaz_cstat);
  // 1xx é autorização/processamento — nunca chega aqui como erro, mas se
  // chegar é resposta ambígua, não recusa. De 2xx a 9xx são rejeições.
  if (!/^[2-9]\d{2}$/.test(cstat)) return false;
  return !CSTAT_JA_NO_FISCO.has(cstat) && !CSTAT_RESPOSTA_AMBIGUA.has(cstat);
}
