/**
 * POST /api/v1/fiscal-entradas/[id]/importar — vira estoque + contas a pagar.
 *
 * Pré-requisito: XML completo (só existe após manifestar). Cada lado é
 * idempotente sozinho: re-clique encontra `estoque_processado_em` /
 * `financeiro_processado_em` e não duplica — a trava da parcela
 * (org, entrada, parcela_n) cobre o retry no meio do caminho.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ajustarEstoque } from "@/lib/estoque/ajustar";
import { reivindicarLadoDaImportacao } from "@/lib/fiscal/importacao-da-entrada";
import { logger } from "@/lib/logger";
import {
  COLUNAS_DA_ENTRADA,
  type DuplicataEntrada,
  type EntradaFiscal,
  type ItemEntrada,
} from "@/lib/schemas/fiscal-entrada";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(v: string | undefined, queda: string): string {
  if (v && DATA.test(v)) return v;
  return queda;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  // Estoque + dinheiro: decisão gerencial, mesmo piso das recebíveis.
  const authz = await requireRole("manager", { requestId, resource: "fiscal-entradas" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  const supabase = await createClient();
  const { data: linha } = await supabase
    .from("fiscal_entradas")
    .select(COLUNAS_DA_ENTRADA)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const entrada = linha as unknown as EntradaFiscal | null;
  if (!entrada) return fail("not_found", "Entrada não encontrada.", 404, { requestId });
  if (entrada.status === "importada" && entrada.estoque_processado_em && entrada.financeiro_processado_em) {
    return ok({ importada: true, repetida: true }, { requestId });
  }
  if (entrada.status === "ignorada") {
    return fail("invalid_state_transition", "Entrada ignorada — não há o que importar.", 409, { requestId });
  }
  // Spec 21 §9/§14: estoque e cadastro de produto só se movem com conferência
  // aprovada. O gate fica ANTES do XML porque a mensagem certa é "aprove", não
  // "manifeste" — e porque aprovar exige XML (a rota de conferência garante).
  if (entrada.conferencia_status !== "aprovada") {
    return fail(
      "invalid_state_transition",
      "Conferência pendente — aprove a nota em Pendentes de Conferência antes de mover estoque e gerar contas a pagar.",
      409,
      { requestId },
    );
  }
  if (!entrada.xml || !Array.isArray(entrada.itens_json) || entrada.itens_json.length === 0) {
    return fail(
      "validation_failed",
      "Sem XML completo — manifeste a nota e sincronize de novo para liberar os itens.",
      422,
      { requestId },
    );
  }
  const itens = entrada.itens_json as ItemEntrada[];
  const cobranca = (Array.isArray(entrada.cobranca_json) ? entrada.cobranca_json : []) as DuplicataEntrada[];

  // A associação feita na tela de detalhe vence o casamento por código. O
  // `numero_item` gravado por `gravarItens` é o índice do item no XML + 1 —
  // a mesma posição que este laço percorre.
  const { data: itensGravados } = await supabase
    .from("fiscal_document_items")
    .select("id, numero_item, produto_id")
    .eq("organization_id", authz.org.orgId)
    .eq("entrada_id", id);
  const porNumero = new Map(
    (
      (itensGravados ?? []) as unknown as {
        id: string;
        numero_item: number;
        produto_id: string | null;
      }[]
    ).map((linha) => [linha.numero_item, linha]),
  );

  // Fornecedor: reusa o contato do CNPJ quando existe; sem telefone não dá
  // para criar contato — o pagável carrega o snapshot (nome/CNPJ) na linha.
  let contactId: string | null = entrada.contact_id;
  if (!contactId && entrada.emitente_cnpj) {
    const { data: contato } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", authz.org.orgId)
      .eq("cnpj", entrada.emitente_cnpj.replace(/\D/g, ""))
      .maybeSingle();
    contactId = (contato as unknown as { id: string } | null)?.id ?? null;
  }

  // Cada lado é reivindicado por CAS antes de tocar em qualquer coisa: dois
  // POSTs concorrentes não somam o mesmo estoque duas vezes. Quem perde a
  // reivindicação e encontra o lado ainda em andamento recebe 409 — nunca um
  // falso "importada".
  const avisos: string[] = [];
  let estoqueReivindicado = false;
  if (!entrada.estoque_processado_em) {
    const reivindicacao = await reivindicarLadoDaImportacao(supabase, {
      orgId: authz.org.orgId,
      entradaId: id,
      lado: "estoque",
    });
    if (reivindicacao.estado === "erro") {
      return fail("internal_error", "Erro ao reivindicar a importação do estoque.", 500, { requestId });
    }
    if (reivindicacao.estado === "em_andamento") {
      return fail(
        "state_conflict",
        "Importação desta entrada em andamento — aguarde e recarregue.",
        409,
        { requestId },
      );
    }
    estoqueReivindicado = reivindicacao.estado === "reivindicado";
  }

  let produtosTocados = 0;
  if (estoqueReivindicado) {
    for (const [indice, item] of itens.entries()) {
      const codigo = (item.codigo || "").trim();
      const qtd = Math.round(Number(item.quantidade) || 0);
      const vinculo = porNumero.get(indice + 1);
      type ProdutoDoCatalogo = { id: string; quantidade: number; controla_estoque: boolean };

      // 1º: o que a pessoa associou na conferência. Vale mesmo sem código —
      // é o caso do item cujo código do fornecedor não existe no catálogo.
      let achado: ProdutoDoCatalogo | null = null;
      if (vinculo?.produto_id) {
        const { data: prod } = await supabase
          .from("catalog_products")
          .select("id, quantidade, controla_estoque")
          .eq("organization_id", authz.org.orgId)
          .eq("id", vinculo.produto_id)
          .maybeSingle();
        achado = prod as unknown as ProdutoDoCatalogo | null;
      }

      // 2º: casamento por código, como antes. Só entra quando não há
      // associação (ou quando o produto associado deixou de existir).
      if (!achado && codigo !== "") {
        const { data: prod } = await supabase
          .from("catalog_products")
          .select("id, quantidade, controla_estoque")
          .eq("organization_id", authz.org.orgId)
          .eq("codigo", codigo)
          .maybeSingle();
        achado = prod as unknown as ProdutoDoCatalogo | null;
        // Casou por código: registra o vínculo para a próxima importação e
        // para a tela não continuar dizendo "não associado".
        if (achado && vinculo && !vinculo.produto_id) {
          await supabase
            .from("fiscal_document_items")
            .update({ produto_id: achado.id, associado_em: new Date().toISOString() })
            .eq("organization_id", authz.org.orgId)
            .eq("id", vinculo.id);
        }
      }

      if (achado) {
        // Estoque fracionado (kg, metro) arredonda: a coluna é inteira.
        //
        // A soma passa por `ajustarEstoque` (compare-and-swap), não por
        // `quantidade lida + qtd`: outra entrada/pedido pode mexer no mesmo
        // produto entre a leitura e a escrita, e o UPDATE absoluto apagaria a
        // movimentação alheia. O CAS relê e tenta de novo.
        if (qtd !== 0) {
          const ajuste = await ajustarEstoque(supabase, {
            organizationId: authz.org.orgId,
            productId: achado.id,
            delta: qtd,
            permitirNegativo: true,
          });
          if (!ajuste.ok) {
            const aviso = `Estoque de ${codigo || achado.id} não movimentado (${ajuste.motivo}).`;
            avisos.push(aviso);
            logger.error("[fiscal-entradas.importar] ajuste de estoque falhou", {
              organization_id: authz.org.orgId,
              entrada_id: id,
              product_id: achado.id,
              motivo: ajuste.motivo,
            });
          }
        }
      } else if (codigo !== "") {
        // Produto novo: nasce do XML — custo = o que pagamos ao fornecedor.
        const { data: criado } = await supabase
          .from("catalog_products")
          .insert({
            organization_id: authz.org.orgId,
            codigo,
            nome: (item.descricao || codigo).slice(0, 200),
            preco_cents: Math.max(0, item.preco_cents || 0),
            custo_cents: Math.max(0, item.preco_cents || 0),
            moeda: "BRL",
            controla_estoque: true,
            quantidade: Math.max(0, qtd),
            ativo: true,
            origem: "nfe_entrada",
            ncm: item.ncm || null,
            unidade: item.unidade || "UN",
            cfop: item.cfop || null,
          })
          .select("id")
          .single();
        const novoId = (criado as unknown as { id: string } | null)?.id;
        if (novoId && vinculo && !vinculo.produto_id) {
          await supabase
            .from("fiscal_document_items")
            .update({ produto_id: novoId, associado_em: new Date().toISOString() })
            .eq("organization_id", authz.org.orgId)
            .eq("id", vinculo.id);
        }
      } else {
        // Sem código e sem associação: não há como identificar o produto.
        continue;
      }
      produtosTocados++;
    }
    // O flag do estoque já foi gravado pela reivindicação (CAS). Aqui só fica
    // o contato do fornecedor, que não participa da trava.
    await supabase
      .from("fiscal_entradas")
      .update({ contact_id: contactId })
      .eq("id", id)
      .eq("organization_id", authz.org.orgId);
  }

  let financeiroReivindicado = false;
  let financeiroConcluido = !!entrada.financeiro_processado_em;
  if (!entrada.financeiro_processado_em) {
    const reivindicacao = await reivindicarLadoDaImportacao(supabase, {
      orgId: authz.org.orgId,
      entradaId: id,
      lado: "financeiro",
    });
    if (reivindicacao.estado === "erro") {
      return fail("internal_error", "Erro ao reivindicar a importação do financeiro.", 500, { requestId });
    }
    if (reivindicacao.estado === "em_andamento") {
      return fail(
        "state_conflict",
        "Importação desta entrada em andamento — aguarde e recarregue.",
        409,
        { requestId },
      );
    }
    financeiroReivindicado = reivindicacao.estado === "reivindicado";
    financeiroConcluido =
      reivindicacao.estado === "reivindicado" || reivindicacao.estado === "ja_processado";
  }

  let parcelasGeradas = 0;
  if (financeiroReivindicado) {
    const { data: ja } = await supabase
      .from("financial_pagaveis")
      .select("parcela_n")
      .eq("organization_id", authz.org.orgId)
      .eq("entrada_id", id);
    const feitas = new Set(((ja ?? []) as unknown as { parcela_n: number }[]).map((p) => p.parcela_n));
    const hoje = new Date().toISOString().slice(0, 10);
    const emissao = (entrada.dh_emi ?? "").slice(0, 10);
    const dups = cobranca.filter((d) => (d.valor_cents || 0) > 0);
    const parcelas: { n: number; total: number; valor: number; venc: string }[] =
      dups.length > 0
        ? dups.map((d, i) => ({
            n: i + 1,
            total: dups.length,
            valor: d.valor_cents,
            venc: dataValida(d.vencimento, DATA.test(emissao) ? emissao : hoje),
          }))
        : // Sem duplicata, à vista implícito: 1 parcela vencendo na emissão.
          [{ n: 1, total: 1, valor: entrada.valor_total_cents, venc: DATA.test(emissao) ? emissao : hoje }];
    for (const p of parcelas) {
      if (feitas.has(p.n)) continue;
      const { error } = await supabase.from("financial_pagaveis").insert({
        organization_id: authz.org.orgId,
        entrada_id: id,
        contact_id: contactId,
        fornecedor_nome: entrada.emitente_nome,
        fornecedor_cnpj: entrada.emitente_cnpj,
        parcela_n: p.n,
        total_parcelas: p.total,
        valor_original_cents: p.valor,
        vencimento: p.venc,
        status: "aberto",
        observacoes: `NF ${entrada.numero ?? "?"}${entrada.serie ? `/${entrada.serie}` : ""} · chave ${entrada.chave}`,
        created_by: authz.user.id,
      });
      if (!error) {
        parcelasGeradas++;
        await audit({
          organizationId: authz.org.orgId,
          actorUserId: authz.user.id,
          action: "pagavel.created",
          resourceType: "financial_pagaveis",
          resourceId: id,
          requestId,
        });
      } else if (error.code !== "23505") {
        // 23505 = retry da mesma parcela (unique org+entrada+parcela_n):
        // conta como existente. Qualquer outro erro é dinheiro que não nasceu.
        const aviso = `Parcela ${p.n} não gerada (${error.code ?? "erro"}).`;
        avisos.push(aviso);
        logger.error("[fiscal-entradas.importar] pagável não criado", {
          organization_id: authz.org.orgId,
          entrada_id: id,
          parcela: p.n,
          erro: error.message.slice(0, 300),
        });
      }
    }
  }

  // `importada` só depois do financeiro: estoque movido sem contas a pagar
  // continua "manifestada" e a conciliação cobra a outra metade.
  if (financeiroConcluido) {
    await supabase
      .from("fiscal_entradas")
      .update({ status: "importada" })
      .eq("id", id)
      .eq("organization_id", authz.org.orgId);
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fiscal_entrada.importada",
    resourceType: "fiscal_entradas",
    resourceId: id,
    requestId,
  });

  return ok(
    {
      importada: true,
      produtosTocados,
      parcelasGeradas,
      ...(avisos.length > 0 ? { avisos } : {}),
    },
    { requestId, status: 201 },
  );
}
