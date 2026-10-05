/**
 * Monta os PEDIDOS PARA O PDF — a mesma ponte entre o banco e o desenho
 * (`lib/comercial/pedido-pdf.tsx`), para um pedido ou para um lote.
 *
 * ## Por que isto mora aqui
 *
 * A rota `[id]/pdf` fazia tudo isso embutida: itens + unidade do produto,
 * bloco do cliente (snapshot do pedido ou cadastro do contato) e o nome do
 * vendedor via Admin API. A página `/app/pedidos/imprimir` fazia a MESMA
 * montagem de novo, em outro formato — e a rota do lote faria a terceira.
 * Três cópias de uma regra de apresentação é três lugares para o impresso e a
 * tela divergirem.
 *
 * ## O que ela garante
 *
 * - **Uma consulta por entidade para o lote inteiro**, nunca N consultas por
 *   pedido: itens, contatos e produtos vêm todos de uma vez, como a página de
 *   impressão já fazia.
 * - **A ordem pedida é a ordem impressa**: quem selecionou 5 pedidos na lista
 *   espera sair naquela ordem, não na ordem alfabética de id.
 * - **Nunca lança**: sem vendedor (sem `SERVICE_ROLE_KEY`) ou sem cadastro de
 *   contato, o impresso sai com o que existe — um download não pode falhar por
 *   falta de um dado de cortesia.
 */
import { isServiceRoleConfigured } from "@/lib/audit";
import { enderecoEmLinha } from "@/lib/contacts/endereco-em-linha";
import { COLUNAS_DO_ITEM, COLUNAS_DO_PEDIDO } from "@/lib/schemas/pedidos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { PedidoPdfCliente, PedidoPdfDados, PedidoPdfItem } from "./pedido-pdf";

type ClienteServidor = Awaited<ReturnType<typeof createClient>>;

/** Linha crua de `commercial_orders` no formato que o PDF espera. */
type LinhaDoPedido = Omit<PedidoPdfDados, "itens" | "cliente" | "vendedor_nome"> & {
  id: string;
  contact_id: string | null;
  cliente_nome: string;
  cliente_documento: string | null;
  vendedor_user_id: string | null;
  endereco_entrega: string | null;
};

/**
 * Um lote de pedidos em `PedidoPdfDados`, na ordem de `ids`.
 *
 * Ids fora da organização simplesmente não voltam (o filtro de
 * `organization_id` é explícito, como a doutrina exige de quem usa service
 * role) — e ids desconhecidos não dão erro: devolvem menos páginas. Quem
 * precisa de 404 é a rota de UM pedido, e ela confere o tamanho do retorno.
 */
export async function montarPedidosPdf(
  supabase: ClienteServidor,
  organizationId: string,
  ids: string[],
): Promise<PedidoPdfDados[]> {
  if (ids.length === 0) return [];

  const [{ data: pedidosRaw }, { data: itensRaw }] = await Promise.all([
    supabase
      .from("commercial_orders")
      .select(COLUNAS_DO_PEDIDO)
      .eq("organization_id", organizationId)
      .in("id", ids),
    // `order_id` na frente de propósito: `COLUNAS_DO_ITEM` não o traz, e sem
    // ele não há como agrupar os itens do lote por pedido.
    supabase
      .from("commercial_order_items")
      .select(`order_id, ${COLUNAS_DO_ITEM}`)
      .eq("organization_id", organizationId)
      .in("order_id", ids)
      .order("posicao"),
  ]);

  const linhas = (pedidosRaw ?? []) as unknown as LinhaDoPedido[];
  if (linhas.length === 0) return [];

  // Mesma ordem da seleção, ANTES do map — quem marcou 5 pedidos na lista
  // espera sair naquela ordem, não na ordem alfabética de id.
  linhas.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  const itensPorPedido = agruparItens(
    (itensRaw ?? []) as unknown as (PedidoPdfItem & { order_id: string; product_id?: string | null })[],
  );

  const [clientePorId, unidadePorProduto, nomesDeVendedor] = await Promise.all([
    carregarClientes(supabase, organizationId, linhas),
    carregarUnidades(supabase, organizationId, itensPorPedido),
    carregarVendedores(linhas),
  ]);

  return linhas.map(
    (linha): PedidoPdfDados => ({
      numero: linha.numero,
      status: linha.status,
      subtotal_cents: linha.subtotal_cents,
      desconto_cents: linha.desconto_cents,
      frete_cents: linha.frete_cents,
      total_cents: linha.total_cents,
      condicao_pagamento: linha.condicao_pagamento,
      observacoes: linha.observacoes,
      endereco_entrega: linha.endereco_entrega,
      created_at: linha.created_at,
      cliente: clienteDe(linha, clientePorId.get(linha.contact_id ?? "")),
      vendedor_nome: nomeDeVendedor(linha, nomesDeVendedor),
      itens: (itensPorPedido.get(linha.id) ?? []).map((item) => ({
        produto_codigo: item.produto_codigo,
        produto_nome: item.produto_nome,
        quantidade: item.quantidade,
        unidade: (item.product_id && unidadePorProduto.get(item.product_id)) || "UN",
        preco_unit_cents: item.preco_unit_cents,
        desconto_pct: item.desconto_pct,
        subtotal_cents: item.subtotal_cents,
      })),
    }),
  );
}

