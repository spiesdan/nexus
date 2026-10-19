/**
 * O ORÇAMENTO VISTO PELO CLIENTE — leitura pública e a aprovação.
 *
 * Um orçamento é um `commercial_orders` no estágio de orçamento (`rascunho` ou
 * `em_analise`). O cliente recebe o link, abre no celular e aprova; a aprovação
 * é o que empurra o pedido para a fila (`aprovado`), de onde ele segue para
 * faturamento e expedição.
 *
 * ═══ A aprovação do cliente NÃO passa por cima da alçada de desconto ═══════
 *
 * O produto já tem um gate: desconto acima do teto do vendedor escala o pedido
 * para `em_analise`, e quem aprova é o gerente (`criar-pedido` §14–15). Se o
 * clique do cliente virasse `aprovado` direto, o link público seria um atalho
 * para furar exatamente esse controle — e o cliente aprovaria um preço que a
 * empresa ainda não autorizou.
 *
 * Então a regra é a MESMA do resto do sistema: o cliente aprova a CONDIÇÃO, e o
 * pedido só entra na fila se ela já está dentro da alçada. Se não está, a
 * aprovação fica REGISTRADA (audit) e o pedido continua `em_analise` esperando o
 * gerente — que é o que a tela diz ao cliente ("recebemos sua aprovação, nosso
 * time confirma"), em vez de mentir que está tudo pronto.
 *
 * Este módulo não conhece HTTP: a página e a rota pública compartilham estas
 * funções, para a tela nunca mostrar um estado que a ação não produz.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { normalizarIdioma, type Idioma } from "@/lib/i18n/idiomas";
import { ROTULO_DO_STATUS, type StatusDoPedido } from "@/lib/schemas/pedidos";

import { verificarOrcamento } from "./orcamento-link";

/** Estágios em que o pedido já saiu do orçamento — nada a aprovar. */
const JA_APROVADO: ReadonlySet<StatusDoPedido> = new Set<StatusDoPedido>([
  "aprovado",
  "faturado",
  "expedido",
  "entregue",
]);

/** O teto de desconto do vendedor, quando a org não configurou nada. */
const TETO_PADRAO_PCT = 5;

export interface ItemDoOrcamento {
  nome: string;
  quantidade: number;
  precoUnitCents: number;
  descontoPct: number;
  subtotalCents: number;
}

export interface OrcamentoPublico {
  numero: number;
  clienteNome: string;
  status: StatusDoPedido;
  rotuloDoStatus: string;
  criadoEm: string;
  subtotalCents: number;
  descontoCents: number;
  freteCents: number;
  totalCents: number;
  moeda: string;
  condicaoPagamento: string | null;
  observacoes: string | null;
  itens: ItemDoOrcamento[];
  organizacao: string;
  /**
   * O idioma da ORGANIZAÇÃO, não o de quem abriu: a página pública é lida pelo
   * cliente, que não tem preferência salva nesta instalação. Vem do banco para
   * a data não ser formatada com um idioma escrito à mão (`lib/i18n/datas.ts`).
   */
  idioma: Idioma;
  /**
   * O botão existe enquanto o orçamento está aberto — inclusive quando o
   * desconto exige o gerente. Nesse caso o clique ainda tem efeito (registra a
   * aprovação do cliente), mas `espera` avisa que a confirmação é interna. Botão
   * que não faz nada é pior que botão ausente; botão que registra e explica o que
   * falta, melhor que os dois.
   */
  podeAprovar: boolean;
  jaAprovado: boolean;
  espera: "gerente" | "cancelado" | null;
}

interface PedidoDoOrcamento {
  id: string;
  numero: number;
  cliente_nome: string;
  status: string;
  created_at: string;
  subtotal_cents: number;
  desconto_cents: number;
  desconto_pct: number | null;
  frete_cents: number;
  total_cents: number;
  moeda: string;
  condicao_pagamento: string | null;
  observacoes: string | null;
}

