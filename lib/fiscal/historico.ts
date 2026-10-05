/**
 * O IMPORTADOR DO HISTÓRICO DE NOTAS EMITIDAS — puxa da SEFAZ, com o
 * certificado A1, o que já foi autorizado para o CNPJ do emitente e vira linha
 * em `invoices` (status autorizada, XML do procNFe, protocolo).
 *
 * É o par da "Exporta XMLs" do Odivix: quem emitiu lá tem o histórico no
 * SEFAZ, não no nosso banco. Duas travas de honestidade:
 *
 *   1. Só vira linha o que vem como procNFe COMPLETO e com cStat 100 —
 *      resumo sem XML não vira nota (XML ausente seria nota de mentira), e
 *      documento de que somos DESTINATÁRIO não é nosso histórico;
 *   2. Duplicidade morre na unique de `chave_acesso` — já existente conta como
 *      "jaExistiam", nunca como nota nova.
 *
 * O cursor (`fiscal_emitidas_cursor`, migration 0253) é gravado a cada rodada:
 * se a chamada cair no meio, a próxima continua de onde parou — sem ele, cada
 * clique rebaixaria tudo de novo e a SEFAZ bloquearia o CNPJ por consumo
 * indevido (cStat 656).
 */

import { createAdminClient } from "@/lib/supabase/admin";

import { buscarNaSefaz, type ContextoEntrada, type DocumentoSefaz } from "./entrada";
import { carregarContextoSped } from "./sped-payload";

/** Evento 110111 = cancelamento da NF-e. */
const EVENTO_CANCELAMENTO = "110111";

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

