/**
 * Capacidades de COMÉRCIO e PRIVACIDADE — o que o cliente comprou, o que existe
 * à venda, e quem pediu para sair.
 *
 * Ver `docs/handoffs/BRIEFING-ia-360.md` §4 para o contrato dos campos.
 */
import { declararTools } from "./tipos";

export const TOOLS_COMERCIO = declararTools([
  {
    name: "crm_list_contact_orders",
    category: "read",
    rotulo: "Ver as compras do cliente",
    explicacao:
      "Mostra o que este cliente já comprou, quanto pagou e como está a entrega, para o assistente não prometer prazo no escuro nem repetir uma oferta já aceita.",
    oQueToca: "Compras do cliente",
    risco: "seguro",
    pacotes: ["vender", "atender"],
  },
  {
    name: "crm_search_products",
    category: "read",
    rotulo: "Procurar produto na loja",
    explicacao:
      "Procura um produto no catálogo da loja e devolve o preço exato e o que está disponível, para o assistente responder com o valor cadastrado em vez de estimar.",
    oQueToca: "Catálogo da loja",
    risco: "seguro",
    pacotes: ["vender", "atender"],
  },
  {
    name: "crm_get_product_photos",
    category: "read",
    rotulo: "Pegar foto do produto",
    explicacao:
      "Devolve as fotos cadastradas de um produto pelo código, para o assistente mandar a foto no WhatsApp quando o cliente pedir. Sem foto cadastrada, ele avisa em vez de inventar.",
    oQueToca: "Fotos do catálogo",
    risco: "seguro",
    pacotes: ["vender", "atender"],
  },
  {
    name: "crm_send_product_photo",
    category: "write",
    rotulo: "Enviar foto do produto",
    explicacao:
      "Manda a foto cadastrada na conversa atual. Sem foto, recusa com motivo em vez de inventar.",
    oQueToca: "Conversa atual (foto do catálogo)",
    // `critico` pelo MESMO motivo de `crm_send_whatsapp_message`: a foto chega
    // no celular do cliente e não volta atrás. Só difere no conteúdo — e é
    // conteúdo que veio do catálogo, o que faz o efeito irreversível menor.
    risco: "critico",
    pacotes: ["vender", "atender"],
  },
  {
    name: "commercial_create_order",
    category: "write",
    rotulo: "Montar rascunho de pedido",
    explicacao:
      "Monta o rascunho do pedido com o que o cliente confirmou na conversa. Sai sempre como RASCUNHO com origem IA: um humano aprova depois. Sem estoque ou sem crédito, volta recusado.",
    oQueToca: "Pedidos da loja (rascunho)",
    // Crítico de propósito: dinheiro em movimento não entra no default de
    // nenhum agente — o dono liga por agente, sabendo o que está ligando.
    risco: "critico",
    pacotes: ["vender"],
  },
  {
    name: "commercial_delivery_status",
    category: "read",
    rotulo: "Consultar a entrega do pedido",
    explicacao:
      "Mostra em que pé está a entrega: se o pedido já embarcou, em qual carga, e se está separado, a caminho, entregue ou devolvido — para responder 'e meu pedido?' com o status real em vez de prometer prazo.",
    oQueToca: "Entrega dos pedidos (expedição)",
    risco: "seguro",
    pacotes: ["vender", "atender"],
  },
  {
    name: "crm_list_privacy_requests",
    category: "read",
    rotulo: "Ver pedidos de privacidade",
    explicacao:
      "Mostra quem pediu para exportar ou apagar os próprios dados e qual o prazo, para o assistente parar de insistir com quem pediu para sair.",
    oQueToca: "Privacidade e dados do cliente",
    risco: "seguro",
    pacotes: ["organizar", "atender"],
  },
]);
