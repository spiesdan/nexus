/**
 * A SINCRONIZAÇÃO DE NF-e DE ENTRADA — uma função, dois chamadores.
 *
 * O botão "Sincronizar agora" e o cron chamam ESTE arquivo. Não existe um
 * caminho "manual" com regras diferentes do automático: os dois disputam o
 * mesmo lease em `fiscal_entrada_cursor`, leem o mesmo cursor e gravam o mesmo
 * log. Foi assim que o módulo deixou de ter dois comportamentos.
 *
 * ═══ A REGRA QUE O CÓDIGO ANTIGO FURAVA ═════════════════════════════════════
 *
 * O cursor só pode andar até o último NSU cujo documento foi PERSISTIDO. O
 * código anterior fazia `if (!error) novas++` e, logo depois, um `upsert` do
 * cursor com o `ultNSU` da resposta — inclusive quando o insert falhou. A
 * SEFAZ não reenvia NSU já consumido: a nota sumia para sempre, sem erro
 * visível. Aqui, qualquer falha para a rodada e o cursor fica no último NSU
 * seguro; o replay é idempotente (chave única + evento único por NSU).
 *
 * ═══ O QUE É "SEGURO" ═══════════════════════════════════════════════════════
 *
 *   - rodada sem falha  → pode ir até o `ultNSU` da resposta (não há documento
 *     perdido entre os NSUs, mesmo quando o lote veio vazio);
 *   - rodada com falha  → vai até o maior NSU persistido; o documento que
 *     falhou será re-tentado no próximo tick.
 *
 * ═══ O LEASE ════════════════════════════════════════════════════════════════
 *
 * Dois cliques (ou clique + cron) lendo o mesmo `ult_nsu` consultam a SEFAZ em
 * paralelo — e o retorno disso é 656 (consumo indevido). O UPDATE condicional
 * abaixo é atômico no Postgres: só um chamador tira a linha de "livre" para
 * "presa". Quem perde recebe `bloqueado: true` e a tela diz "já está
 * sincronizando", em vez de insistir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  COLUNAS_DA_ENTRADA,
  type EntradaFiscal,
  type ItemEntrada,
  type TotaisDaNota,
} from "@/lib/schemas/fiscal-entrada";

import { caminhoDoCertificadoNoSidecar } from "./certificado";
import {
  buscarNaSefaz,
  type ContextoEntrada,
  type DocumentoSefaz,
  type ResultadoDistribuicao,
} from "./entrada";
import { motivoDeNaoBaixar } from "./eventos";
import { carregarContextoSped } from "./sped-payload";

export const TTL_DA_TRAVA_MINUTOS = 10;
export const BACKOFF_656_MS = 60 * 60 * 1000;

export type OrigemDaSincronizacao = "manual" | "cron";

export interface ResultadoDaSincronizacao {
  ok: boolean;
  /** Já existe uma sincronização rodando para esta organização. */
  bloqueado: boolean;
  /** Categoria do erro, para a rota escolher o status sem interpretar texto. */
  codigo: "config" | "upstream" | "lock" | null;
  /** Motivo legível quando `ok=false` (configuração, SEFAZ, lock). */
  motivo: string | null;
  nsuInicial: number;
  nsuFinal: number;
  maxNsu: number;
  encontrados: number;
  importados: number;
  atualizados: number;
  erros: number;
  cstat: string | null;
  aviso: string | null;
  /** A SEFAZ mandou esperar (656) — a próxima tentativa já está agendada. */
  proximaTentativa: string | null;
}

export interface SincronizarEntradaArgs {
  admin: SupabaseClient;
  organizationId: string;
  usuarioId: string | null;
  origem: OrigemDaSincronizacao;
  requestId: string;
  /** Injetável para teste; em produção é `buscarNaSefaz`. */
  buscar?: (ctx: ContextoEntrada, ultNsu: number) => Promise<ResultadoDistribuicao>;
  /** Injetável para teste; em produção é `new Date()`. */
  agora?: () => Date;
}

