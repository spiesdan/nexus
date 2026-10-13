/**
 * APLICAR UM PATCH DE ITENS — adicionar, remover, ajustar.
 *
 * ═══ POR QUE PATCH E NÃO TROCA ════════════════════════════════════════════
 *
 * O `ajustar` chega com o **id** do item. Trocar o conjunto inteiro (DELETE +
 * INSERT) criaria ids novos e deixaria o `ajustar` da tela apontando para o
 * nada — e qualquer coisa que guarde o id do item (faturação, expedição) fica
 * órfã. Patch mantém a identidade da linha e muda o que mudou.
 *
 * ═══ A REGRA DE STATUS: POR QUE ESTE ARQUIVO NÃO RECUSA PEDIDO PRONTO ═════
 *
 * O contrato antigo desta rota era "só rascunho/em_analise", e havia teste
 * para isso. O dono pediu para poder corrigir o pedido **depois de pronto** —
 * que é exatamente aquela regra.
 *
 * Aqui a decisão é: **não recusa, e avisa**. E a razão é a doutrina do
 * projeto, não molesura: a regra de negócio do que acontece com comissão
 * apurada, expedição e NF emitida **não está escrita neste repositório**, e
 * inventá-la aqui seria fabricar política comercial e fiscal com base em
 * palpite. O que este código faz é gravar a troca, registrar o antes e o
 * depois, e devolver os avisos para que a tela e quem opera decidam.
 *
 * Se um dia essa regra existir, ela entra aqui — com nome, com migration se
 * precisar de coluna, e com teste que a nomeie.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { subtotalDoItem, type ItensPatch } from "@/lib/schemas/pedidos";

export interface ResultadoDoPatch {
  ok: boolean;
  motivo?: "nao_encontrado" | "item_desconhecido" | "produto_desconhecido";
  /** Índice (base 0) do item adicionado cujo `product_id` não existe. */
  posicao?: number;
  adicionados?: number;
  removidos?: number;
  ajustados?: number;
  subtotal_cents?: number;
  total_cents?: number;
}