export interface OpcoesImportacao {
  /** Documentos emitidos lidos no máximo nesta chamada (padrão 50). */
  limite?: number;
  /** Rodadas de distribuição dentro da chamada (cada uma faz até 3 consultas SEFAZ). */
  rodadas?: number;
  /** Quem importa — vira `invoices.created_by`. */
  userId?: string | null;
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

function vazio(): ResumoImportacao {
  return {
    ok: true,
    erro: null,
    lidos: 0,
    importados: 0,
    jaExistiam: 0,
    semXml: 0,
    naoAutorizadas: 0,
    cancelamentos: 0,
    conflitos: 0,
    ult_nsu: 0,
    max_nsu: 0,
    aviso: null,
  };
}

async function carregarCursor(admin: ReturnType<typeof createAdminClient>, orgId: string): Promise<{ ult: number; max: number }> {
  const ler = async (): Promise<{ ult: number; max: number } | null> => {
    const { data } = await admin
      .from("fiscal_emitidas_cursor")
      .select("ult_nsu, max_nsu")
      .eq("organization_id", orgId)
      .maybeSingle();
    const linha = data as unknown as { ult_nsu: number; max_nsu: number } | null;
    return linha ? { ult: Number(linha.ult_nsu) || 0, max: Number(linha.max_nsu) || 0 } : null;
  };
  const atual = await ler();
  if (atual) return atual;
  // ignoreDuplicates: se outra chamada criou a linha no meio, não joga fora o
  // cursor dela — releia antes de assumir zero.
  await admin
    .from("fiscal_emitidas_cursor")
    .upsert({ organization_id: orgId, ult_nsu: 0, max_nsu: 0 }, { onConflict: "organization_id", ignoreDuplicates: true });
  return (await ler()) ?? { ult: 0, max: 0 };
}

async function gravarCursor(admin: ReturnType<typeof createAdminClient>, orgId: string, ult: number, max: number): Promise<void> {
  await admin
    .from("fiscal_emitidas_cursor")
    .upsert({ organization_id: orgId, ult_nsu: ult, max_nsu: max, atualizado_em: new Date().toISOString() }, { onConflict: "organization_id" });
}

/**
 * Uma chamada de importação: roda `rodadas` distribuições a partir do cursor,
 * filtra as emitidas com XML completo e grava o que faltar. Retomável: o
 * cursor avança rodada a rodada.
 */
export async function importarHistoricoEmitidas(orgId: string, opcoes: OpcoesImportacao = {}): Promise<ResumoImportacao> {
  const resumo = vazio();
  const limite = Math.max(1, Math.min(opcoes.limite ?? 50, 200));
  const rodadas = Math.max(1, Math.min(opcoes.rodadas ?? 4, 20));

  const contexto = await carregarContextoSped(orgId);
  if (!contexto) {
    return { ...resumo, ok: false, erro: "Sem configuração fiscal para a organização." };
  }
  const cnpj = digitos(contexto.emitente.emitente_documento);
  const senha = contexto.senhaCertificado;
  const certificado = contexto.emitente.certificado_path;
  if (!cnpj) return { ...resumo, ok: false, erro: "CNPJ do emitente ausente (configuração fiscal)." };
  if (!certificado || !senha) return { ...resumo, ok: false, erro: "Certificado A1 ausente (caminho e senha)." };

  const ctx: ContextoEntrada = {
    ambiente: contexto.emitente.ambiente,
    cnpj,
    razao: contexto.emitente.emitente_documento ?? "",
    ie: digitos(contexto.emitente.ie),
    uf: (contexto.emitente.uf ?? "").toUpperCase(),
    certificadoPath: certificado,
    senhaCertificado: senha,
  };

  const admin = createAdminClient();
  const cursor = await carregarCursor(admin, orgId);
  let ult = cursor.ult;
  let max = cursor.max;
  resumo.ult_nsu = ult;
  resumo.max_nsu = max;

  for (let rodada = 0; rodada < rodadas; rodada++) {
    const r = await buscarNaSefaz(ctx, ult);
    if (!r.ok) {
      resumo.ult_nsu = ult;
      resumo.max_nsu = max;
      if (resumo.lidos === 0) return { ...resumo, ok: false, erro: r.erro };
      resumo.erro = r.erro; // parcial: o cursor já avançou, dá para retomar
      return resumo;
    }

    const lidosAntes = resumo.lidos;
    await processarDocumentos(admin, orgId, r.documentos, cnpj, resumo, opcoes.userId ?? null);
    resumo.lidos += r.documentos.filter((d) => d.tipo !== "evento").length;

    ult = r.ultNSU;
    max = Math.max(max, r.maxNSU);
    await gravarCursor(admin, orgId, ult, max);
    resumo.ult_nsu = ult;
    resumo.max_nsu = max;
    resumo.aviso = r.aviso ?? resumo.aviso;

    if (r.aviso) break; // 137 nada novo · 656 consumo indevido: para aqui
    if (ult >= max) break; // alcançou o topo da fila da SEFAZ
    if (resumo.lidos - lidosAntes >= limite) break;
    if (resumo.lidos >= limite) break;
  }

  return resumo;
}

/**
 * Uma rodada de documentos: separa emitidas (com procNFe completo) de
 * destinatário, recolhe eventos de cancelamento e grava o que não existe.
 * Devolve os contadores já somados no `resumo`.
 */
async function processarDocumentos(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  documentos: DocumentoSefaz[],
  cnpj: string,
  resumo: ResumoImportacao,
  userId: string | null,
): Promise<void> {
  const emitidas: Candidata[] = [];
  const canceladas = new Set<string>();

  for (const doc of documentos) {
    if (doc.tipo === "evento") {
      if (doc.tp_evento === EVENTO_CANCELAMENTO && doc.chave) canceladas.add(doc.chave);
      continue;
    }
    if (digitos(doc.emitente_cnpj) !== cnpj) continue; // somos destinatário: não é histórico de emissão
    if (doc.tipo === "completa" && doc.xml && doc.numero !== null) {
      emitidas.push({
        chave: doc.chave,
        serie: String(doc.serie ?? ""),
        numero: doc.numero,
        valor_cents: doc.valor_cents,
        xml: doc.xml,
        dh_emi: doc.dh_emi,
      });
    } else {
      resumo.semXml += 1; // resumo da nossa emissão: sem procNFe não vira linha
    }
  }

  if (emitidas.length === 0 && canceladas.size === 0) return;

  await registrarEmitidas(admin, orgId, emitidas, canceladas, resumo, userId);
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
    for (const linha of (data ?? []) as unknown as { id: string; chave_acesso: string | null; status: string }[]) {
      if (linha.chave_acesso) existentes.set(linha.chave_acesso, { id: linha.id, status: linha.status });
    }
  }

  // Evento de cancelamento para nota que já está aqui: a história muda de
  // status (autorizada → cancelada), nunca o contrário.
  for (const chave of canceladas) {
    const linha = existentes.get(chave);
    if (linha && linha.status === "autorizada") {
      await admin.from("invoices").update({ status: "cancelada", updated_at: new Date().toISOString() }).eq("id", linha.id);
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