// ── Helpers puros (testados em `entrada-sync.test.ts`) ─────────────────────

/** CNPJ só com dígitos — a forma como o banco compara e como o XML vem. */
export function cnpjDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/** A SEFAZ entrega fora de ordem; persistir fora de ordem furaria o "seguro". */
export function ordenarPorNsu<T extends { nsu: string | number }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => Number(a.nsu) - Number(b.nsu));
}

/**
 * Até onde o cursor pode andar.
 *
 * `falhou=false` significa que TODO documento do lote foi persistido (inclusive
 * quando o lote veio vazio) — aí o `ultNSU` da resposta é seguro.
 */
export function nsuSeguro(args: {
  ultNsu: number;
  nsuInicial: number;
  persistidos: number[];
  falhou: boolean;
}): number {
  if (!args.falhou) return Math.max(args.nsuInicial, args.ultNsu);
  const maiorPersistido = args.persistidos.length > 0 ? Math.max(...args.persistidos) : args.nsuInicial;
  return Math.max(args.nsuInicial, maiorPersistido);
}

/** Código do evento → tipo que a subtela "Cancelamentos e Eventos" entende. */
export function tipoDoEvento(tpEvento: string | null | undefined): {
  tipo: "cancelamento" | "carta_correcao" | "manifestacao" | "outro";
  descricao: string;
} {
  switch ((tpEvento ?? "").trim()) {
    case "110111":
      return { tipo: "cancelamento", descricao: "Cancelamento" };
    case "110110":
      return { tipo: "carta_correcao", descricao: "Carta de correção" };
    case "210200":
    case "210210":
    case "210220":
    case "210240":
      return { tipo: "manifestacao", descricao: "Manifestação do destinatário" };
    default:
      return { tipo: "outro", descricao: "Evento" };
  }
}

/** O que muda na linha quando o resumo vira XML completo (ou chega repetido). */
export function promocaoDoDocumento(
  atual: Pick<EntradaFiscal, "xml" | "situacao_fiscal" | "valor_total_cents"> | null,
  doc: DocumentoSefaz,
): "inserir" | "promover" | "sem_mudanca" {
  if (!atual) return "inserir";
  // Resumo depois de completo é o caso normal de uma nova sincronização: o
  // XML já está lá e o resumo não pode apagá-lo.
  if (doc.tipo === "resumo") return "sem_mudanca";
  if (!atual.xml && doc.xml) return "promover";
  return "sem_mudanca";
}

/** Os totais do ICMSTot, com o total de impostos somado quando não veio pronto. */
export function totaisDoDocumento(doc: DocumentoSefaz): TotaisDaNota {
  const t = doc.totais ?? {};
  const soma =
    (t.icms_cents ?? 0) + (t.ipi_cents ?? 0) + (t.pis_cents ?? 0) + (t.cofins_cents ?? 0);
  return {
    ...t,
    impostos_cents: t.impostos_cents ?? soma,
    total_cents: t.total_cents ?? doc.valor_cents,
  };
}

function itensParaLinhas(
  orgId: string,
  entradaId: string,
  itens: ItemEntrada[],
): Record<string, unknown>[] {
  return itens
    .map((item, indice) => ({ item, indice }))
    .filter(({ item }) => (item.codigo ?? "").trim() !== "")
    .map(({ item, indice }) => ({
      organization_id: orgId,
      entrada_id: entradaId,
      numero_item: indice + 1,
      codigo: (item.codigo ?? "").trim(),
      ean: item.ean ?? null,
      descricao: (item.descricao ?? item.codigo ?? "").slice(0, 500),
      ncm: item.ncm ?? null,
      cfop: item.cfop ?? null,
      unidade: item.unidade ?? null,
      quantidade: Number(item.quantidade) || 0,
      valor_unitario_cents: Math.max(0, Math.trunc(Number(item.preco_cents) || 0)),
      valor_total_cents: Math.max(0, Math.trunc(Number(item.total_cents) || 0)),
      icms_cents: Math.max(0, Math.trunc(Number(item.icms_cents) || 0)),
      ipi_cents: Math.max(0, Math.trunc(Number(item.ipi_cents) || 0)),
      pis_cents: Math.max(0, Math.trunc(Number(item.pis_cents) || 0)),
      cofins_cents: Math.max(0, Math.trunc(Number(item.cofins_cents) || 0)),
      cst: item.cst ?? null,
    }));
}

