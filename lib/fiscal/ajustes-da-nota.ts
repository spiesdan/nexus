/**
 * A CORREÇÃO DA NOTA — editar o documento antes de ele sair de novo.
 *
 * ─── Por que isto existe ────────────────────────────────────────────────────
 *
 * Medido em 05/11/2026, em produção: uma nota parou com
 * `[SEFAZ_232] IE do destinatário não informada`. A IE existia na Receita, mas
 * não no cadastro do contato; para emitir, alguém teve de sair da tela de
 * notas, achar o cliente, abrir a ficha, preencher a IE e voltar. No meio do
 * caminho, a nota ficou "com erro" — e o operador não tinha, na tela onde o
 * erro aparece, nada para fazer com ele.
 *
 * Os ERPs que a operação já usa (Odivix) deixam editar a nota rejeitada ali
 * mesmo. Isto é essa tela, com uma diferença de desenho: o ajuste vai para a
 * NOTA (jsonb `invoices.extras_fiscais`), que é o documento, e não reescreve
 * o catálogo por baixo. As duas exceções são cadastro puro — IE e endereço do
 * cliente — e nelas a tela oferece gravar também no contato, porque o erro de
 * hoje é a nota de amanhã.
 *
 * ─── O que o drain lê, e por que a nota manda ──────────────────────────────
 *
 * `processarJob` monta o payload a cada tentativa: destinatário do cadastro,
 * itens do pedido + NCM do produto. Este módulo grava o ajuste na nota, e o
 * drain aplica o ajuste POR CIMA — a nota rejeitada continua sendo a mesma
 * nota, com o mesmo número reservado, e a correção vale para ela.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import type {
  AjusteDaNota,
  AjusteDoDestinatario,
  AjusteDoItem,
  ExtrasFiscais,
} from "@/lib/schemas/fiscal";

import {
  aplicarAjusteNoContato,
  ajusteMexeNoEndereco,
  COLUNAS_DO_CONTATO_FISCAL,
  montarDestinatario,
  type ContatoFiscal,
  type DestinatarioDaNota,
  type PedidoParaDestinatario,
} from "./destinatario-da-nota";
import { podeTransitar } from "./fila";
import { resolverProdutosDosItens } from "./produto-do-item";

/** Estados em que a nota ainda pode ser corrigida: o documento não saiu. */
export const STATUS_EDITAVEIS = ["erro", "pendente"] as const;

export function notaEditavel(status: string): boolean {
  return (STATUS_EDITAVEIS as readonly string[]).includes(status);
}

// ─── Itens ───────────────────────────────────────────────────────────────────

/** Um item como o drain o vê: pedido + cadastro do produto + ajuste da nota. */
export interface ItemDaNota {
  order_item_id: string;
  codigo: string;
  descricao: string;
  ncm: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number;
  preco_cents: number;
  desconto_pct: number;
}

/**
 * Aplica os ajustes da nota sobre os itens, casando por `order_item_id`.
 *
 * Item sem ajuste fica intacto — a correção de um NCM não pode mexer no item
 * vizinho, e é isso que um merge por índice faria no dia em que a ordem da
 * consulta mudasse.
 */
export function aplicarAjusteNosItens(
  itens: ItemDaNota[],
  ajustes: AjusteDoItem[] | null | undefined,
): ItemDaNota[] {
  if (!ajustes || ajustes.length === 0) return itens;
  const porId = new Map(ajustes.map((a) => [a.order_item_id, a]));
  return itens.map((item) => {
    const ajuste = porId.get(item.order_item_id);
    if (!ajuste) return item;
    return {
      ...item,
      descricao: ajuste.descricao ?? item.descricao,
      ncm: ajuste.ncm ?? item.ncm,
      cfop: ajuste.cfop ?? item.cfop,
      unidade: ajuste.unidade ?? item.unidade,
    };
  });
}

// ─── O quadro que a tela edita ───────────────────────────────────────────────

