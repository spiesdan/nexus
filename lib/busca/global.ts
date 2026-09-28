import { apiClient } from "@/lib/api/client";
import { numeroDoPedido } from "@/lib/format/moeda";
import type { NavDestination } from "@/lib/navigation/registry";

/**
 * Motor da Global Search (§17 SHELL) — a MESMA fonte da paleta ⌘K e da página
 * `/app/busca`.
 *
 * Antes desta camada a paleta só varria navegação + pedidos + contatos: lead,
 * conversa, produto e título tinham outra fonte de dados e outra feature, e
 * "encontrar" significava "saber a tela em que isso mora". Um único ponto de
 * verdade evita que a paleta e a página de resultados respondam perquisas
 * diferentes com o mesmo termo — a regra do §18 (registry), aplicada às
 * entidades.
 *
 * Seção que falha some em vez de derrubar as outras (`Promise.allSettled`):
 * procurar um cliente não pode depender do financeiro estar de pé.
 */

export type SecaoId = "conversas" | "clientes" | "pedidos" | "leads" | "produtos" | "titulos";

export interface ItemDeBusca {
  id: string;
  href: string;
  titulo: string;
  subtitulo?: string;
}

export interface SecaoDeBusca {
  id: SecaoId;
  rotulo: string;
  itens: ItemDeBusca[];
}

/** Abaixo disso é navegação pura: a paleta abre no trabalho do dia. */
export const MINIMO_DE_LETRAS = 2;

/**
 * Sem acento e sem caixa: ninguém digita "orçamento" com cedilha às pressas.
 * Compartilhado pela paleta e pela página de resultados — o mesmo termo tem de
 * casar do mesmo jeito nos dois lugares.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Os destinos do registry que casam com o termo (rótulo + descrição).
 * Termo vazio devolve VAZIO — quem abre a paleta sem digitar quer o trabalho
 * do dia, e quem abre a página de resultados quer o campo pronto.
 */
export function telasQueCasam(visiveis: NavDestination[], termo: string): NavDestination[] {
  const t = normalizar(termo.trim());
  if (t === "") return [];
  return visiveis.filter((d) => normalizar(`${d.label} ${d.description}`).includes(t));
}

const ROTULOS: Record<SecaoId, string> = {
  conversas: "Conversas",
  clientes: "Clientes",
  pedidos: "Pedidos",
  leads: "Leads",
  produtos: "Produtos",
  titulos: "Títulos",
};

/**
 * Ordem das seções = ordem do dia: quem atende (conversas), quem é o cliente,
 * o que já foi pedido, o funil, o catálogo, o que vence.
 */
const ORDEM: SecaoId[] = ["conversas", "clientes", "pedidos", "leads", "produtos", "titulos"];

/** Shape mínimo do que a seção lê de cada resposta — o resto é ruído aqui. */
interface ConversaLeve {
  id: string;
  contacts?: { display_name: string | null; name: string | null } | null;
  last_message_preview: string | null;
}
interface ContatoLeve {
  id: string;
  display_name: string | null;
  name: string | null;
}
interface PedidoLeve {
  id: string;
  numero: number;
  cliente_nome: string;
}
interface LeadLeve {
  id: string;
  title: string;
}
interface ProdutoLeve {
  id: string;
  nome: string;
  codigo: string | null;
  marca: string | null;
}
interface TituloLeve {
  order_id: string;
  numero: number;
  cliente_nome: string;
  parcela: number;
  de: number;
}

function nomeDoContato(c: { display_name: string | null; name: string | null } | null | undefined): string {
  return c?.display_name ?? c?.name ?? "";
}

/**
 * As seis entidades, em paralelo, com no máximo `limite` itens cada.
 * Termo com menos de 2 letras não gasta uma chamada sequer.
 */
export async function buscarEntidades(termo: string, limite = 5): Promise<SecaoDeBusca[]> {
  const t = termo.trim();
  if (t.length < MINIMO_DE_LETRAS) return [];
  const busca = encodeURIComponent(t);

  const [conversas, clientes, pedidos, leads, produtos, titulos] = await Promise.allSettled([
    apiClient.get<{ data: ConversaLeve[] }>(
      `/api/v1/conversations?search=${busca}&limit=${limite}`,
    ),
    apiClient.get<{ data: ContatoLeve[] }>(`/api/v1/contacts?search=${busca}&limit=${limite}`),
    apiClient.get<{ data: PedidoLeve[] }>(
      `/api/v1/commercial-orders?busca=${busca}&limit=${limite}`,
    ),
    apiClient.get<{ data: LeadLeve[] }>(`/api/v1/leads?busca=${busca}&limite=${limite}`),
    apiClient.get<{ data: ProdutoLeve[] }>(`/api/v1/products?busca=${busca}`),
    apiClient.get<{ data: TituloLeve[] }>(`/api/v1/titulos?busca=${busca}`),
  ]);

  const linhas: Record<SecaoId, ItemDeBusca[]> = {
    conversas:
      conversas.status === "fulfilled"
        ? (conversas.value.data ?? []).slice(0, limite).map((c) => ({
            id: c.id,
            href: `/app/inbox/${c.id}`,
            titulo: nomeDoContato(c.contacts) || "Conversa",
            subtitulo: c.last_message_preview ?? undefined,
          }))
        : [],
    clientes:
      clientes.status === "fulfilled"
        ? (clientes.value.data ?? []).slice(0, limite).map((c) => ({
            id: c.id,
            href: `/app/contacts/${c.id}`,
            titulo: nomeDoContato(c) || "Contato",
          }))
        : [],
    pedidos:
      pedidos.status === "fulfilled"
        ? (pedidos.value.data ?? []).slice(0, limite).map((p) => ({
            id: p.id,
            href: `/app/pedidos/${p.id}`,
            titulo: numeroDoPedido(p.numero),
            subtitulo: p.cliente_nome,
          }))
        : [],
    leads:
      leads.status === "fulfilled"
        ? (leads.value.data ?? []).slice(0, limite).map((l) => ({
            id: l.id,
            href: `/app/leads/${l.id}`,
            titulo: l.title,
          }))
        : [],
    // Produto e título não têm página própria de detalhe com a pergunta
    // respondida: o clique leva à LISTA com o termo já dentro, para o catálogo
    // e a baixa caírem no que o usuário digitou, não na lista inteira.
    produtos:
      produtos.status === "fulfilled"
        ? (produtos.value.data ?? []).slice(0, limite).map((p) => ({
            id: p.id,
            href: `/app/products?busca=${busca}`,
            titulo: p.nome,
            subtitulo: [p.codigo, p.marca].filter(Boolean).join(" · ") || undefined,
          }))
        : [],
    titulos:
      titulos.status === "fulfilled"
        ? (titulos.value.data ?? []).slice(0, limite).map((tl) => ({
            id: `${tl.order_id}#${tl.parcela}`,
            href: `/app/financeiro?aba=titulos&busca=${busca}`,
            titulo: numeroDoPedido(tl.numero),
            subtitulo: `${tl.cliente_nome} · parcela ${tl.parcela}/${tl.de}`,
          }))
        : [],
  };

  return ORDEM.filter((id) => linhas[id].length > 0).map((id) => ({
    id,
    rotulo: ROTULOS[id],
    itens: linhas[id],
  }));
}