// ── Persistência ───────────────────────────────────────────────────────────

async function resolverFornecedor(
  admin: SupabaseClient,
  orgId: string,
  doc: DocumentoSefaz,
): Promise<string | null> {
  const cnpj = cnpjDigitos(doc.emitente_cnpj);
  if (cnpj === "") return null;

  // Fornecedor é uma lista curta por organização; casar em memória cobre CNPJ
  // gravado com e sem pontuação sem depender de `regexp_replace` no PostgREST.
  const { data } = await admin
    .from("suppliers")
    .select("id, cnpj")
    .eq("organization_id", orgId)
    .not("cnpj", "is", null);
  const linhas = (data ?? []) as unknown as { id: string; cnpj: string | null }[];
  const achado = linhas.find((l) => cnpjDigitos(l.cnpj) === cnpj);
  if (achado) return achado.id;

  const { data: criado, error } = await admin
    .from("suppliers")
    .insert({
      organization_id: orgId,
      nome: (doc.emitente_nome || "Fornecedor sem nome").slice(0, 200),
      cnpj,
      ie: doc.emitente_ie ?? null,
      endereco_json: doc.endereco ?? {},
      ultima_nota_em: doc.dh_emi ?? null,
      total_notas: 0,
      total_comprado_cents: 0,
    })
    .select("id")
    .single();
  if (error) return null;
  return (criado as unknown as { id: string }).id;
}

export interface AssociacaoDoItem {
  numero_item: number;
  produto_id: string | null;
  associado_por: string | null;
  associado_em: string | null;
}

/**
 * Devolve às linhas novas a associação que já existia.
 *
 * A associação item↔produto é uma decisão de quem conferiu, não um dado do
 * XML. O replay de uma faixa de NSU (ou a promoção de resumo para completo)
 * apaga e regrava os itens; sem preservar por `numero_item`, o vínculo manual
 * sumiria na primeira ressincronização e a importação voltaria a casar por
 * código — que é justamente o que a tela de associação corrige.
 */
export function preservarAssociacoes(
  linhas: Record<string, unknown>[],
  anteriores: AssociacaoDoItem[],
): void {
  const associacoes = new Map(anteriores.map((linha) => [linha.numero_item, linha]));
  for (const linha of linhas) {
    const antes = associacoes.get(Number(linha.numero_item));
    if (!antes) continue;
    linha.produto_id = antes.produto_id;
    linha.associado_por = antes.associado_por;
    linha.associado_em = antes.associado_em;
  }
}

async function gravarItens(
  admin: SupabaseClient,
  orgId: string,
  entradaId: string,
  doc: DocumentoSefaz,
): Promise<void> {
  const linhas = itensParaLinhas(orgId, entradaId, doc.itens ?? []);

  const { data: anteriores } = await admin
    .from("fiscal_document_items")
    .select("numero_item, produto_id, associado_por, associado_em")
    .eq("organization_id", orgId)
    .eq("entrada_id", entradaId);
  preservarAssociacoes(linhas, (anteriores ?? []) as unknown as AssociacaoDoItem[]);

  const { error: erroDelete } = await admin
    .from("fiscal_document_items")
    .delete()
    .eq("organization_id", orgId)
    .eq("entrada_id", entradaId);
  if (erroDelete) throw new Error(`itens: ${erroDelete.message}`);
  if (linhas.length === 0) return;
  const { error } = await admin.from("fiscal_document_items").insert(linhas);
  if (error) throw new Error(`itens: ${error.message}`);
}