export interface ItemDoQuadro extends ItemDaNota {
  /** O NCM que veio do cadastro do produto (antes de qualquer ajuste). */
  ncm_do_cadastro: string | null;
  cfop_do_cadastro: string | null;
  unidade_do_cadastro: string | null;
  ajustado: boolean;
}

export interface QuadroDaNota {
  id: string;
  serie: string;
  numero: number | null;
  status: string;
  erro: string | null;
  sefaz_cstat: string | null;
  /** `false` = a nota não está em estado corrigível; a tela só mostra. */
  editavel: boolean;
  motivo_da_trava: string | null;
  contact_id: string | null;
  destinatario: DestinatarioDaNota;
  /** O cadastro como ele está HOJE (já com o ajuste aplicado), para o formulário. */
  contato: {
    nome: string;
    documento: string | null;
    ie: string | null;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
    cep: string;
  };
  itens: ItemDoQuadro[];
  adicionais: NonNullable<ExtrasFiscais["adicionais"]>;
  /** O que já está gravado como ajuste desta nota (null = nada). */
  ajuste: { destinatario: AjusteDoDestinatario | null; itens: AjusteDoItem[] };
}

type NotaLida = {
  id: string;
  serie: string;
  numero: number | null;
  status: string;
  erro: string | null;
  sefaz_cstat: string | null;
  order_id: string | null;
  extras_fiscais: ExtrasFiscais | null;
};

type PedidoLido = PedidoParaDestinatario & {
  id: string;
  numero: number;
  frete_cents: number | null;
};

/**
 * Lê tudo o que a tela de correção mostra — com o MESMO resolvedor da emissão.
 *
 * A tela não pode recalcular por conta própria o que o drain vai montar: se
 * ela mostrasse "IE 123" e o payload saísse sem IE, a correção seria uma
 * mentira bem-intencionada. Por isso o destinatário vem de
 * `montarDestinatario` e os itens, de `aplicarAjusteNosItens`.
 */