const COLUNAS_DO_PEDIDO =
  "id, numero, cliente_nome, status, created_at, subtotal_cents, desconto_cents, desconto_pct, " +
  "frete_cents, total_cents, moeda, condicao_pagamento, observacoes";

/**
 * O pedido precisa do gerente? Espelha a régua de `criar-pedido` §14–15: o maior
 * desconto (de item ou o geral) acima do teto do vendedor escala. Aqui a
 * pergunta é a mesma, feita de novo, porque o pedido pode ter sido editado
 * depois de criado.
 */
async function precisaDeGerente(
  admin: SupabaseClient,
  orgId: string,
  pedido: Pick<PedidoDoOrcamento, "desconto_pct">,
  itens: Array<{ desconto_pct: number | null }>,
): Promise<boolean> {
  const { data: pol } = await admin
    .from("commercial_policies")
    .select("desconto_max_vendedor_pct")
    .eq("organization_id", orgId)
    .maybeSingle();
  const teto = Number(
    (pol as unknown as { desconto_max_vendedor_pct: number } | null)
      ?.desconto_max_vendedor_pct ?? TETO_PADRAO_PCT,
  );
  const maior = Math.max(
    Number(pedido.desconto_pct ?? 0),
    ...itens.map((i) => Number(i.desconto_pct ?? 0)),
  );
  return maior > teto;
}

/** `null` = link inválido/vencido ou pedido que não é desta organização. */
export async function carregarOrcamentoPublico(
  admin: SupabaseClient,
  token: string,
  agoraMs = Date.now(),
): Promise<OrcamentoPublico | null> {
  const carga = verificarOrcamento(token, agoraMs);
  if (!carga) return null;

  const { data: pedidoDb } = await admin
    .from("commercial_orders")
    .select(COLUNAS_DO_PEDIDO)
    .eq("id", carga.orderId)
    .eq("organization_id", carga.orgId)
    .maybeSingle();
  if (!pedidoDb) return null;
  const pedido = pedidoDb as unknown as PedidoDoOrcamento;

  const status = pedido.status as StatusDoPedido;
  const jaAprovado = JA_APROVADO.has(status);
  const cancelado = status === "cancelado";

  const { data: itensDb } = await admin
    .from("commercial_order_items")
    .select("produto_nome, quantidade, preco_unit_cents, desconto_pct, subtotal_cents, posicao")
    .eq("order_id", pedido.id)
    .eq("organization_id", carga.orgId)
    .order("posicao", { ascending: true });
  const itens = (itensDb ?? []) as unknown as Array<{
    produto_nome: string;
    quantidade: number;
    preco_unit_cents: number;
    desconto_pct: number | null;
    subtotal_cents: number;
  }>;

  const { data: org } = await admin
    .from("organizations")
    .select("display_name, locale")
    .eq("id", carga.orgId)
    .maybeSingle();
  const organizacao = org as unknown as { display_name: string; locale: string } | null;

  const esperaGerente =
    !jaAprovado && !cancelado ? await precisaDeGerente(admin, carga.orgId, pedido, itens) : false;

  return {
    numero: pedido.numero,
    clienteNome: pedido.cliente_nome,
    status,
    rotuloDoStatus: ROTULO_DO_STATUS[status] ?? status,
    criadoEm: pedido.created_at,
    subtotalCents: pedido.subtotal_cents,
    descontoCents: pedido.desconto_cents,
    freteCents: pedido.frete_cents,
    totalCents: pedido.total_cents,
    moeda: pedido.moeda,
    condicaoPagamento: pedido.condicao_pagamento,
    observacoes: pedido.observacoes,
    itens: itens.map((i) => ({
      nome: i.produto_nome,
      quantidade: i.quantidade,
      precoUnitCents: i.preco_unit_cents,
      descontoPct: Number(i.desconto_pct ?? 0),
      subtotalCents: i.subtotal_cents,
    })),
    organizacao: organizacao?.display_name ?? "Orçamento",
    idioma: normalizarIdioma(organizacao?.locale),
    podeAprovar: !jaAprovado && !cancelado,
    jaAprovado,
    espera: cancelado ? "cancelado" : esperaGerente ? "gerente" : null,
  };
}