async function gravarDocumento(
  admin: SupabaseClient,
  orgId: string,
  doc: DocumentoSefaz,
  usuarioId: string | null,
  recebidoEm: string,
): Promise<{
  acao: "novo" | "atualizado" | "sem_mudanca";
  supplierId: string | null;
  entradaId: string | null;
}> {
  const { data: atualRaw } = await admin
    .from("fiscal_entradas")
    .select(COLUNAS_DA_ENTRADA)
    .eq("organization_id", orgId)
    .eq("chave", doc.chave)
    .maybeSingle();
  const atual = atualRaw as unknown as EntradaFiscal | null;
  const acao = promocaoDoDocumento(atual, doc);
  const supplierId = await resolverFornecedor(admin, orgId, doc);

  if (acao === "inserir") {
    const { data: criada, error } = await admin
      .from("fiscal_entradas")
      .insert({
        organization_id: orgId,
        chave: doc.chave,
        nsu: Number(doc.nsu) || 0,
        emitente_cnpj: cnpjDigitos(doc.emitente_cnpj),
        emitente_nome: doc.emitente_nome || "Emitente desconhecido",
        emitente_ie: doc.emitente_ie || null,
        numero: doc.numero,
        serie: doc.serie,
        dh_emi: doc.dh_emi,
        valor_total_cents: Math.max(0, Math.trunc(doc.valor_cents) || 0),
        xml: doc.xml,
        itens_json: doc.itens ?? [],
        cobranca_json: doc.cobranca ?? [],
        status: doc.tipo === "completa" ? "manifestada" : "nova",
        tipo_documento: doc.tipo,
        situacao_fiscal: doc.tipo === "completa" ? "autorizada" : "desconhecida",
        protocolo: doc.protocolo ?? null,
        natureza_operacao: doc.natureza_operacao ?? null,
        totais_json: totaisDoDocumento(doc),
        supplier_id: supplierId,
        conferencia_status: "pendente",
        dh_entrada: recebidoEm,
        created_by: usuarioId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`entrada: ${error.message}`);
    const entradaId = (criada as unknown as { id: string }).id;

    if (doc.tipo === "completa") await gravarItens(admin, orgId, entradaId, doc);
    await vincularEventosOrfaos(admin, orgId, doc.chave, entradaId);
    return { acao: "novo", supplierId, entradaId };
  }

  if (acao === "promover" && atual) {
    const { error } = await admin
      .from("fiscal_entradas")
      .update({
        xml: doc.xml,
        itens_json: doc.itens ?? [],
        cobranca_json: doc.cobranca ?? [],
        numero: doc.numero ?? atual.numero,
        serie: doc.serie ?? atual.serie,
        dh_emi: doc.dh_emi ?? atual.dh_emi,
        valor_total_cents: Math.max(0, Math.trunc(doc.valor_cents) || atual.valor_total_cents),
        status: "manifestada",
        tipo_documento: "completa",
        // Cancelamento já registrado não volta para "autorizada".
        situacao_fiscal: atual.situacao_fiscal === "cancelada" ? "cancelada" : "autorizada",
        protocolo: doc.protocolo ?? atual.protocolo,
        natureza_operacao: doc.natureza_operacao ?? atual.natureza_operacao,
        totais_json: totaisDoDocumento(doc),
        supplier_id: atual.supplier_id ?? supplierId,
      })
      .eq("organization_id", orgId)
      .eq("id", atual.id);
    if (error) throw new Error(`entrada: ${error.message}`);
    await gravarItens(admin, orgId, atual.id, doc);
    await vincularEventosOrfaos(admin, orgId, doc.chave, atual.id);
    return { acao: "atualizado", supplierId: atual.supplier_id ?? supplierId, entradaId: atual.id };
  }

  // Documento completo já persistido: se a rodada anterior morreu entre o
  // insert da linha e o dos itens, o replay conserta em vez de pular.
  if (doc.tipo === "completa" && atual && doc.xml) {
    const { count } = await admin
      .from("fiscal_document_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("entrada_id", atual.id);
    if ((count ?? 0) === 0) await gravarItens(admin, orgId, atual.id, doc);
  }

  return { acao: "sem_mudanca", supplierId: atual?.supplier_id ?? supplierId, entradaId: atual?.id ?? null };
}

/** Evento que chegou antes do resumo ganha o vínculo quando a nota aparece. */
async function vincularEventosOrfaos(
  admin: SupabaseClient,
  orgId: string,
  chave: string,
  entradaId: string,
): Promise<void> {
  await admin
    .from("fiscal_document_events")
    .update({ entrada_id: entradaId })
    .eq("organization_id", orgId)
    .eq("chave", chave)
    .is("entrada_id", null);
}

async function contarNotasDoFornecedor(
  admin: SupabaseClient,
  orgId: string,
  supplierId: string,
): Promise<number> {
  const { count } = await admin
    .from("fiscal_entradas")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId);
  return count ?? 0;
}

async function somarComprasDoFornecedor(
  admin: SupabaseClient,
  orgId: string,
  supplierId: string,
): Promise<number> {
  const { data } = await admin
    .from("fiscal_entradas")
    .select("valor_total_cents")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId);
  return ((data ?? []) as unknown as { valor_total_cents: number }[]).reduce(
    (soma, linha) => soma + Number(linha.valor_total_cents ?? 0),
    0,
  );
}