export async function carregarQuadroDaNota(
  supabase: SupabaseClient,
  orgId: string,
  invoiceId: string,
  requestId: string,
): Promise<QuadroDaNota> {
  const { data: notaDb } = await supabase
    .from("invoices")
    .select("id, serie, numero, status, erro, sefaz_cstat, order_id, extras_fiscais")
    .eq("organization_id", orgId)
    .eq("id", invoiceId)
    .maybeSingle();
  const nota = notaDb as unknown as NotaLida | null;
  if (!nota) throw new ApiError(404, "not_found", { requestId }, requestId, "Nota não encontrada.");
  const pedido = nota.order_id
    ? (((
        await supabase
          .from("commercial_orders")
          .select("id, numero, cliente_nome, cliente_documento, contact_id, frete_cents")
          .eq("organization_id", orgId)
          .eq("id", nota.order_id)
          .maybeSingle()
      ).data ?? null) as unknown as PedidoLido | null)
    : null;

  const { data: contatoDb } = pedido?.contact_id
    ? await supabase
        .from("contacts")
        .select(COLUNAS_DO_CONTATO_FISCAL)
        .eq("organization_id", orgId)
        .eq("id", pedido.contact_id)
        .maybeSingle()
    : { data: null };
  const contato = (contatoDb as unknown as ContatoFiscal | null) ?? null;

  const ajusteGravado = nota.extras_fiscais ?? {};
  const destinatario = montarDestinatario(
    pedido ?? {},
    contato,
    ajusteGravado.destinatario,
  );
  const contatoEfetivo = aplicarAjusteNoContato(contato, ajusteGravado.destinatario);

  // Os pedidos da nota (agrupamento) ou só o principal, como o drain faz.
  const { data: vinculos } = await supabase
    .from("invoice_orders")
    .select("order_id")
    .eq("organization_id", orgId)
    .eq("invoice_id", invoiceId);
  const idsDosPedidos = (vinculos ?? []).length
    ? (vinculos as unknown as { order_id: string }[]).map((v) => v.order_id)
    : nota.order_id
      ? [nota.order_id]
      : [];

  const { data: itensDb } = idsDosPedidos.length
    ? await supabase
        .from("commercial_order_items")
        .select(
          "id, produto_codigo, produto_nome, quantidade, preco_unit_cents, desconto_pct, product_id",
        )
        .in("order_id", idsDosPedidos)
        .eq("organization_id", orgId)
        .order("posicao")
    : { data: [] };
  const brutos = (itensDb ?? []) as unknown as {
    id: string;
    produto_codigo: string;
    produto_nome: string;
    quantidade: number;
    preco_unit_cents: number;
    desconto_pct: number | string;
    product_id: string | null;
  }[];

  // Mesmo resolvedor do drain: vínculo explícito → código → nome. O quadro
  // mostra o que a emissão VAI usar; se aqui dissesse "sem NCM" e o drain
  // achasse o NCM pelo cadastro, a tela mentiria contra o documento.
  const produtosDosItens = await resolverProdutosDosItens(supabase, orgId, brutos);

  const doCadastro: ItemDaNota[] = brutos.map((i, pos) => {
    const fiscal = produtosDosItens[pos];
    return {
      order_item_id: i.id,
      codigo: i.produto_codigo,
      descricao: i.produto_nome,
      ncm: fiscal?.ncm ?? null,
      cfop: fiscal?.cfop ?? null,
      unidade: fiscal?.unidade ?? null,
      quantidade: i.quantidade,
      preco_cents: i.preco_unit_cents,
      desconto_pct: Number(i.desconto_pct) || 0,
    };
  });
  const ajustesDeItem = ajusteGravado.itens ?? [];
  const idsAjustados = new Set(ajustesDeItem.map((a) => a.order_item_id));
  const itens: ItemDoQuadro[] = aplicarAjusteNosItens(doCadastro, ajustesDeItem).map(
    (item, pos) => ({
      ...item,
      ncm_do_cadastro: doCadastro[pos]!.ncm,
      cfop_do_cadastro: doCadastro[pos]!.cfop,
      unidade_do_cadastro: doCadastro[pos]!.unidade,
      ajustado: idsAjustados.has(item.order_item_id),
    }),
  );

  return {
    id: nota.id,
    serie: nota.serie,
    numero: nota.numero,
    status: nota.status,
    erro: nota.erro,
    sefaz_cstat: nota.sefaz_cstat,
    editavel: notaEditavel(nota.status),
    motivo_da_trava: notaEditavel(nota.status)
      ? null
      : `Nota ${nota.status} não aceita correção — o documento já saiu (ou foi encerrado).`,
    contact_id: pedido?.contact_id ?? null,
    destinatario,
    contato: {
      // O nome do formulário é o MESMO `<xNome>` que o XML vai levar — vem de
      // `montarDestinatario`, não de uma segunda leitura da ficha. Remontar
      // aqui a cadeia de fallback do contato criaria a sétima cópia que
      // `tests/unit/rotulo-do-contato.test.ts` existe para impedir (e seria
      // pior: o rótulo de contato aceita telefone, e telefone não é razão
      // social em documento fiscal).
      nome: destinatario.nome,
      documento: destinatario.documento,
      ie: contatoEfetivo?.ie ?? null,
      logradouro: contatoEfetivo?.logradouro?.trim() ?? "",
      numero: contatoEfetivo?.numero_end?.trim() ?? "",
      complemento: contatoEfetivo?.complemento?.trim() ?? "",
      bairro: contatoEfetivo?.bairro?.trim() ?? "",
      cidade: contatoEfetivo?.cidade?.trim() ?? "",
      uf: (contatoEfetivo?.uf ?? "").trim().toUpperCase(),
      cep: (contatoEfetivo?.cep ?? "").replace(/\D/g, ""),
    },
    itens,
    adicionais: ajusteGravado.adicionais ?? {},
    ajuste: {
      destinatario: ajusteGravado.destinatario ?? null,
      itens: ajustesDeItem,
    },
  };
}

