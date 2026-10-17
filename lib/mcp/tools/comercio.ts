/**
 * Capacidades de COMÉRCIO — o que o cliente já comprou e o que existe à venda.
 *
 * Ficou de fora do épico até ser cobrado, e era a lacuna mais direta do pilar 1:
 * um agente de vendas que não enxerga o catálogo nem o histórico de pedidos
 * negocia no escuro — promete o que não existe, ou repete uma oferta que o
 * cliente já comprou.
 *
 * Service role bypassa RLS: TODA query filtra `organization_id` manualmente, e a
 * fonte é sempre `ctx.organizationId` (token/cookie), NUNCA o input.
 */
import { z } from "zod";

import { logger } from "@/lib/logger";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { resolverFotoDoProduto } from "@/lib/catalogo/foto-do-produto";

import type { McpToolDefinition } from "../types";
import { buscarComRelaxamento } from "@/lib/catalogo/busca";
import { criarPedidoComercial } from "@/lib/comercial/criar-pedido";
import { precoDeVitrine } from "@/lib/schemas/produtos";

// ---------------------------------------------------------------------------
// pedidos de um cliente
// ---------------------------------------------------------------------------

const pedidosInputShape = {
  contact_id: z.string().uuid().describe("O cliente cujos pedidos se quer ver."),
  limite: z.number().int().min(1).max(20).optional().default(10),
};

