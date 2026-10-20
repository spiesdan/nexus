/**
 * O IMPORTADOR DO HISTÓRICO DE NOTAS EMITIDAS — lê os XMLs (procNFe) que o
 * operador exportou do sistema antigo e vira linha em `invoices` (status
 * autorizada, XML, protocolo).
 *
 * ─── Por que NÃO vem da SEFAZ ───────────────────────────────────────────────
 *
 * A distribuição de DF-e (`NFeDistribuicaoDFe`, por NSU) é do DESTINATÁRIO: a
 * SEFAZ **não devolve ao emitente as notas que ele mesmo emitiu** (NT 2014.002;
 * o XML só é distribuído a quem recebeu). O caminho da SEFAZ existe para as
 * ENTRADAS (`fiscal-entradas`), não para o nosso histórico de emissão. Quem
 * prometia o contrário ficava eternamente em "NSU 0/0" — por isso o histórico
 * entra por upload do XML/ZIP exportado do sistema antigo (Mercos, Odivix…),
 * que é o que a aba Notas oferece.
 *
 * Duas travas de honestidade:
 *
 *   1. Só vira linha o que é procNFe COMPLETO, com cStat 100 e emitente igual
 *      ao CNPJ da configuração fiscal — resumo sem XML não vira nota, e nota
 *      de outro emitente não é o nosso histórico;
 *   2. Duplicidade morre na unique de `chave_acesso` — já existente conta como
 *      "jaExistiam", nunca como nota nova.
 */

import type { createAdminClient } from "@/lib/supabase/admin";

export interface ResumoImportacao {
  ok: boolean;
  erro: string | null;
  /** Documentos emitidos lidos nesta rodada (limite da chamada). */
  lidos: number;
  /** Linhas novas em `invoices`. */
  importados: number;
  /** Chaves que já estavam no banco (dedupe pela unique de chave_acesso). */
  jaExistiam: number;
  /** Emitidas que vieram só como resumo (sem procNFe) — não viram linha. */
  semXml: number;
  /** procNFe cujo cStat de autorização não é 100 (denegada/rejeitada…). */
  naoAutorizadas: number;
  /** Eventos de cancelamento aplicados (linha nova já nasce cancelada, ou atualiza existente). */
  cancelamentos: number;
  /** Colisão de (série, número) com nota de outra chave — não gravada. */
  conflitos: number;
  ult_nsu: number;
  max_nsu: number;
  aviso: string | null;
}

function digitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

function protocoloDoXml(xml: string): string | null {
  return /<protNFe[\s\S]*?<nProt>(\d+)<\/nProt>/.exec(xml)?.[1] ?? null;
}

function cstatDoXml(xml: string): string | null {
  return /<infProt>[\s\S]*?<cStat>(\d+)<\/cStat>/.exec(xml)?.[1] ?? null;
}

function paraCents(v: string): number {
  const limpo = v.trim().replace(",", ".");
  if (!/^[\d.]+$/.test(limpo)) return 0;
  return Math.round(Number(limpo) * 100) || 0;
}

/**
 * Lê um procNFe exportado (o XML baixado do sistema antigo ou do portal) e
 * devolve a candidata — ou `null` se não for procNFe reconhecível. Só as
 * tags que a nota precisa: chave (Id da infNFe), série/número do ide, total
 * do ICMSTot, emitente e o protocolo de autorização.
 */
export function lerProcNfe(xml: string): (Candidata & { cnpj_emitente: string }) | null {
  const chave = /<infNFe[^>]*\bId="NFe(\d{44})"/.exec(xml)?.[1] ?? null;
  const serie = /<ide>[\s\S]*?<serie>(\d+)<\/serie>/.exec(xml)?.[1] ?? null;
  const numero = Number(/<ide>[\s\S]*?<nNF>(\d+)<\/nNF>/.exec(xml)?.[1] ?? 0);
  if (!chave || !serie || !numero) return null;
  const vnf = /<ICMSTot>[\s\S]*?<vNF>([\d.,]+)<\/vNF>/.exec(xml)?.[1] ?? "0";
  const cnpj = digitos(/<emit>[\s\S]*?<CNPJ>(\d{14})<\/CNPJ>/.exec(xml)?.[1] ?? "");
  return {
    chave,
    serie,
    numero,
    valor_cents: paraCents(vnf),
    xml,
    dh_emi: /<ide>[\s\S]*?<dhEmi>([^<]+)<\/dhEmi>/.exec(xml)?.[1] ?? null,
    cnpj_emitente: cnpj,
  };
}