// ─── Gravar a correção ───────────────────────────────────────────────────────

const ROTULO_DO_CAMPO: Record<keyof AjusteDoDestinatario, string> = {
  nome: "nome",
  documento: "CPF/CNPJ",
  ie: "IE",
  logradouro: "logradouro",
  numero: "número",
  complemento: "complemento",
  bairro: "bairro",
  cidade: "município",
  uf: "UF",
  cep: "CEP",
};

const ROTULO_DO_ITEM: Record<"descricao" | "ncm" | "cfop" | "unidade", string> = {
  descricao: "descrição",
  ncm: "NCM",
  cfop: "CFOP",
  unidade: "unidade",
};

/** Texto para a timeline — nomeia o que mudou, não "ajustes salvos". */
export function descreverAjuste(ajuste: AjusteDaNota): string {
  const partes: string[] = [];
  if (ajuste.destinatario) {
    const campos = (Object.keys(ajuste.destinatario) as (keyof AjusteDoDestinatario)[])
      .filter((k) => ajuste.destinatario?.[k] !== undefined)
      .map((k) => ROTULO_DO_CAMPO[k]);
    if (campos.length > 0) partes.push(`destinatário: ${campos.join(", ")}`);
  }
  if (ajuste.itens && ajuste.itens.length > 0) {
    const campos = new Set<string>();
    for (const item of ajuste.itens) {
      for (const chave of ["descricao", "ncm", "cfop", "unidade"] as const) {
        if (item[chave] !== undefined) campos.add(ROTULO_DO_ITEM[chave]);
      }
    }
    partes.push(
      `${ajuste.itens.length === 1 ? "1 item" : `${ajuste.itens.length} itens`}: ${[...campos].join(", ")}`,
    );
  }
  if (ajuste.adicionais) {
    if (ajuste.adicionais.informacoes_complementares !== undefined) {
      partes.push("informações complementares");
    }
    if (ajuste.adicionais.informacoes_fisco !== undefined) partes.push("informações ao Fisco");
  }
  return partes.join(" · ");
}

export interface ResultadoDoAjuste {
  id: string;
  status: string;
  reenviado: boolean;
  cadastro_atualizado: boolean;
  descricao: string;
}

/**
 * Grava a correção na nota e, opcionalmente, no cadastro do cliente.
 *
 * Só nota `erro`/`pendente`: `autorizada` é história fiscal (muda por carta de
 * correção ou cancelamento), e `em_emissao` pode estar na SEFAZ agora — gravar
 * no meio de uma transmissão seria corrigir o documento errado.
 */
