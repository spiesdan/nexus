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
import { documentoDoCadastro } from "@/lib/contacts/documento-do-cadastro";
import { cidadeSemEstado, enderecoDaRua } from "@/lib/contacts/endereco-em-linha";
import { rotuloDoContato, SEM_NOME } from "@/lib/contacts/rotulo-do-contato";
import { COLUNAS_DO_ITEM, COLUNAS_DO_PEDIDO } from "@/lib/schemas/pedidos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { rotuloDoDocumento } from "./documento";
import type { PedidoPdfCliente, PedidoPdfDados, PedidoPdfItem } from "./pedido-pdf";

type ClienteServidor = Awaited<ReturnType<typeof createClient>>;

/** Linha crua de `commercial_orders` no formato que o PDF espera. */
type LinhaDoPedido = Omit<
  PedidoPdfDados,
  "itens" | "cliente" | "vendedor_nome" | "observacoes"
> & {
  id: string;
  contact_id: string | null;
  cliente_nome: string;
  cliente_documento: string | null;
  vendedor_user_id: string | null;
  /** Emissor importado do canal, quando ele não é usuário do CRM. */
  vendedor_nome: string | null;
  origem: string;
  /** Observação INTERNA dos pedidos do Mercos — não vai para o impresso. */
  observacoes: string | null;
  /** A observação que o Mercos imprime em "Informações adicionais". */
  mercos_observacoes: string | null;
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
      observacoes: observacoesDoPdf(linha),
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
      "id, display_name, name, tipo_pessoa, fantasia, ie, cnpj, source_metadata, phone_number, email, logradouro, numero_end, complemento, bairro, cidade, uf, cep",
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
  /** O CPF de quem veio do Mercos mora aqui, não em `cnpj`. */
  source_metadata: unknown;
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
    rotuloDocumento: rotuloDoDocumento(null, linha.cliente_documento),
    documento: linha.cliente_documento,
    ie: null,
    // Sem cadastro, o snapshot do pedido é a única informação que existe.
    endereco: linha.endereco_entrega,
    bairro: null,
    cep: null,
    cidade: null,
    uf: null,
    fone: null,
    email: null,
  };
  if (!contato) return base;
  // O cadastro inteiro, não só a coluna `cnpj`: o Mercos guarda o CPF em
  // `source_metadata.mercos.documento` e deixa `cnpj` NULL. Antes, o impresso
  // de 832 pedidos desses clientes saía com o CPF do snapshot ou sem documento
  // nenhum, embora o cadastro o tivesse.
  const documento = documentoDoCadastro(contato)?.digitos ?? linha.cliente_documento;
  return {
    nome: nomeDoCliente(contato, linha.cliente_nome),
    fantasia: contato.fantasia,
    rotuloDocumento: rotuloDoDocumento(contato.tipo_pessoa, documento),
    documento,
    ie: contato.ie,
    // O campo "Endereço" do impresso é só a rua (ver `enderecoDaRua`): bairro,
    // cidade, UF e CEP têm linha própria, e repeti-los aqui era o defeito
    // visível do pedido 19513.
    endereco: enderecoDaRua(contato) || linha.endereco_entrega,
    bairro: contato.bairro,
    cep: contato.cep,
    // O Mercos colou o estado na cidade em parte do cadastro ("Porto União,
    // Santa Catarina"); a linha "Estado" logo abaixo já o imprime.
    cidade: cidadeSemEstado(contato.cidade, contato.uf),
    uf: contato.uf,
    fone: contato.phone_number,
    email: contato.email,
  };
}

/**
 * O nome do cliente que o Mercos imprime.
 *
 * O importador grava `display_name` como `"<fantasia> - <razão social>"`
 * (medido nesta instalação em 2026-11-11: 6.420 pedidos do Mercos com o nome
 * do cliente no formato `A - B`) e o impresso mostra só a razão social — o
 * campo "Nome Fantasia" já carrega a outra metade. Com o prefixo, a fantasia
 * sai duas vezes na mesma linha e empurra o bloco inteiro.
 */
function nomeDoCliente(contato: RegistroDoContato, snapshot: string): string {
  // O rótulo central é quem decide o que é nome de gente (recusa `@lid` e o
  // "Contato 123" que o código antigo inventava). Sem o telefone de propósito:
  // no impresso ele tem a linha "Telefone", e o campo "Cliente" é a razão
  // social — que, sem cadastro, é o snapshot do pedido.
  const rotulo = rotuloDoContato({ display_name: contato.display_name, name: contato.name });
  const nome = rotulo === SEM_NOME ? "" : rotulo;
  if (!nome) return snapshot;
  const fantasia = contato.fantasia?.trim();
  if (!fantasia) return nome;
  const prefixo = `${fantasia.toLowerCase()} - `;
  if (!nome.toLowerCase().startsWith(prefixo)) return nome;
  const semFantasia = nome.slice(prefixo.length).trim();
  return semFantasia || nome;
}

/**
 * O texto de "Informações adicionais" do impresso.
 *
 * Nos pedidos importados, `observacoes` guarda lixo interno do importador
 * ("Status Mercos: Concluído") e a observação que o cliente via no Mercos
 * está em `mercos_observacoes`. Nos pedidos criados no CRM, a observação é
 * `observacoes`. Bloco vazio não é impresso (ver `pedido-pdf.tsx`).
 */
function observacoesDoPdf(linha: LinhaDoPedido): string | null {
  const texto = (linha.origem === "mercos" ? linha.mercos_observacoes : linha.observacoes)?.trim();
  return texto ? texto : null;
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
  const usuario = linha.vendedor_user_id ? nomes.get(linha.vendedor_user_id) : null;
  // Pedido importado do Mercos não tem usuário do CRM: o nome vem da coluna
  // `vendedor_nome` ("VENDEDOR JB"). Sem essa reserva o campo saía "-----"
  // num pedido que o Mercos imprime com vendedor (caso do 19513).
  return usuario?.trim() || linha.vendedor_nome?.trim() || null;
}