async function gravarEvento(
  admin: SupabaseClient,
  orgId: string,
  doc: DocumentoSefaz,
): Promise<"novo" | "sem_mudanca"> {
  const { tipo, descricao } = tipoDoEvento(doc.tp_evento);
  const { data: entrada } = await admin
    .from("fiscal_entradas")
    .select("id, situacao_fiscal")
    .eq("organization_id", orgId)
    .eq("chave", doc.chave)
    .maybeSingle();
  const linha = entrada as unknown as { id: string; situacao_fiscal: string } | null;

  const { error } = await admin.from("fiscal_document_events").insert({
    organization_id: orgId,
    entrada_id: linha?.id ?? null,
    chave: doc.chave,
    nsu: Number(doc.nsu) || 0,
    tipo,
    tp_evento: (doc.tp_evento ?? "").trim(),
    descricao: doc.desc_evento ?? descricao,
    protocolo: doc.protocolo ?? null,
    dh_evento: doc.dh_evento ?? doc.dh_emi ?? null,
    sequencia: doc.sequencia ?? null,
    xml: doc.xml,
  });
  // Conflito de (org, chave, nsu) = replay do mesmo docZip: já está gravado.
  if (error) {
    if (error.code === "23505") return "sem_mudanca";
    throw new Error(`evento: ${error.message}`);
  }

  if (tipo === "cancelamento" && linha) {
    await admin
      .from("fiscal_entradas")
      .update({ situacao_fiscal: "cancelada" })
      .eq("organization_id", orgId)
      .eq("id", linha.id);
  }
  return "novo";
}

// ── Lease ──────────────────────────────────────────────────────────────────

async function travarCursor(
  admin: SupabaseClient,
  orgId: string,
  dono: string,
  agora: Date,
): Promise<number | null> {
  await admin
    .from("fiscal_entrada_cursor")
    .upsert({ organization_id: orgId, ult_nsu: 0 }, { onConflict: "organization_id", ignoreDuplicates: true });

  const limite = new Date(agora.getTime() + TTL_DA_TRAVA_MINUTOS * 60_000).toISOString();
  const { data } = await admin
    .from("fiscal_entrada_cursor")
    .update({ locked_until: limite, locked_by: dono })
    .eq("organization_id", orgId)
    .or(`locked_until.is.null,locked_until.lt.${agora.toISOString()}`)
    .select("ult_nsu")
    .maybeSingle();

  if (!data) return null;
  return Number((data as unknown as { ult_nsu: number | string }).ult_nsu ?? 0);
}