export async function salvarAjustesDaNota(input: {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  orgId: string;
  userId: string;
  requestId: string;
  invoiceId: string;
  ajuste: AjusteDaNota;
}): Promise<ResultadoDoAjuste> {
  const { supabase, admin, orgId, userId, requestId, invoiceId, ajuste } = input;

  const { data: notaDb } = await supabase
    .from("invoices")
    .select("id, status, order_id, extras_fiscais")
    .eq("organization_id", orgId)
    .eq("id", invoiceId)
    .maybeSingle();
  const nota = notaDb as unknown as
    | { id: string; status: string; order_id: string | null; extras_fiscais: ExtrasFiscais | null }
    | null;
  if (!nota) throw new ApiError(404, "not_found", { requestId }, requestId, "Nota não encontrada.");
  if (!notaEditavel(nota.status)) {
    throw new ApiError(
      422,
      "validation_failed",
      { requestId },
      requestId,
      `Nota ${nota.status} não aceita correção. Para uma nota autorizada, use carta de correção ou cancelamento.`,
    );
  }

  const extrasAnterior: ExtrasFiscais = nota.extras_fiscais ?? {};
  const novoExtras: ExtrasFiscais = { ...extrasAnterior };

  // ── Destinatário ──────────────────────────────────────────────────────────
  if (ajuste.destinatario) {
    novoExtras.destinatario = { ...(extrasAnterior.destinatario ?? {}), ...ajuste.destinatario };

    // O endereço da nota é um SNAPSHOT (`extras.entrega`) gravado na emissão —
    // corrigir o cadastro sozinho não mudaria o XML. Quando o ajuste mexe em
    // endereço, o snapshot é refeito com o mesmo resolvedor da emissão.
    if (ajusteMexeNoEndereco(ajuste.destinatario)) {
      const pedido = nota.order_id
        ? ((
            await supabase
              .from("commercial_orders")
              .select("id, cliente_nome, cliente_documento, contact_id")
              .eq("organization_id", orgId)
              .eq("id", nota.order_id)
              .maybeSingle()
          ).data ?? null)
        : null;
      const { data: contatoDb } = (pedido as unknown as { contact_id: string | null } | null)
        ?.contact_id
        ? await supabase
            .from("contacts")
            .select(COLUNAS_DO_CONTATO_FISCAL)
            .eq("organization_id", orgId)
            .eq(
              "id",
              (pedido as unknown as { contact_id: string }).contact_id,
            )
            .maybeSingle()
        : { data: null };
      const destino = montarDestinatario(
        (pedido as unknown as PedidoParaDestinatario | null) ?? {},
        contatoDb as unknown as ContatoFiscal | null,
        novoExtras.destinatario,
      );
      if (destino.entrega) novoExtras.entrega = destino.entrega;
    }
  }

  // ── Itens ─────────────────────────────────────────────────────────────────
  if (ajuste.itens && ajuste.itens.length > 0) {
    const porId = new Map(
      (extrasAnterior.itens ?? []).map((i) => [i.order_item_id, i] as const),
    );
    for (const item of ajuste.itens) {
      porId.set(item.order_item_id, { ...(porId.get(item.order_item_id) ?? {}), ...item });
    }
    novoExtras.itens = [...porId.values()];
  }

  // ── Informações complementares ────────────────────────────────────────────
  if (ajuste.adicionais) {
    novoExtras.adicionais = { ...(extrasAnterior.adicionais ?? {}), ...ajuste.adicionais };
  }

  const { error: erroExtras } = await supabase
    .from("invoices")
    .update({ extras_fiscais: novoExtras, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("id", invoiceId);
  if (erroExtras) {
    logger.error("fiscal: falha ao gravar a correção da nota", {
      invoice_id: invoiceId,
      organization_id: orgId,
      erro: erroExtras.message.slice(0, 300),
    });
    throw new ApiError(500, "internal_error", { requestId }, requestId, "Não foi possível salvar a correção.");
  }

  // ── Cadastro do cliente ───────────────────────────────────────────────────
  //
  // IE e endereço são fatos do cadastro: gravar só na nota resolveria hoje e
  // deixaria a próxima nota com o mesmo defeito. `documento` só entra no
  // cadastro quando é CNPJ — a coluna `contacts.cnpj` valida CNPJ, e escrever
  // CPF ali deixaria a ficha do cliente impossível de salvar depois. CPF vive
  // no ajuste da nota.
  let cadastroAtualizado = false;
  if (ajuste.aplicar_no_cadastro && ajuste.destinatario && nota.order_id) {
    const { data: pedidoDb } = await supabase
      .from("commercial_orders")
      .select("contact_id")
      .eq("organization_id", orgId)
      .eq("id", nota.order_id)
      .maybeSingle();
    const contactId = (pedidoDb as unknown as { contact_id: string | null } | null)?.contact_id;
    if (contactId) {
      const campos: Record<string, string | null> = {};
      const d = ajuste.destinatario;
      if (d.nome !== undefined) campos.name = d.nome;
      if (d.ie !== undefined) campos.ie = d.ie === "" ? null : d.ie;
      if (d.documento !== undefined && d.documento.length === 14) campos.cnpj = d.documento;
      if (d.logradouro !== undefined) campos.logradouro = d.logradouro;
      if (d.numero !== undefined) campos.numero_end = d.numero;
      if (d.complemento !== undefined) campos.complemento = d.complemento;
      if (d.bairro !== undefined) campos.bairro = d.bairro;
      if (d.cidade !== undefined) campos.cidade = d.cidade;
      if (d.uf !== undefined) campos.uf = d.uf;
      if (d.cep !== undefined) campos.cep = d.cep;
      if (Object.keys(campos).length > 0) {
        const { error: erroContato } = await supabase
          .from("contacts")
          .update({ ...campos, updated_at: new Date().toISOString() })
          .eq("organization_id", orgId)
          .eq("id", contactId);
        // O cadastro é o segundo passo de propósito: se ele falhar, a nota
        // ainda está corrigida. Falhar aqui não pode desfazer o que já foi
        // gravado nem esconder a correção de quem está com a nota parada.
        if (erroContato) {
          logger.error("fiscal: correção da nota não chegou ao cadastro do cliente", {
            invoice_id: invoiceId,
            organization_id: orgId,
            contact_id: contactId,
            erro: erroContato.message.slice(0, 300),
          });
        } else {
          cadastroAtualizado = true;
        }
      }
    }
  }

  // ── Reenviar, se pedido ───────────────────────────────────────────────────
  let status = nota.status;
  let reenviado = false;
  if (ajuste.reenviar) {
    if (!podeTransitar(nota.status, "em_emissao")) {
      throw new ApiError(
        422,
        "validation_failed",
        { requestId },
        requestId,
        `Nota ${nota.status} não pode voltar para emissão.`,
      );
    }
    const { error: erroJob } = await supabase.from("fiscal_jobs").insert({
      organization_id: orgId,
      invoice_id: invoiceId,
      tipo: "emitir",
      status: "pendente",
      created_by: userId,
    });
    // Job aberto (duplo clique): reaproveita em vez de falhar.
    if (erroJob && erroJob.code !== "23505") {
      throw new ApiError(500, "internal_error", { requestId }, requestId, "Erro ao enfileirar a nota.");
    }
    const { error: erroStatus } = await supabase
      .from("invoices")
      .update({ status: "em_emissao", erro: null, updated_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .eq("id", invoiceId);
    if (erroStatus) {
      throw new ApiError(500, "internal_error", { requestId }, requestId, "Erro ao reabrir a nota.");
    }
    status = "em_emissao";
    reenviado = true;
  }

  // ── O registro que a tela lê ──────────────────────────────────────────────
  //
  // Sem isto a correção é invisível: quem abre a nota amanhã vê o XML certo e
  // não sabe que ele foi corrigido à mão — nem por quem. `fiscal_events` é
  // escrita de service role (`authenticated` só lê).
  const descricao = descreverAjuste(ajuste);
  const mensagem = [
    descricao ? `Correção: ${descricao}.` : "Correção da nota.",
    cadastroAtualizado ? "Cadastro do cliente atualizado." : "",
    reenviado ? "Devolvida para a fila de emissão." : "",
  ]
    .filter(Boolean)
    .join(" ");
  const { error: erroEvento } = await admin.from("fiscal_events").insert({
    organization_id: orgId,
    invoice_id: invoiceId,
    tipo: "ajuste",
    status,
    mensagem: mensagem.slice(0, 2000),
  });
  if (erroEvento) {
    logger.error("fiscal: correção gravada mas o evento não", {
      invoice_id: invoiceId,
      organization_id: orgId,
      erro: erroEvento.message.slice(0, 300),
    });
  }

  await audit({
    organizationId: orgId,
    actorUserId: userId,
    action: "invoice.adjusted",
    resourceType: "invoices",
    resourceId: invoiceId,
    requestId,
    metadata: { descricao, reenviado, cadastro_atualizado: cadastroAtualizado },
  });

  return {
    id: invoiceId,
    status,
    reenviado,
    cadastro_atualizado: cadastroAtualizado,
    descricao: mensagem,
  };
}