export async function aplicarPatchDeItens(
  admin: SupabaseClient,
  entrada: {
    pedidoId: string;
    organizationId: string;
    patch: ItensPatch;
    userId: string | null;
    requestId: string;
  },
): Promise<ResultadoDoPatch> {
  const { pedidoId, organizationId, patch, requestId } = entrada;

  const { data: pedido, error: erroPedido } = await admin
    .from("commercial_orders")
    .select("id, status, desconto_cents, frete_cents, desconto_pct, total_cents")
    .eq("id", pedidoId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (erroPedido || !pedido) return { ok: false, motivo: "nao_encontrado" };
  const p = pedido as {
    status: string;
    desconto_cents: number;
    frete_cents: number;
    desconto_pct: number | null;
    total_cents: number;
  };

  // ─── O estado atual, lido UMA vez ───────────────────────────────────────
  // Ler depois de cada escrita faria o recálculo enxergar um estado
  // intermediário, e o total "se corrige" sozinho — que é o jeito mais caro de
  // um bug contábil aparecer.
  const { data: atuais, error: erroLeitura } = await admin
    .from("commercial_order_items")
    .select("id, posicao, quantidade, preco_unit_cents, desconto_pct, subtotal_cents")
    .eq("order_id", pedidoId)
    .order("posicao", { ascending: true });

  if (erroLeitura) {
    logger.error("patch de itens: falha ao ler itens", { pedidoId, requestId });
    return { ok: false };
  }
  let linhas = (atuais ?? []) as Array<{
    id: string;
    posicao: number;
    quantidade: number;
    preco_unit_cents: number;
    desconto_pct: number;
    subtotal_cents: number;
  }>;

  // ─── remover ───────────────────────────────────────────────────────────
  const remover = new Set(patch.remover);
  // Um id que não é item DESTE pedido é erro de quem chamou, não "não achei e
  // tudo bem": silenciar faria a tela mostrar "2 itens removidos" having
  // removed 1.
  const idsConhecidos = new Set(linhas.map((l) => l.id));
  for (const id of remover) {
    if (!idsConhecidos.has(id)) {
      logger.warn("patch de itens: remover id que nao pertence ao pedido", { pedidoId, id, requestId });
      return { ok: false, motivo: "item_desconhecido" };
    }
  }
  const antesDeRemover = linhas.length;
  linhas = linhas.filter((l) => !remover.has(l.id));

  // ─── ajustar ───────────────────────────────────────────────────────────
  let ajustados = 0;
  for (const ajuste of patch.ajustar) {
    const linha = linhas.find((l) => l.id === ajuste.id);
    if (!linha) {
      logger.warn("patch de itens: ajustar id que nao pertence ao pedido", {
        pedidoId,
        id: ajuste.id,
        requestId,
      });
      return { ok: false, motivo: "item_desconhecido" };
    }
    if (ajuste.quantidade !== undefined) linha.quantidade = ajuste.quantidade;
    if (ajuste.preco_unit_cents !== undefined) linha.preco_unit_cents = ajuste.preco_unit_cents;
    if (ajuste.desconto_pct !== undefined) linha.desconto_pct = ajuste.desconto_pct;
    linha.subtotal_cents = subtotalDoItem(
      linha.quantidade,
      linha.preco_unit_cents,
      linha.desconto_pct ?? 0,
    );
    ajustados++;
  }

  // ─── adicionar ─────────────────────────────────────────────────────────
  // `product_id` precisa ser resolvido contra o catálogo, pelas mesmas duas
  // razões de `criar-pedido.ts`:
  //
  // 1. Um id que não existe no catálogo é erro de quem chamou — e `produto_nome`
  //    NOT NULL receberia "Item avulso" para um produto que o dono jurou ter
  //    escolhido. Some a isso o `product_id` gravado apontando para o vazio.
  // 2. O item precisa carregar `produto_codigo` e `produto_nome`: são eles que a
  //    tela mostra, que o PDF da NF imprime e que o relatório por produto
  //    agrupa. Grabar string vazia nos dois é fabricar uma linha que não
  //    descreve nada — e foi exatamente assim que 3.794 itens do Mercos ficaram
  //    sem produto.
  //
  // Sem `product_id`, a linha é "avulsa" — o mesmo par de textos que
  // `criar-pedido.ts` usa, e não um texto novo, para que o leitor reconheça.
  const idsProdutos = patch.adicionar
    .map((i) => i.product_id)
    .filter((v): v is string => typeof v === "string" && v !== "");
  const catalogo = new Map<
    string,
    { codigo: string | null; nome: string | null }
  >();
  if (idsProdutos.length > 0) {
    const { data: prods } = await admin
      .from("catalog_products")
      .select("id, codigo, nome")
      .eq("organization_id", organizationId)
      .in("id", idsProdutos);
    for (const p of (prods ?? []) as Array<{ id: string; codigo: string | null; nome: string | null }>) {
      catalogo.set(p.id, { codigo: p.codigo, nome: p.nome });
    }
  }
  for (const [pos, item] of patch.adicionar.entries()) {
    if (item.product_id && !catalogo.has(item.product_id)) {
      logger.warn("patch de itens: product_id que nao existe no catalogo", {
        pedidoId,
        product_id: item.product_id,
        requestId,
      });
      return { ok: false, motivo: "produto_desconhecido", posicao: pos };
    }
  }

  // `posicao` continua a sequência sem buraco: remover o item 2 de 5 e ler a
  // lista depois mostraria 0,1,3,4,5, e o próximo item nasce no 6 deixando o 5
  // duplicado. A reindexação é aqui porque aqui é onde a lista muda.
  const proximaPosicao = linhas.length > 0 ? Math.max(...linhas.map((l) => l.posicao)) + 1 : 0;
  const novos = patch.adicionar.map((item, i) => {
    const prod = item.product_id ? catalogo.get(item.product_id) : undefined;
    return {
      id: randomUUID(),
      organization_id: organizationId,
      order_id: pedidoId,
      product_id: item.product_id ?? null,
      produto_codigo: prod?.codigo ?? "AVULSO",
      produto_nome: prod?.nome ?? "Item avulso",
      quantidade: item.quantidade,
      preco_unit_cents: item.preco_unit_cents,
      desconto_pct: item.desconto_pct ?? 0,
      subtotal_cents: subtotalDoItem(
        item.quantidade,
        item.preco_unit_cents,
        item.desconto_pct ?? 0,
      ),
      posicao: proximaPosicao + i,
    };
  });

  if (novos.length > 0) {
    const { error: erroAdd } = await admin.from("commercial_order_items").insert(novos);
    if (erroAdd) {
      logger.error("patch de itens: falha ao adicionar", { pedidoId, erro: erroAdd.message, requestId });
      return { ok: false };
    }
    linhas = [...linhas, ...novos];
  }

  linhas = linhas.map((l, i) => ({ ...l, posicao: i }));

  // ─── Gravar o que mudou ────────────────────────────────────────────────
  // A reindexação acima mexe em TODAS as linhas, e não só nas ajustadas:
  // remover o item do meio muda o `posicao` de quem veio depois. Por isso a
  // escrita sai quando houve QUALQUER remoção ou ajuste — e inclui os itens
  // recém-adicionados.
  //
  // Inclui porque eles nasceram em `proximaPosicao`, que é a maior posição
  // ANTES da reindexação: remover o item 0 de uma lista de 2 fazia o novo
  // nascer no 2 e o `\`.filter(idsConhecidos)\` o deixava de fora — a lista
  // ficava 1,2 com um buraco no 0, e a tela ordenada por posição mostrava
  // "o primeiro item sumiu" sem erro nenhum. Foi o teste de reindexação que
  // pegou isso.
  if (ajustados > 0 || remover.size > 0) {
    const idsNovos = new Set<string>(novos.map((n) => n.id));
    const aGravar = linhas.filter((l) => idsConhecidos.has(l.id) || idsNovos.has(l.id));
    const { error: erroAjuste } = await admin
      .from("commercial_order_items")
      .update(
        aGravar.map((l) => ({
          id: l.id,
          quantidade: l.quantidade,
          preco_unit_cents: l.preco_unit_cents,
          desconto_pct: l.desconto_pct,
          subtotal_cents: l.subtotal_cents,
          posicao: l.posicao,
        })),
      )
      .eq("order_id", pedidoId);
    if (erroAjuste) {
      logger.error("patch de itens: falha ao ajustar", { pedidoId, erro: erroAjuste.message, requestId });
      return { ok: false };
    }
  }

  if (remover.size > 0) {
    const { error: erroRemove } = await admin
      .from("commercial_order_items")
      .delete()
      .eq("order_id", pedidoId)
      .in("id", [...remover]);
    if (erroRemove) {
      logger.error("patch de itens: falha ao remover", { pedidoId, erro: erroRemove.message, requestId });
      return { ok: false };
    }
  }

  // ─── A aritmética: a mesma de criar-pedido.ts ───────────────────────────
  const subtotal = linhas.reduce((s, i) => s + i.subtotal_cents, 0);
  const descontoGeral = Math.round((subtotal * (p.desconto_pct ?? 0)) / 100);
  const total = subtotal - descontoGeral + (p.frete_cents ?? 0);

  const { error: erroUpdate } = await admin
    .from("commercial_orders")
    .update({
      subtotal_cents: subtotal,
      desconto_cents: descontoGeral,
      total_cents: total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pedidoId)
    .eq("organization_id", organizationId);

  if (erroUpdate) {
    logger.error("patch de itens: falha ao recalcular total", { pedidoId, erro: erroUpdate.message, requestId });
    return { ok: false };
  }

  await audit({
    action: "commercial_order.items_replaced",
    actorUserId: entrada.userId,
    organizationId,
    resourceType: "commercial_order",
    resourceId: pedidoId,
    requestId,
    metadata: {
      status: p.status,
      itens_antes: antesDeRemover,
      itens_depois: linhas.length,
      adicionados: novos.length,
      removidos: remover.size,
      ajustados,
      total_antes: p.total_cents,
      total_depois: total,
    },
  });

  return {
    ok: true,
    adicionados: novos.length,
    removidos: remover.size,
    ajustados,
    subtotal_cents: subtotal,
    total_cents: total,
  };
}
