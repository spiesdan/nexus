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
import { precoEfetivo } from "@/lib/schemas/precos";
import { subtotalDoItem, type ItensPatch } from "@/lib/schemas/pedidos";

export interface ResultadoDoPatch {
  ok: boolean;
  motivo?:
    | "nao_encontrado"
    | "item_desconhecido"
    | "produto_desconhecido"
    | "falha_ao_gravar"
    | "preco_fora_da_tabela"
    | "estoque_insuficiente"
    | "desconto_maior_que_subtotal"
    | "desconto_acima_da_alcada";
  /** Índice (base 0) do item que violou a regra. */
  posicao?: number;
  /** Texto para a tela, quando a recusa precisa explicar o motivo. */
  detalhe?: string;
  adicionados?: number;
  removidos?: number;
  ajustados?: number;
  subtotal_cents?: number;
  total_cents?: number;
  /** Status final — pode ser `em_analise` se o desconto passou da alçada. */
  status?: string;
  aprovacao_necessaria?: boolean;
}

export async function aplicarPatchDeItens(
  admin: SupabaseClient,
  entrada: {
    pedidoId: string;
    organizationId: string;
    patch: ItensPatch;
    userId: string | null;
    requestId: string;
    /**
     * Gerente pode furar tabela de preço/estoque, como na criação. A ROTA
     * decide pelo papel; a IA nunca passa `true`.
     */
    podeIgnorar?: boolean;
  },
): Promise<ResultadoDoPatch> {
  const { pedidoId, organizationId, patch, requestId } = entrada;
  // Default DENY: quem não declarou alçada não fura tabela nem estoque.
  const podeIgnorar = entrada.podeIgnorar === true;

  const { data: pedido, error: erroPedido } = await admin
    .from("commercial_orders")
    .select("id, status, desconto_cents, frete_cents, desconto_pct, total_cents, price_table_id")
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
    price_table_id: string | null;
  };

  // ─── O estado atual, lido UMA vez ───────────────────────────────────────
  // Ler depois de cada escrita faria o recálculo enxergar um estado
  // intermediário, e o total "se corrige" sozinho — que é o jeito mais caro de
  // um bug contábil aparecer.
  const { data: atuais, error: erroLeitura } = await admin
    .from("commercial_order_items")
    .select("id, posicao, quantidade, preco_unit_cents, desconto_pct, subtotal_cents, product_id")
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
    product_id: string | null;
  }>;

  // ─── AS MESMAS REGRAS DA CRIAÇÃO, AGORA NO PATCH ───────────────────────
  //
  // O patch de itens era a porta dos fundos da política comercial: um `agent`
  // aprovava o pedido com 5% e depois subia o desconto do item para 100% — ou
  // trocava o preço para qualquer valor — sem passar por tabela, alçada,
  // estoque ou crédito. A criação validava; a edição, não. Aqui as duas portas
  // passam a usar a mesma régua.
  const { data: polDb } = await admin
    .from("commercial_policies")
    .select("desconto_max_vendedor_pct, permite_estoque_negativo")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const politica = {
    desconto_max_vendedor_pct: Number(
      (polDb as { desconto_max_vendedor_pct: number } | null)?.desconto_max_vendedor_pct ?? 5,
    ),
    permite_estoque_negativo:
      (polDb as { permite_estoque_negativo: boolean } | null)?.permite_estoque_negativo ?? false,
  };

  let descontoTabelaPct = 0;
  const precoNaTabela = new Map<string, number | null>();
  if (p.price_table_id) {
    const [{ data: tab }, { data: itensTab }] = await Promise.all([
      admin
        .from("price_tables")
        .select("desconto_pct, ativo")
        .eq("id", p.price_table_id)
        .eq("organization_id", organizationId)
        .maybeSingle(),
      admin
        .from("price_table_items")
        .select("product_id, preco_cents")
        .eq("price_table_id", p.price_table_id)
        .eq("organization_id", organizationId),
    ]);
    const t = tab as { desconto_pct: number; ativo: boolean } | null;
    // Tabela apagada/inativa não invalida o pedido histórico: o preço já
    // praticado fica; a validação de preço simplesmente não se aplica.
    if (t?.ativo) {
      descontoTabelaPct = Number(t.desconto_pct);
      for (const i of (itensTab ?? []) as { product_id: string; preco_cents: number | null }[]) {
        precoNaTabela.set(i.product_id, i.preco_cents);
      }
    }
  }

  // Produtos dos itens que já existem e dos que vão entrar — uma query só.
  const idsProdutos = [
    ...new Set(
      [
        ...linhas.map((l) => l.product_id),
        ...patch.adicionar.map((i) => i.product_id ?? null),
      ].filter((v): v is string => typeof v === "string" && v !== ""),
    ),
  ];
  const catalogo = new Map<
    string,
    {
      codigo: string | null;
      nome: string | null;
      preco_cents: number;
      controla_estoque: boolean;
      quantidade: number;
    }
  >();
  if (idsProdutos.length > 0) {
    const { data: prods } = await admin
      .from("catalog_products")
      .select("id, codigo, nome, preco_cents, controla_estoque, quantidade")
      .eq("organization_id", organizationId)
      .in("id", idsProdutos);
    for (const prod of (prods ?? []) as Array<{
      id: string;
      codigo: string | null;
      nome: string | null;
      preco_cents: number;
      controla_estoque: boolean;
      quantidade: number;
    }>) {
      catalogo.set(prod.id, {
        codigo: prod.codigo,
        nome: prod.nome,
        preco_cents: prod.preco_cents,
        controla_estoque: prod.controla_estoque,
        quantidade: prod.quantidade,
      });
    }
  }

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
  for (const [pos, ajuste] of patch.ajustar.entries()) {
    const linha = linhas.find((l) => l.id === ajuste.id);
    if (!linha) {
      logger.warn("patch de itens: ajustar id que nao pertence ao pedido", {
        pedidoId,
        id: ajuste.id,
        requestId,
      });
      return { ok: false, motivo: "item_desconhecido" };
    }
    const prod = linha.product_id ? catalogo.get(linha.product_id) : undefined;
    // Preço de tabela: o mesmo teste da criação. Sem ele, o patch virava a
    // porta para negociar qualquer preço depois de o pedido estar aprovado.
    if (ajuste.preco_unit_cents !== undefined && prod && p.price_table_id) {
      const efetivo = precoEfetivo(
        prod.preco_cents,
        descontoTabelaPct,
        linha.product_id ? (precoNaTabela.get(linha.product_id) ?? null) : null,
      );
      if (efetivo !== ajuste.preco_unit_cents && !podeIgnorar) {
        return {
          ok: false,
          motivo: "preco_fora_da_tabela",
          posicao: pos,
          detalhe: `Preço fora da tabela em "${prod.nome ?? "produto"}" (tabela: ${efetivo}).`,
        };
      }
    }
    // Estoque: só o ACRÉSCIMO é checado. O que já estava na linha já baixou
    // (pedido fora de rascunho) ou é o próprio rascunho; somar a quantidade
    // inteira descontaria duas vezes.
    if (ajuste.quantidade !== undefined && prod?.controla_estoque) {
      const delta = ajuste.quantidade - linha.quantidade;
      if (
        delta > 0 &&
        prod.quantidade < delta &&
        !politica.permite_estoque_negativo &&
        !podeIgnorar
      ) {
        return {
          ok: false,
          motivo: "estoque_insuficiente",
          posicao: pos,
          detalhe: `Estoque insuficiente para "${prod.nome ?? "produto"}" (disponível ${prod.quantidade}, adicionando ${delta}).`,
        };
      }
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
  for (const [pos, item] of patch.adicionar.entries()) {
    if (item.product_id && !catalogo.has(item.product_id)) {
      logger.warn("patch de itens: product_id que nao existe no catalogo", {
        pedidoId,
        product_id: item.product_id,
        requestId,
      });
      return { ok: false, motivo: "produto_desconhecido", posicao: pos };
    }
    const prod = item.product_id ? catalogo.get(item.product_id) : undefined;
    // Preço de tabela, como na criação: o servidor decide o preço efetivo.
    if (prod && p.price_table_id) {
      const efetivo = precoEfetivo(
        prod.preco_cents,
        descontoTabelaPct,
        item.product_id ? (precoNaTabela.get(item.product_id) ?? null) : null,
      );
      if (efetivo !== item.preco_unit_cents && !podeIgnorar) {
        return {
          ok: false,
          motivo: "preco_fora_da_tabela",
          posicao: pos,
          detalhe: `Preço fora da tabela em "${prod.nome ?? "produto"}" (tabela: ${efetivo}).`,
        };
      }
    }
    if (
      prod?.controla_estoque &&
      prod.quantidade < item.quantidade &&
      !politica.permite_estoque_negativo &&
      !podeIgnorar
    ) {
      return {
        ok: false,
        motivo: "estoque_insuficiente",
        posicao: pos,
        detalhe: `Estoque insuficiente para "${prod.nome ?? "produto"}" (disponível ${prod.quantidade}, pedido ${item.quantidade}).`,
      };
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
    // UMA LINHA POR VEZ. `update(array)` NÃO existe no PostgREST: o corpo de um
    // PATCH é um objeto, e mandar array faz o servidor tratar as linhas como
    // inserção — o erro que o usuário viu ao remover item do pedido foi
    // `duplicate key value violates unique constraint "commercial_order_items_pkey"`
    // (medido em 17/11/2026). O dublê dos testes aceitava array, então o teste
    // passava e o produto não.
    for (const l of aGravar) {
      const { error: erroAjuste } = await admin
        .from("commercial_order_items")
        .update({
          quantidade: l.quantidade,
          preco_unit_cents: l.preco_unit_cents,
          desconto_pct: l.desconto_pct,
          subtotal_cents: l.subtotal_cents,
          posicao: l.posicao,
        })
        .eq("id", l.id)
        .eq("order_id", pedidoId);
      if (erroAjuste) {
        logger.error("patch de itens: falha ao ajustar", { pedidoId, id: l.id, erro: erroAjuste.message, requestId });
        return { ok: false, motivo: "falha_ao_gravar" };
      }
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
  // ─── A aritmética: a mesma de criar-pedido.ts ───────────────────────────
  const subtotal = linhas.reduce((s, i) => s + i.subtotal_cents, 0);
  // Desconto geral = R$ fixo + %. O patch antigo aplicava SÓ o percentual e
  // descartava o `desconto_cents` já gravado — o total caía em silêncio numa
  // edição de item.
  const descontoPctGeral = p.desconto_pct ?? 0;
  const descontoGeral = p.desconto_cents + Math.round((subtotal * descontoPctGeral) / 100);
  if (descontoGeral > subtotal) {
    return {
      ok: false,
      motivo: "desconto_maior_que_subtotal",
      detalhe: `Desconto de ${descontoGeral} centavos maior que o subtotal de ${subtotal}.`,
    };
  }
  const total = subtotal - descontoGeral + (p.frete_cents ?? 0);

  // ─── Alçada: o mesmo teto da criação ────────────────────────────────────
  //
  // Rascunho é intenção e não barra. Pedido em aberto acima do teto volta para
  // `em_analise` — o dono pediu para corrigir depois de pronto, mas "pronto"
  // não pode significar "aprovado com desconto que ninguém aprovou". Pedido já
  // COMPROMETIDO (concluído/faturado/expedido/entregue) não é rebaixado em
  // silêncio: a troca é recusada e quem opera pede gerente.
  const descontoMaxItem = linhas.reduce((m, l) => Math.max(m, l.desconto_pct ?? 0), 0);
  const maiorDesconto = Math.max(descontoMaxItem, descontoPctGeral);
  const acimaDaAlcada =
    maiorDesconto > politica.desconto_max_vendedor_pct && !podeIgnorar;
  const COMPROMETIDOS = ["concluido", "faturado", "expedido", "entregue"];
  if (acimaDaAlcada && COMPROMETIDOS.includes(p.status)) {
    return {
      ok: false,
      motivo: "desconto_acima_da_alcada",
      detalhe: `Desconto de ${maiorDesconto}% acima do teto de ${politica.desconto_max_vendedor_pct}% em pedido "${p.status}". Peça aprovação de gerente.`,
    };
  }
  const aprovacaoNecessaria = acimaDaAlcada && p.status !== "rascunho";
  const statusFinal = aprovacaoNecessaria ? "em_analise" : p.status;

  const { error: erroUpdate } = await admin
    .from("commercial_orders")
    .update({
      subtotal_cents: subtotal,
      desconto_cents: descontoGeral,
      total_cents: total,
      status: statusFinal,
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
      status_depois: statusFinal,
      aprovacao_necessaria: aprovacaoNecessaria,
      desconto_antes: p.desconto_cents,
      desconto_depois: descontoGeral,
      maior_desconto_pct: maiorDesconto,
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
    status: statusFinal,
    aprovacao_necessaria: aprovacaoNecessaria,
  };
}