/** Nota pronta para virar linha: procNFe completo, com número e chave. */
export interface Candidata {
  chave: string;
  serie: string;
  numero: number;
  valor_cents: number;
  xml: string;
  dh_emi: string | null;
}

/**
 * Grava as candidatas que ainda não existem (dedupe pela unique de
 * `chave_acesso`), aplica eventos de cancelamento sobre o que já está e conta
 * tudo no `resumo`. Compartilhado pelo caminho da SEFAZ e pelo upload do XML
 * exportado do sistema antigo — mesma rotina de insert, duas origens.
 */
export async function registrarEmitidas(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  candidatas: Candidata[],
  canceladas: Set<string>,
  resumo: ResumoImportacao,
  userId: string | null,
): Promise<void> {
  if (candidatas.length === 0 && canceladas.size === 0) return;

  // Dedupe pela unique de chave_acesso (o que já está) — inclui as chaves com
  // evento de cancelamento, para atualizar nota importada em rodada anterior.
  const chaves = [...new Set([...candidatas.map((d) => d.chave), ...canceladas])].filter(Boolean);
  const existentes = new Map<string, { id: string; status: string }>();
  if (chaves.length > 0) {
    const { data } = await admin
      .from("invoices")
      .select("id, chave_acesso, status")
      .eq("organization_id", orgId)
      .in("chave_acesso", chaves);
    for (const linha of (data ?? []) as unknown as {
      id: string;
      chave_acesso: string | null;
      status: string;
    }[]) {
      if (linha.chave_acesso)
        existentes.set(linha.chave_acesso, { id: linha.id, status: linha.status });
    }
  }

  // Evento de cancelamento para nota que já está aqui: a história muda de
  // status (autorizada → cancelada), nunca o contrário.
  for (const chave of canceladas) {
    const linha = existentes.get(chave);
    if (linha && linha.status === "autorizada") {
      await admin
        .from("invoices")
        .update({ status: "cancelada", updated_at: new Date().toISOString() })
        .eq("id", linha.id);
      resumo.cancelamentos += 1;
    }
  }

  const novas = candidatas.filter((d) => !existentes.has(d.chave));
  resumo.jaExistiam += candidatas.length - novas.length;
  if (novas.length === 0) return;

  // Colisão de (série, número) com outra chave: unique do tenant manda.
  const series = [...new Set(novas.map((d) => d.serie))];
  const conflitantes = new Set<string>();
  const { data: choques } = await admin
    .from("invoices")
    .select("serie, numero")
    .eq("organization_id", orgId)
    .in("serie", series);
  for (const linha of (choques ?? []) as unknown as { serie: string; numero: number | null }[]) {
    if (linha.numero !== null) conflitantes.add(`${linha.serie}|${linha.numero}`);
  }

  const agora = new Date().toISOString();
  const linhas: Record<string, unknown>[] = [];
  for (const doc of novas) {
    const cstat = cstatDoXml(doc.xml);
    if (cstat !== "100") {
      resumo.naoAutorizadas += 1;
      continue;
    }
    if (conflitantes.has(`${doc.serie}|${doc.numero}`)) {
      resumo.conflitos += 1;
      continue;
    }
    const cancelada = canceladas.has(doc.chave);
    linhas.push({
      organization_id: orgId,
      serie: doc.serie,
      numero: doc.numero,
      chave_acesso: doc.chave,
      xml: doc.xml,
      status: cancelada ? "cancelada" : "autorizada",
      provedor: "importado",
      protocolo: protocoloDoXml(doc.xml),
      sefaz_cstat: cstat,
      total_cents: doc.valor_cents,
      created_by: userId,
      created_at: doc.dh_emi ?? agora,
      updated_at: agora,
    });
    if (cancelada) resumo.cancelamentos += 1;
  }
  if (linhas.length === 0) return;

  const { error } = await admin.from("invoices").insert(linhas);
  if (!error) {
    resumo.importados += linhas.length;
    return;
  }
  // Alguma travou (corrida com outra escrita): linha a linha, uma ruim não
  // joga fora o lote.
  for (const linha of linhas) {
    const { error: erroLinha } = await admin.from("invoices").insert([linha]);
    if (erroLinha) resumo.conflitos += 1;
    else resumo.importados += 1;
  }
}