export type ResultadoDaAprovacao =
  | { ok: true; jaAprovado: boolean; aguardandoGerente: boolean }
  | { ok: false; motivo: "link_invalido" | "nao_encontrado" | "cancelado" };

/**
 * O clique do cliente. Idempotente: apertar duas vezes (ou recarregar a página)
 * devolve `jaAprovado`, nunca um segundo efeito.
 */
export async function aprovarOrcamentoPublico(
  admin: SupabaseClient,
  p: { token: string; requestId: string; agoraMs?: number },
): Promise<ResultadoDaAprovacao> {
  const carga = verificarOrcamento(p.token, p.agoraMs);
  if (!carga) return { ok: false, motivo: "link_invalido" };

  const { data: pedidoDb } = await admin
    .from("commercial_orders")
    .select("id, status, desconto_pct")
    .eq("id", carga.orderId)
    .eq("organization_id", carga.orgId)
    .maybeSingle();
  if (!pedidoDb) return { ok: false, motivo: "nao_encontrado" };
  const pedido = pedidoDb as unknown as { id: string; status: string; desconto_pct: number | null };

  const status = pedido.status as StatusDoPedido;
  if (status === "cancelado") return { ok: false, motivo: "cancelado" };
  if (JA_APROVADO.has(status)) return { ok: true, jaAprovado: true, aguardandoGerente: false };

  const { data: itensDb } = await admin
    .from("commercial_order_items")
    .select("desconto_pct")
    .eq("order_id", pedido.id)
    .eq("organization_id", carga.orgId);
  const itens = (itensDb ?? []) as unknown as Array<{ desconto_pct: number | null }>;

  if (await precisaDeGerente(admin, carga.orgId, pedido, itens)) {
    // A aprovação do cliente fica REGISTRADA — o gerente vê que a condição já
    // foi aceita e só confirma (ou barra) o preço.
    await audit({
      organizationId: carga.orgId,
      actorUserId: null,
      action: "commercial_order.client_approved",
      resourceType: "commercial_orders",
      resourceId: pedido.id,
      requestId: p.requestId,
    });
    return { ok: true, jaAprovado: false, aguardandoGerente: true };
  }

  // O `.in("status", ...)` é a trava de corrida: se outro clique (ou o gerente)
  // mudou o status entre a leitura e o update, nenhuma linha volta e o estado é
  // relido — quem manda é o banco, não o que a página leu.
  const { data: atualizado, error } = await admin
    .from("commercial_orders")
    .update({ status: "aprovado" })
    .eq("id", pedido.id)
    .eq("organization_id", carga.orgId)
    .in("status", ["rascunho", "em_analise"])
    .select("id");

  if (error) return { ok: false, motivo: "nao_encontrado" };

  if (!atualizado || atualizado.length === 0) {
    const { data: atual } = await admin
      .from("commercial_orders")
      .select("status")
      .eq("id", pedido.id)
      .eq("organization_id", carga.orgId)
      .maybeSingle();
    const agora = (atual as unknown as { status?: string } | null)?.status as
      | StatusDoPedido
      | undefined;
    if (agora && JA_APROVADO.has(agora)) {
      return { ok: true, jaAprovado: true, aguardandoGerente: false };
    }
    return { ok: false, motivo: "nao_encontrado" };
  }

  await audit({
    organizationId: carga.orgId,
    actorUserId: null,
    action: "commercial_order.approved_by_client",
    resourceType: "commercial_orders",
    resourceId: pedido.id,
    requestId: p.requestId,
  });
  return { ok: true, jaAprovado: false, aguardandoGerente: false };
}