async function liberarCursor(admin: SupabaseClient, orgId: string, dono: string): Promise<void> {
  await admin
    .from("fiscal_entrada_cursor")
    .update({ locked_until: null, locked_by: null })
    .eq("organization_id", orgId)
    .eq("locked_by", dono);
}

// ── Orquestração ───────────────────────────────────────────────────────────

export async function sincronizarEntrada(
  args: SincronizarEntradaArgs,
): Promise<ResultadoDaSincronizacao> {
  const { admin, organizationId, usuarioId, origem, requestId } = args;
  const buscar = args.buscar ?? buscarNaSefaz;
  const agora = args.agora ?? (() => new Date());
  const inicio = agora();
  const dono = `${origem}:${requestId}`;

  const vazio = (motivo: string | null, extra: Partial<ResultadoDaSincronizacao> = {}) => ({
    ok: false,
    bloqueado: false,
    codigo: null,
    motivo,
    nsuInicial: 0,
    nsuFinal: 0,
    maxNsu: 0,
    encontrados: 0,
    importados: 0,
    atualizados: 0,
    erros: 0,
    cstat: null,
    aviso: null,
    proximaTentativa: null,
    ...extra,
  });

  const { data: logRaw } = await admin
    .from("fiscal_sync_logs")
    .insert({ organization_id: organizationId, origem, request_id: requestId, usuario_id: usuarioId })
    .select("id")
    .single();
  const logId = (logRaw as unknown as { id: string } | null)?.id ?? null;

  const finalizarLog = async (campos: Record<string, unknown>) => {
    if (!logId) return;
    await admin
      .from("fiscal_sync_logs")
      .update({ finalizado_em: agora().toISOString(), ...campos })
      .eq("id", logId);
  };

  const nsuInicial = await travarCursor(admin, organizationId, dono, inicio);
  if (nsuInicial === null) {
    await finalizarLog({
      resultado: "bloqueado",
      mensagem: "Já existe uma sincronização em andamento para esta organização.",
    });
    return vazio("Já existe uma sincronização em andamento.", { bloqueado: true, codigo: "lock" });
  }

  try {
    const ctx = await carregarContextoSped(organizationId);
    if (!ctx) {
      const motivo = "Sem configuração fiscal para a organização.";
      await finalizarLog({ resultado: "erro", mensagem: motivo, nsu_inicial: nsuInicial });
      return vazio(motivo, { nsuInicial, nsuFinal: nsuInicial, codigo: "config" });
    }
    const bloqueio = motivoDeNaoBaixar(ctx);
    if (bloqueio) {
      await finalizarLog({ resultado: "erro", mensagem: bloqueio, nsu_inicial: nsuInicial });
      return vazio(`Sincronização não executada: ${bloqueio}`, {
        nsuInicial,
        nsuFinal: nsuInicial,
        codigo: "config",
      });
    }

    const entrada: ContextoEntrada = {
      ambiente: ctx.emitente.ambiente,
      cnpj: cnpjDigitos(ctx.emitente.emitente_documento),
      razao: ctx.emitente.emitente_documento ?? "",
      ie: ctx.emitente.ie ?? "",
      uf: (ctx.emitente.uf ?? "").trim().toUpperCase(),
      certificadoPath: ctx.emitente.certificado_path ?? "",
      caminhoDoCertificado: caminhoDoCertificadoNoSidecar(ctx.orgId),
      senhaCertificado: ctx.senhaCertificado ?? "",
    };

    const resultado = await buscar(entrada, nsuInicial);
    if (!resultado.ok) {
      const motivo = resultado.erro ?? "SEFAZ inalcançável.";
      await finalizarLog({
        resultado: "erro",
        mensagem: motivo,
        nsu_inicial: nsuInicial,
        nsu_final: nsuInicial,
        cstat: resultado.cstat,
      });
      await admin
        .from("fiscal_entrada_cursor")
        .update({ ultimo_erro: motivo.slice(0, 500) })
        .eq("organization_id", organizationId);
      return vazio(motivo, {
        nsuInicial,
        nsuFinal: nsuInicial,
        maxNsu: resultado.maxNSU,
        cstat: resultado.cstat,
        codigo: "upstream",
      });
    }

    const documentos = ordenarPorNsu(
      (resultado.documentos ?? []).filter((d) => /^\d{44}$/.test(d.chave ?? "")),
    );

    const persistidos: number[] = [];
    let importados = 0;
    let atualizados = 0;
    let erros = 0;
    let falhou = false;
    let primeiraFalha: string | null = null;
    const fornecedoresTocados = new Set<string>();

    for (const doc of documentos) {
      try {
        if (doc.tipo === "evento") {
          const acao = await gravarEvento(admin, organizationId, doc);
          if (acao === "novo") importados++;
        } else {
          const { acao, supplierId } = await gravarDocumento(
            admin,
            organizationId,
            doc,
            usuarioId,
            inicio.toISOString(),
          );
          if (acao === "novo") importados++;
          if (acao === "atualizado") atualizados++;
          if (supplierId) fornecedoresTocados.add(supplierId);
        }
        persistidos.push(Number(doc.nsu) || 0);
      } catch (err) {
        falhou = true;
        erros++;
        primeiraFalha = err instanceof Error ? err.message : String(err);
        // PARA aqui: o NSU deste documento e os seguintes não podem ser
        // declarados consumidos. O replay é idempotente.
        break;
      }
    }

    for (const supplierId of fornecedoresTocados) {
      await admin
        .from("suppliers")
        .update({
          total_notas: await contarNotasDoFornecedor(admin, organizationId, supplierId),
          total_comprado_cents: await somarComprasDoFornecedor(admin, organizationId, supplierId),
        })
        .eq("organization_id", organizationId)
        .eq("id", supplierId);
    }

    const nsuFinal = nsuSeguro({
      ultNsu: resultado.ultNSU,
      nsuInicial,
      persistidos,
      falhou,
    });
    const espera656 = resultado.aviso === "AGUARDAR_1H" || resultado.cstat === "656";
    const proximaTentativa = espera656 ? new Date(agora().getTime() + BACKOFF_656_MS).toISOString() : null;

    await admin
      .from("fiscal_entrada_cursor")
      .update({
        ult_nsu: nsuFinal,
        max_nsu: resultado.maxNSU,
        ultimo_erro: primeiraFalha?.slice(0, 500) ?? null,
        proxima_tentativa: proximaTentativa,
        atualizado_em: agora().toISOString(),
      })
      .eq("organization_id", organizationId);

    await admin
      .from("fiscal_settings")
      .update({
        ultima_sincronizacao: agora().toISOString(),
        ultimo_cstat: resultado.cstat,
        ultimo_motivo: resultado.aviso ?? primeiraFalha ?? "ok",
      })
      .eq("organization_id", organizationId);

    const resultadoFinal = falhou ? "erro" : documentos.length === 0 ? "vazio" : "sucesso";
    await finalizarLog({
      resultado: resultadoFinal,
      nsu_inicial: nsuInicial,
      nsu_final: nsuFinal,
      max_nsu: resultado.maxNSU,
      docs_encontrados: documentos.length,
      docs_importados: importados,
      docs_erro: erros,
      cstat: resultado.cstat,
      mensagem: primeiraFalha ?? resultado.aviso ?? "ok",
    });

    return {
      ok: !falhou,
      bloqueado: false,
      codigo: falhou ? "upstream" : null,
      motivo: primeiraFalha,
      nsuInicial,
      nsuFinal,
      maxNsu: resultado.maxNSU,
      encontrados: documentos.length,
      importados,
      atualizados,
      erros,
      cstat: resultado.cstat,
      aviso: resultado.aviso,
      proximaTentativa,
    };
  } finally {
    await liberarCursor(admin, organizationId, dono);
  }
}