function agruparItens(
  itens: (PedidoPdfItem & { order_id: string; product_id?: string | null })[],
): Map<string, Array<PedidoPdfItem & { product_id?: string | null }>> {
  const porPedido = new Map<string, Array<PedidoPdfItem & { product_id?: string | null }>>();
  for (const item of itens) {
    const lista = porPedido.get(item.order_id) ?? [];
    lista.push(item);
    porPedido.set(item.order_id, lista);
  }
  return porPedido;
}

/**
 * Unidades do lote inteiro numa leitura só. Um pedido sem produto cadastrado
 * cai no padrão "UN" — o mesmo default da tabela e da tela.
 */
async function carregarUnidades(
  supabase: ClienteServidor,
  organizationId: string,
  itensPorPedido: Map<string, Array<{ product_id?: string | null }>>,
): Promise<Map<string, string>> {
  const idsProdutos = [
    ...new Set([...itensPorPedido.values()].flat().map((i) => i.product_id).filter(Boolean)),
  ] as string[];
  if (idsProdutos.length === 0) return new Map();
  const { data } = await supabase
    .from("catalog_products")
    .select("id, unidade")
    .eq("organization_id", organizationId)
    .in("id", idsProdutos);
  return new Map(
    ((data ?? []) as { id: string; unidade: string | null }[]).map((p) => [p.id, p.unidade ?? "UN"]),
  );
}

/**
 * Bloco do cliente do lote inteiro numa leitura só.
 *
 * Sem vínculo, o impresso usa o SNAPSHOT do pedido (nome/documento gravados
 * quando o pedido nasceu) — nunca vazio. Com vínculo, o cadastro atual
 * prevalece, e o endereço passa pelo formatador único (`enderecoEmLinha`).
 */
async function carregarClientes(
  supabase: ClienteServidor,
  organizationId: string,
  linhas: LinhaDoPedido[],
): Promise<Map<string, RegistroDoContato>> {
  const ids = [...new Set(linhas.map((l) => l.contact_id).filter(Boolean))] as string[];
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("contacts")
    .select(
      "id, display_name, name, tipo_pessoa, fantasia, ie, cnpj, phone_number, email, logradouro, numero_end, complemento, bairro, cidade, uf, cep",
    )
    .eq("organization_id", organizationId)
    .in("id", ids);
  return new Map(
    ((data ?? []) as unknown as RegistroDoContato[]).map((c) => [c.id, c]),
  );
}

interface RegistroDoContato {
  id: string;
  display_name: string | null;
  name: string | null;
  tipo_pessoa: string | null;
  fantasia: string | null;
  ie: string | null;
  cnpj: string | null;
  phone_number: string | null;
  email: string | null;
  logradouro: string | null;
  numero_end: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
}

function clienteDe(linha: LinhaDoPedido, contato?: RegistroDoContato): PedidoPdfCliente {
  const base: PedidoPdfCliente = {
    nome: linha.cliente_nome,
    fantasia: null,
    rotuloDocumento: (linha.cliente_documento ?? "").replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ",
    documento: linha.cliente_documento,
    ie: null,
    endereco: linha.endereco_entrega,
    bairro: null,
    cep: null,
    cidade: null,
    uf: null,
    fone: null,
    email: null,
  };
  if (!contato) return base;
  return {
    nome: contato.display_name ?? contato.name ?? linha.cliente_nome,
    fantasia: contato.fantasia,
    rotuloDocumento: contato.tipo_pessoa === "F" ? "CPF" : "CNPJ",
    documento: contato.cnpj ?? linha.cliente_documento,
    ie: contato.ie,
    endereco:
      enderecoEmLinha({
        logradouro: contato.logradouro,
        numero_end: contato.numero_end,
        complemento: contato.complemento,
        bairro: contato.bairro,
        cidade: contato.cidade,
        uf: contato.uf,
        cep: contato.cep,
      }) || linha.endereco_entrega,
    bairro: contato.bairro,
    cep: contato.cep,
    cidade: contato.cidade,
    uf: contato.uf,
    fone: contato.phone_number,
    email: contato.email,
  };
}

/**
 * Nome do vendedor do lote inteiro numa chamada por id distinto.
 *
 * Sem `SERVICE_ROLE_KEY` o helper devolve mapa vazio e o impresso sai sem
 * pessoa no campo "Vendedor" — cortesia, nunca erro. É o mesmo contrato da
 * tela de Pedidos.
 */
async function carregarVendedores(linhas: LinhaDoPedido[]): Promise<Map<string, string>> {
  const ids = [...new Set(linhas.map((l) => l.vendedor_user_id).filter(Boolean))] as string[];
  if (ids.length === 0 || !isServiceRoleConfigured()) return new Map();
  const mapa = new Map<string, string>();
  try {
    const admin = createAdminClient();
    for (const id of ids) {
      const { data } = await admin.auth.admin.getUserById(id);
      const nome = data?.user?.user_metadata?.full_name as string | undefined;
      if (nome?.trim()) mapa.set(id, nome.trim());
    }
  } catch {
    // Cortesia; o pedido sem pessoa cobre.
  }
  return mapa;
}

function nomeDeVendedor(linha: LinhaDoPedido, nomes: Map<string, string>): string | null {
  if (!linha.vendedor_user_id) return null;
  return nomes.get(linha.vendedor_user_id) ?? null;
}