export const crmListContactOrders: McpToolDefinition<typeof pedidosInputShape> = {
  name: "crm_list_contact_orders",
  description:
    "Lista os pedidos de um contato, do mais recente para o mais antigo, com status, valor, " +
    "forma de pagamento, situação de entrega e código de rastreio. Use antes de prometer prazo " +
    "ou repetir oferta: o cliente pode já ter comprado.",
  inputSchema: pedidosInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const { data, error } = await ctx.supabase
      .from("orders")
      .select(
        "id, external_id, external_provider, status, total_cents, currency, payment_method, fulfillment_status, tracking_code, ordered_at, is_anonymized",
      )
      .eq("organization_id", ctx.organizationId)
      .eq("contact_id", input.contact_id)
      .order("ordered_at", { ascending: false, nullsFirst: false })
      .limit(input.limite);

    if (error) throw new Error(`listar_pedidos_falhou: ${error.message}`);

    return {
      pedidos: (data ?? []).map((p) => ({
        ...p,
        // Pedido anonimizado por LGPD continua contando para histórico, mas o
        // conteúdo não volta: dizer isso é melhor que devolver campos vazios e
        // deixar o modelo concluir que o cliente nunca comprou.
        ...(p.is_anonymized ? { aviso: "pedido anonimizado a pedido do titular" } : {}),
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// entrega dos pedidos internos (expedição)
// ---------------------------------------------------------------------------

const entregaInputShape = {
  contact_id: z.string().uuid().describe("O cliente que pergunta sobre a entrega."),
  order_numero: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Número do pedido (PED-0042 → 42). Sem ele, devolve os pedidos mais recentes do contato."),
};

export const commercialDeliveryStatus: McpToolDefinition<typeof entregaInputShape> = {
  name: "commercial_delivery_status",
  description:
    "Consulta a situação de ENTREGA dos pedidos internos do contato: se já embarcou, em qual carga, " +
    "e se está separado (na_carga), a caminho (em_rota), entregue ou devolvido. Use quando o cliente " +
    "perguntar 'e meu pedido?', 'saiu para entrega?', 'chegou?' — responda com este status em vez de " +
    "prometer prazo. Pedido sem embarque volta embarcado=false (ainda não saiu).",
  inputSchema: entregaInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    let q = ctx.supabase
      .from("commercial_orders")
      .select("id, numero, status")
      .eq("organization_id", ctx.organizationId)
      .eq("contact_id", input.contact_id);
    if (input.order_numero !== undefined) q = q.eq("numero", input.order_numero);
    const { data: pedidos, error } = await q.order("numero", { ascending: false }).limit(20);
    if (error) throw new Error(`consultar_entrega_falhou: ${error.message}`);

    if (!pedidos || pedidos.length === 0) {
      return {
        pedidos: [],
        aviso: "nenhum pedido interno encontrado para este contato — não prometa entrega sem isto.",
      };
    }

    // Segunda query: o embarque. Duas leituras em vez de um embed aninhado
    // com cast — a lista é de no máximo 20 pedidos.
    const { data: embarques, error: errEmb } = await ctx.supabase
      .from("shipment_orders")
      .select("order_id, sequencia, status, shipments ( numero, status )")
      .eq("organization_id", ctx.organizationId)
      .in("order_id", pedidos.map((p) => p.id));
    if (errEmb) throw new Error(`consultar_carga_falhou: ${errEmb.message}`);

    interface Embarque {
      order_id: string;
      sequencia: number;
      status: string;
      shipments: Array<{ numero: number; status: string }> | { numero: number; status: string } | null;
    }
    const porPedido = new Map<string, Embarque>();
    for (const e of (embarques ?? []) as unknown as Embarque[]) porPedido.set(e.order_id, e);

    return {
      pedidos: pedidos.map((p) => {
        const e = porPedido.get(p.id);
        const carga = e
          ? Array.isArray(e.shipments)
            ? (e.shipments[0] ?? null)
            : e.shipments
          : null;
        return {
          pedido: `PED-${String(p.numero).padStart(4, "0")}`,
          pedido_status: p.status,
          embarcado: !!e && !!carga,
          ...(e && carga
            ? {
                carga_numero: carga.numero,
                carga_status: carga.status,
                entrega_status: e.status,
                ordem_na_rota: e.sequencia,
              }
            : {}),
        };
      }),
    };
  },
};

// ---------------------------------------------------------------------------
// buscar no catálogo
// ---------------------------------------------------------------------------

const produtosInputShape = {
  termo: z
    .string()
    .trim()
    .min(2)
    .describe("o que a pessoa disse — pode ser o nome, a marca, o código ou tudo junto"),
  // Teto 60 (era 20): pergunta ampla ("saco de lixo", 47 opções) precisa da
  // lista INTEIRA para o agente mandar tudo de uma vez — medido em 2026-10-15.
  // Default segue 8 para pergunta específica; ampla pede limite alto.
  limite: z.number().int().min(1).max(60).optional().default(8),
  // Default FALSE de propósito (medido em 2026-10-15): com `true`, loja cujo
  // estoque não é contado some da resposta — "solupa" devolvia só o 20L
  // (único com saldo) e escondia o 2L/5L/60L que a loja TEM. Cada item já vem
  // com `disponivel` explícito; quem decide o que prometer é o agente, com a
  // regra de confirmar estoque antes de fechar.
  somente_disponiveis: z.boolean().optional().default(false),
};

/** O preço como a pessoa lê, não como o banco guarda. */
function precoLegivel(cents: number, moeda: string): string {
  const valor = (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  return moeda === "BRL" ? `R$ ${valor}` : `${moeda} ${valor}`;
}

/**
 * O aviso que a busca manda junto com o resultado.
 *
 * ⚠️ OS DOIS SOMAM, NÃO SE EXCLUEM — e a ordem importa. Eram `if/else` com o
 * empate ganhando, e a precedência reabria justamente o buraco que o
 * relaxamento veio fechar. Medido: "iphone 15 pro 512" numa loja sem nenhum 512
 * relaxa, acha o 128 e o 256, os dois empatam em 1.000 — e o agente recebia
 * "pergunte qual é" em vez de "não há 512 aqui". Ele perguntaria "128 ou 256?"
 * a quem pediu 512.
 *
 * E não é coincidência rara: os dois coincidem SEMPRE que a variante ausente
 * empata os candidatos restantes, que é o formato do caso.
 *
 * O relaxamento vem primeiro porque é a restrição mais forte: saber que a loja
 * não tem o que foi pedido muda a resposta inteira; saber qual dos dois é
 * apenas a próxima pergunta.
 */
/**
 * Tamanho da página da varredura do catálogo.
 *
 * 1000 é o `max_rows` declarado em `supabase/config.toml:12` — pedir mais numa
 * página não traz mais nada, o servidor corta de qualquer jeito.
 */
const TAMANHO_DA_PAGINA = 1000;

/**
 * Teto DECLARADO da varredura: 10 páginas = 10 000 produtos.
 *
 * O teto existe porque a pontuação roda em memória e um catálogo sem limite
 * puxaria a loja inteira a cada pergunta de preço. O que muda em relação ao
 * `.limit(2000)` anterior não é só o número: é que estourar este teto agora
 * PRODUZ UM SINAL (`varreduraParcial`) em vez de virar silêncio.
 */
const PAGINAS_MAXIMAS = 10;

export function avisosDaBusca(input: {
  empate: boolean;
  ignorados: readonly string[];
  /** Tudo que voltou é acessório/alternativa — opcional para não quebrar chamadas existentes. */
  soRelacionadas?: boolean;
}): string {
  const avisos: string[] = [];
  if (input.ignorados.length > 0) {
    avisos.push(
      `não há produto com ${input.ignorados.join(" nem ")} no catálogo desta loja. ` +
        "O que está aqui foi encontrado IGNORANDO esse número. Se ele era a capacidade, o " +
        "tamanho ou o modelo que a pessoa pediu, diga que a loja não tem essa opção — " +
        "NÃO responda o preço destes como se fossem o que ela pediu. Se era quantidade ou " +
        "orçamento, siga normalmente.",
    );
  }
  if (input.empate) {
    avisos.push(
      "mais de um produto casa igualmente o que a pessoa disse, e o preço deles é diferente. " +
        "Pergunte qual é antes de responder valor.",
    );
  }
  if (input.soRelacionadas === true) {
    avisos.push(
      "atenção: TUDO que voltou é acessório ou alternativa do pedido, nada é o produto em si. " +
        "NÃO apresente nenhum como se fosse o pedido — diga que não encontrou o item completo " +
        "e ofereça a alternativa deixando clara a diferença.",
    );
  }
  return avisos.join(" ");
}

export const crmSearchProducts: McpToolDefinition<typeof produtosInputShape> = {
  name: "crm_search_products",
  description:
    "Busca no catálogo da loja e devolve o PREÇO EXATO, o que está disponível e o código de cada " +
    "produto. Use SEMPRE que a pessoa perguntar preço, e responda com o valor que voltar aqui — " +
    "nunca com um valor que você lembra ou estima: preço errado dito a um cliente é promessa que a " +
    "loja terá de cumprir ou desfazer. " +
    "Passe o que a pessoa escreveu, do jeito que ela escreveu: a busca entende erro de digitação " +
    "('ifone') e acha por marca, categoria ou código. " +
    "⚠️ PRINCIPAL × ACESSÓRIO — cada produto pode voltar com `relacao: \"relacionada\"`: é um " +
    "acessório, peça ou combo do que foi pedido (cabo avulso para quem pediu vassoura, refil " +
    "para quem pediu rodo, pá com coletor + vassoura para quem pediu vassoura), NUNCA a resposta. " +
    "alternativa EXPLÍCITA ('não temos a vassoura, mas temos o cabo avulso por R$ X — quer?'). Se " +
    "a pessoa pediu o acessório pelo nome ('quero um cabo'), ele volta sem marcação: é o pedido. " +
    "⚠️ PERGUNTA DE CONTINUAÇÃO sem produto novo ('qual vocês têm?', 'e os preços?'): NÃO busque " +
    "o texto solto — repita o termo da sua busca anterior da conversa, que já tem o produto. " +
    "⚠️ SE VOLTAR MAIS DE UM produto com `empate: true`, NÃO escolha por conta própria — os dois " +
    "casam igualmente o que ela disse, e a diferença entre eles é de preço. Pergunte qual é. " +
    "Cada produto volta com `disponivel` (false = sem saldo no controle de estoque): apresente " +
    "todas as variações com preço, e para as marcadas false diga que confirma o estoque antes " +
    "de prometer. `total_encontrados` diz quantos casaram antes do corte do `limite`: se ele " +
    "for bem maior que a lista, NÃO afirme que são só aqueles — resuma por tamanho e pergunte " +
    "qual. Lista vazia significa que a loja não tem esse item cadastrado: não invente, " +
    "ofereça consultar com a equipe.",
  inputSchema: produtosInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    // Traz os ativos da org e pontua em memória. A busca por token (palavra
    // difusa, número exato) não é exprimível num `ilike` — e é ela que impede o
    // 128GB de aparecer para quem pediu 256GB. O corte por org acontece no
    // banco, que é o que importa para o isolamento.
    //
    // ⚠️ O TETO PEDIDO NÃO ERA O TETO APLICADO. `supabase/config.toml:12`
    // declara `max_rows = 1000`: o PostgREST corta a resposta nesse número, e o
    // `.limit(2000)` que estava aqui nunca trouxe 2000 — trouxe no máximo 1000.
    // Por isso a truncagem NÃO pode ser deduzida de `linhas.length === limite`:
    // o corte é do servidor e o cliente não sabe qual é. Quem sabe é o `count`,
    // que a consulta passa a pedir — varredura parcial vira DADO, não palpite.
    //
    // E sem `ORDER BY` o Postgres devolve linhas ARBITRÁRIAS: a ordem é a que o
    // plano der, e muda com o tempo e com o vacuum. Numa loja acima do teto, o
    // produto pedido podia não estar no lote que veio, e a busca respondia "não
    // há nada com esse nome" para um produto que a loja TEM. (issue #480)
    // ⚠️ `count` é `number | null`, e o `null` NÃO significa zero: significa que
    // o servidor não disse quantos há (cabeçalho `Content-Range` ausente ou não
    // parseável — proxy, gateway, versão). A versão anterior fazia
    // `total = count ?? total` com `total` iniciado em 0, e a parada
    // `linhas.length >= total` virava `>= 0` — verdadeira já na primeira página.
    // Resultado: varria 1 página de uma loja de 3000, não achava, e ainda dizia
    // "não há nada com esse nome" com `varreduraParcial` FALSO, porque
    // `0 > 1000` é falso. O defeito da issue #480 voltava inteiro e em silêncio.
    //
    // Agora quem prova o fim é uma PÁGINA VAZIA, que é fato independente do
    // count: não há linha depois de `de`. O count, quando vem, só antecipa a
    // parada. E `varreduraParcial` passa a ser "não cheguei ao fim", em vez de
    // uma comparação com um total que pode nunca ter existido.
    const linhas: unknown[] = [];
    let total: number | null = null;
    let alcancouOFim = false;
    for (let pagina = 0; pagina < PAGINAS_MAXIMAS; pagina++) {
      const de = pagina * TAMANHO_DA_PAGINA;
      const { data: lote, error, count } = await ctx.supabase
        .from("catalog_products")
        .select(
          "id, codigo, nome, descricao, marca, categoria, preco_cents, moeda, controla_estoque, quantidade, ativo, destaque, preco_promocional_cents, promocao_ate",
          { count: "exact" },
        )
        .eq("organization_id", ctx.organizationId)
        .eq("ativo", true)
        // Ordem estável e única: o corte, quando houver, é reproduzível — e a
        // paginação por `range` só é correta sobre uma ordem determinística.
        .order("codigo", { ascending: true })
        .range(de, de + TAMANHO_DA_PAGINA - 1);

      if (error) throw new Error(`buscar_produtos_falhou: ${error.message}`);
      if (count !== null) total = count;
      const recebidas = lote ?? [];
      linhas.push(...recebidas);
      // Página vazia = não há mais nada. Vale mesmo sem count.
      if (recebidas.length === 0) {
        alcancouOFim = true;
        break;
      }
      // Com count, dá para parar sem gastar a ida que confirmaria o vazio —
      // que é o caso da esmagadora maioria das lojas, pequenas e numa página só.
      if (total !== null && linhas.length >= total) {
        alcancouOFim = true;
        break;
      }
    }

    const data = linhas;
    // A varredura foi parcial? Isso é o que separa "não achei no que varri" de
    // "a loja não tem" — e só a segunda pode ser dita ao cliente.
    const varreduraParcial = !alcancouOFim;

    type Linha = {
      id: string;
      codigo: string;
      nome: string;
      descricao: string | null;
      marca: string | null;
      categoria: string | null;
      preco_cents: number;
      moeda: string;
      controla_estoque: boolean;
      quantidade: number;
      destaque: boolean | null;
      preco_promocional_cents: number | null;
      promocao_ate: string | null;
    };

    const { achados, ignorados } = buscarComRelaxamento((data ?? []) as Linha[], input.termo);

    // `controla_estoque` é o conserto de uma armadilha da versão anterior, que
    // filtrava por quantidade sempre: numa loja que não conta estoque (decant de
    // perfume, item sob encomenda) o catálogo INTEIRO ficava invisível.
    const disponiveis = input.somente_disponiveis
      ? achados.filter((a) => !a.produto.controla_estoque || a.produto.quantidade > 0)
      : achados;

    const topo = disponiveis.slice(0, input.limite);

    // §10 — diagnóstico da busca sem conteúdo privado: contagens e classificação,
    // nunca o termo cru além de um prefixo curto (pode carregar dado do cliente).
    logger.info('[mcp.crm_search_products]', {
      diretas: disponiveis.filter((a) => a.relacao === 'direta').length,
      relacionadas: disponiveis.filter((a) => a.relacao === 'relacionada').length,
      ignorados,
      total_encontrados: disponiveis.length,
      varredura_parcial: varreduraParcial,
    });

    if (topo.length === 0) {
      if (achados.length > 0) {
        return {
          produtos: [],
          mensagem:
            "esse produto existe no catálogo, mas está sem estoque. Não prometa: ofereça avisar quando chegar.",
        };
      }
      // Afirmar ausência exige ter varrido o catálogo inteiro. Sobre uma
      // amostra, a frase honesta é outra — e ela leva o agente a uma conduta
      // diferente com o cliente, que é o ponto.
      return {
        produtos: [],
        mensagem: varreduraParcial
          ? `não encontrei entre os ${linhas.length} produtos que consegui consultar, e o catálogo ` +
            `desta loja tem ${total}. NÃO diga que a loja não tem — diga que vai confirmar com a ` +
            "equipe. Se a pessoa souber o código ou o nome exato, peça: com ele a busca acha."
          : "não há nada com esse nome no catálogo da loja. Não invente preço — diga que vai confirmar com a equipe.",
      };
    }

    // Empate é o sinal de que a pessoa precisa escolher. Ex.: "iphone 15 pro 256"
    // casa o Pro e o Pro Max igualmente, e a diferença entre eles é o preço.
    const empate = topo.length > 1 && topo[0]!.nota === topo[1]!.nota;

    // Só alternativas: o pedido não tem correspondência direta no que voltou.
    // É o caso "só tem o cabo" — o modelo precisa DIZER isso, não apresentar o
    // cabo como vassoura.
    const soRelacionadas =
      topo.length > 0 && topo.every((t) => t.relacao === 'relacionada');

    const mensagem = avisosDaBusca({ empate, ignorados, soRelacionadas });

    return {
      // Total ANTES do corte do limite: sem ele o agente trata a amostra
      // como o catálogo ("tem 10 e 100 litros" para 47 opções de saco de
      // lixo, medido em 2026-10-15). Com o total ele resume por tamanho e
      // pergunta, em vez de afirmar sobre o que não viu.
      total_encontrados: disponiveis.length,
      produtos: topo.map(({ produto, relacao }) => {
        // Mesmo preço de vitrine da tela: promoção válida vence o base — uma
        // regra só, ou o agente anuncia um preço e o pedido cobra outro.
        const vitrine = precoDeVitrine(
          {
            preco_cents: produto.preco_cents,
            preco_promocional_cents: produto.preco_promocional_cents,
            promocao_ate: produto.promocao_ate,
          },
          new Date().toISOString().slice(0, 10),
        );
        return {
          codigo: produto.codigo,
          nome: produto.nome,
          preco: precoLegivel(vitrine.cents, produto.moeda),
          preco_cents: vitrine.cents,
          // Só o marcado viaja: `direta` é o default e não custa token. Quem lê
          // (modelo ou gate de identidade) trata ausência como direta.
          ...(relacao === 'relacionada' ? { relacao: 'relacionada' as const } : {}),
          ...(vitrine.emPromocao ? { em_promocao: true as const } : {}),
          ...(produto.marca ? { marca: produto.marca } : {}),
          ...(produto.descricao ? { descricao: produto.descricao } : {}),
          disponivel: !produto.controla_estoque || produto.quantidade > 0,
        };
      }),
      empate,
      // Relaxamento é o irmão do empate: nos dois a busca sabe que a resposta
      // NÃO é exatamente o que foi pedido, e nos dois quem decide é a pessoa.
      // A diferença é o que falta — no empate, qual das opções; aqui, se o
      // número que sumiu importava.
      ...(ignorados.length > 0 ? { numeros_ignorados: ignorados } : {}),
      ...(mensagem ? { mensagem } : {}),
    };
  },
};

/**
 * Fotos do produto (base do trabalho em andamento do usuário, integrada aqui
 * com registro no catálogo + testes). Lê `product_images` pelo código — nunca
 * descreve foto que não viu, nunca inventa caminho.
 */
const fotosDoProdutoShape = {
  codigo: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .describe("o CÓDIGO do produto, como voltou em `crm_search_products` — nunca o nome"),
};

export const crmGetProductPhotos: McpToolDefinition<typeof fotosDoProdutoShape> = {
  name: "crm_get_product_photos",
  description:
    "Devolve as fotos CADASTRADAS de um produto do catálogo, pelo código. Use quando a pessoa " +
    "pedir foto, imagem ou 'manda foto'. Cada foto volta com `storage_path`. Para ENVIAR, use " +
    "`crm_send_product_photo` com o mesmo código (ela resolve a foto e manda) — nunca invente " +
    "caminho. Lista vazia = o produto não tem foto cadastrada: diga isso e ofereça mandar " +
    "quando tiver, nunca descreva foto que não viu.",
  inputSchema: fotosDoProdutoShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const foto = await resolverFotoDoProduto(ctx.supabase, ctx.organizationId, input.codigo.trim());
    if (foto.found === false) return { fotos: [], mensagem: foto.mensagem };
    return {
      fotos: foto.fotos,
      ...(foto.fotos.length === 0 ? { mensagem: foto.mensagem } : {}),
    };
  },
};

/**
 * ENVIA a foto de um produto do catálogo na conversa do turno.
 *
 * Por que uma tool de envio em vez de `send_message` com anexo: o runtime
 * legado não tem tool de envio (manda pelo texto final), então anexo em
 * `send_message` só existiria no engine — dois caminhos com garantias
 * diferentes. Esta tool resolve (código → foto), valida e envia pelo handler
 * central nos DOIS runtimes, com a mesma idempotência. No engine ela é
 * BLOQUEADA de propósito (ver `BLOCKED_TOOL_IDS` em `edge/crm/mcp-tools.ts`):
 * lá o envio com legenda passa pela cadeia before_send; aqui, pelo handler
 * (opt-out, propriedade do caminho e sessão valem nos dois).
 */
const enviarFotoShape = {
  codigo: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .describe("o CÓDIGO do produto, como voltou em `crm_search_products` — nunca o nome"),
  legenda: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .optional()
    .describe("legenda curta sob a foto; omita para usar o nome do produto"),
};



/** Motivo da recusa — vocabulário fechado para o modelo não inventar leitura. */
type MotivoDaRecusa = "sem_conversa" | "produto_desconhecido" | "sem_foto";

export const crmSendProductPhoto: McpToolDefinition<typeof enviarFotoShape> = {
  name: "crm_send_product_photo",
  description:
    "ENVIA a foto cadastrada de um produto na conversa atual. Use DEPOIS de " +
    "`crm_get_product_photos` confirmar que há foto — nunca sem consultar. Sem foto " +
    "cadastrada a tool recusa (motivo `sem_foto`): diga isso ao cliente em vez de " +
    "descrever foto que não viu. A legenda default é o nome do produto.",
  inputSchema: enviarFotoShape,
  category: "write",
  // Piso `ai_operator`, igual a qualquer envio ao cliente: a foto SAI do
  // sistema para o celular de um terceiro e não volta atrás. Um `agent`
  // logado não alcança esta tool.
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    // Destino vem DO RUNTIME (conversa do turno/run), nunca do payload: mirar
    // conversa pelo input permitiria ao modelo escolher outra conversa da org.
    const conversaId = ctx.conversationId ?? null;
    if (!conversaId) {
      return { sent: false, motivo: "sem_conversa" as MotivoDaRecusa };
    }
    const foto = await resolverFotoDoProduto(ctx.supabase, ctx.organizationId, input.codigo);
    if (foto.found === false || foto.fotos.length === 0) {
      const motivo: MotivoDaRecusa = foto.found === false ? "produto_desconhecido" : "sem_foto";
      return { sent: false, motivo, mensagem: foto.mensagem };
    }
    const primeira = foto.fotos[0]!;
    const extensao = primeira.storage_path.split(".").pop()?.toLowerCase();
    const mime =
      extensao === "png" ? "image/png" : extensao === "webp" ? "image/webp" : "image/jpeg";
    const message = await sendMessageHandler(
      ctx.supabase,
      { organization_id: ctx.organizationId, actor: ctx.actor, requestId: ctx.requestId },
      {
        conversation_id: conversaId,
        type: "image",
        body: input.legenda ?? foto.produto.nome,
        media_storage_path: primeira.storage_path,
        media_mime: mime,
        metadata: { idempotency_key: `foto-produto:${ctx.requestId}:${foto.produto.id}` },
      },
    );
    return { sent: true, message_id: message.id, status: message.status };
  },
};

// ---------------------------------------------------------------------------
// montar rascunho de pedido (ATT.txt F4 — a IA vende de verdade)
// ---------------------------------------------------------------------------

const montarPedidoShape = {
  contact_id: z.string().uuid().optional().describe("o cliente, quando você sabe quem é na conversa"),
  cliente_nome: z.string().trim().min(2).max(200).describe("nome do cliente para o cabeçalho do pedido"),
  itens: z
    .array(
      z.object({
        codigo: z.string().trim().min(1).max(60).describe("o CÓDIGO do produto, como voltou em `crm_search_products` — nunca o nome"),
        quantidade: z.number().int().min(1).max(1000),
      }),
    )
    .min(1)
    .max(20),
  observacoes: z.string().trim().max(2000).optional(),
};

export const commercialCreateOrder: McpToolDefinition<typeof montarPedidoShape> = {
  name: "commercial_create_order",
  description:
    "Monta o RASCUNHO de um pedido comercial a partir do que o cliente pediu na conversa. " +
    "Use quando o cliente confirmou os itens e as quantidades: a ferramenta cria o pedido como " +
    "RASCUNHO (origem ia) e devolve o número e o total para você mostrar e pedir a confirmação final. " +
    "RASCUNHO NÃO É VENDA: estoque não baixa de verdade para rascunho, e um humano aprova depois — " +
    "diga isso ao cliente ('deixei o pedido montado, o vendedor confirma já já'). " +
    "Passe CÓDIGOS vindos de `crm_search_products`, nunca nomes lembrados: código que não existe " +
    "é recusado e a recusa nomeia qual. Preço sai do catálogo, não do seu input — você não informa preço. " +
    "Se o cliente ainda está comparando opções, NÃO monte pedido: apresente os produtos primeiro.",
  inputSchema: montarPedidoShape,
  category: "write",
  // Piso `ai_operator`, não `agent`: criar pedido muda a casa (estoque
  // reservado, crédito consumido) e não é trabalho de atendente. `ai_operator`
  // vive só no token efêmero — nenhuma pessoa o alcança — e é o papel do
  // agente publicado, então a IA continua alcançando deliberadamente.
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    // Resolve códigos → produtos (match exato no código da org). Nome não
    // resolve: nome é ambíguo e preço errado é promessa.
    const codigos = [...new Set(input.itens.map((i) => i.codigo))];
    const { data: prods, error } = await ctx.supabase
      .from("catalog_products")
      .select("id, codigo, preco_cents")
      .eq("organization_id", ctx.organizationId)
      .eq("ativo", true)
      .in("codigo", codigos);
    if (error) throw new Error(`montar_pedido_falhou: ${error.message}`);
    const porCodigo = new Map(((prods ?? []) as { id: string; codigo: string; preco_cents: number }[]).map((p) => [p.codigo, p]));
    const faltando = codigos.find((c) => !porCodigo.has(c));
    if (faltando) {
      return {
        rascunho: false,
        motivo: "codigo_desconhecido",
        mensagem: `não há produto com código "${faltando}" no catálogo. Confira com \`crm_search_products\` e tente de novo — não chute outro código.`,
      };
    }

    const resultado = await criarPedidoComercial(ctx.supabase, ctx.supabase, {
      orgId: ctx.organizationId,
      userId: null,
      // IA nunca ignora trava comercial: sem estoque ou sem crédito, o
      // rascunho volta recusado e você explica ao cliente.
      podeIgnorar: false,
    }, {
      contact_id: input.contact_id ?? null,
      cliente_nome: input.cliente_nome,
      status: "rascunho",
      origem: "ia",
      moeda: "BRL",
      desconto_cents: 0,
      frete_cents: 0,
      modalidade_frete: "retirada",
      ignorar_estoque: false,
      ignorar_credito: false,
      ...(input.observacoes ? { observacoes: input.observacoes } : {}),
      itens: input.itens.map((i) => {
        const p = porCodigo.get(i.codigo);
        return {
          product_id: p ? p.id : null,
          quantidade: i.quantidade,
          preco_unit_cents: p ? p.preco_cents : 0,
          desconto_pct: 0,
        };
      }),
    });

    if (!resultado.ok) {
      return {
        rascunho: false,
        motivo: resultado.code,
        mensagem: resultado.message + " Explique ao cliente com suas palavras e ofereça alternativa.",
      };
    }

    const pedido = resultado.pedido as { numero: number; total_cents: number; id: string };
    const total = (pedido.total_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    return {
      rascunho: true,
      numero: `PED-${String(pedido.numero).padStart(4, "0")}`,
      total: `R$ ${total}`,
      itens: resultado.itens,
      mensagem:
        "Rascunho montado — mostre número e total ao cliente e peça a confirmação. " +
        "Avise que um vendedor confere e aprova em seguida.",
    };
  },
};
