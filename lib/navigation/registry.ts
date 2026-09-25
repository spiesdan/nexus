import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

import { ROLE_RANK, type Role } from "@/lib/auth/types";
import {
  Archive,
  Bell,
  BookOpen,
  Brain,
  Buildings,
  CalendarBlank,
  ChartBar,
  ChartLineUp,
  ClipboardText,
  ClockCountdown,
  ClockCounterClockwise,
  FileText,
  Flag,
  FlowArrow,
  Funnel,
  Gauge,
  Inbox,
  Kanban,
  Key,
  Lightbulb,
  ListChecks,
  Lock,
  MagnifyingGlass,
  Package,
  Palette,
  Plugs,
  PlugsConnected,
  PuzzlePiece,
  Receipt,
  Robot,
  ScalesSimple,
  ShieldCheck,
  ShoppingCart,
  Signpost,
  Storefront,
  Sun,
  Truck,
  UserCircle,
  Users,
  UsersThree,
  Wallet,
  WebhooksLogo,
} from "@/lib/ui/icons";

/**
 * Registro de navegação — a ÚNICA lista de destinos do app do tenant.
 *
 * Antes disto, três listas descreviam o mesmo conjunto e divergiam: `NAV_ITEMS`
 * no Sidebar, `LINKS` no hub de Configurações e `TABS` na área de IA. Sete telas
 * só eram alcançáveis por dentro da própria seção e uma não tinha link nenhum.
 *
 * Sidebar, hubs e a paleta ⌘K são PROJEÇÕES puras deste array — nenhum deles
 * decide o que existe, só desenha o que sai daqui. Tela nova aparece nos três
 * sem editar três arquivos, e `tests/unit/navegacao-completude.test.ts` reprova
 * o CI se uma rota nascer fora daqui.
 *
 * Doutrina: docs/doctrine/sistema-vivo.md — "por qual porta se chega até mim?"
 */

export type NavGroupId =
  | "visao"
  | "vendas"
  | "atendimento"
  | "ia"
  | "operacao"
  | "financeiro"
  | "fiscal"
  | "equipe"
  | "organizacao";

export interface NavGroup {
  id: NavGroupId;
  label: string;
  /**
   * Hub do grupo, quando ele tem telas demais para caber no sidebar.
   * O rótulo é declarado junto do href porque não é derivável: "Ver tudo em IA"
   * é útil, "Ver tudo em Organização" seria gratuito quando a tela já se chama
   * Configurações e o usuário a conhece por esse nome.
   */
  hub?: { href: string; label: string };
}

export interface NavDestination {
  href: string;
  label: string;
  /** Aparece no card do hub e é texto buscável no ⌘K. Nunca vazio. */
  description: string;
  icon: PhosphorIcon;
  group: NavGroupId;
  /** Obrigatória em grupo com hub — é o agrupamento por jornada dentro dele. */
  section?: string;
  /** Ausente = viewer. Ver a regra de escolha abaixo. */
  minRole?: Role;
  /** Ausente = só no hub. `true` = uso diário, sobe para o sidebar. */
  sidebar?: boolean;
  healthDot?: boolean;
}

/**
 * Grupos por OBJETIVO, na ordem de uso — NEXUS §19 (Sidebar):
 *
 *   Visão geral · Vendas · Atendimento · Inteligência · Operação ·
 *   Financeiro · Fiscal · Equipe · Configurações (rodapé)
 *
 * Os quatro primeiros são o dia a dia (do dono, do comercial, do operador e
 * da IA); Operação/Financeiro/Fiscal/Equipe são o back-office; Configurações
 * (era "Organização") fica fixa no rodapé.
 *
 * ORÇAMENTO DA DOBRA — medido, não estimado (§19 "a dobra é medida"):
 * medição real em 1280×900 (`tests/e2e/medir-dobra.spec.ts`) deu nav=763px e
 * o modelo `conteudo = 4 + 30·L + 25·H` (L = links do grupo rolável,
 * H = títulos), com a linha do item INTOCADA em 28px. Restrição
 * `12 + 30L + 25H ≤ 763` ⇒ `30L + 25H ≤ 751`. Com H = 8 títulos (Configurações
 * é rodapé, não conta): L ≤ 18. O menu antigo media 25 links + 5 títulos =
 * 879px contra 763px — FOLGA −116px, rolava; era por isso que o teste da dobra
 * passava vazia (org e2e inexistente ⇒ nav sem links). As 18 portas abaixo
 * dão 740px ⇒ FOLGA +23px.
 *
 * O que o §19 NÃO lista ficou de fora do sidebar (porta = hub do grupo ou
 * ⌘K), com a dobra medida como motivo: Indicadores, Desempenho, Relatórios,
 * Etapas do funil, Respostas rápidas, Agentes, Roteadores, Conexões,
 * Nuvemshop, Webhooks, Evolução da IA, Audit Log. Três INFIDOS, por terem
 * teste dedicado que decide: Agenda fica (papel de "porta do dia",
 * agenda-tela-do-produto); Funis = "Oportunidades" da §19 (label mantido);
 * a raiz de Financeiro = as quatro abas da §19 numa tela só (labels das abas
 * carregam os nomes §19). Dissolvidos: os grupos Canais e Análise (§19 não
 * os tem) — suas telas viraram seções do hub de Configurações e de
 * Inteligência.
 */
export const NAV_GROUPS: NavGroup[] = [
  { id: "visao", label: "Visão geral" },
  { id: "vendas", label: "Vendas" },
  { id: "atendimento", label: "Atendimento" },
  { id: "ia", label: "Inteligência", hub: { href: "/app/ai", label: "Ver tudo em IA" } },
  { id: "operacao", label: "Operação" },
  { id: "financeiro", label: "Financeiro" },
  { id: "fiscal", label: "Fiscal" },
  { id: "equipe", label: "Equipe" },
  {
    id: "organizacao",
    label: "Configurações",
    hub: { href: "/app/settings", label: "Configurações" },
  },
];

/**
 * Grupo cujo hub vive no RODAPÉ fixo do sidebar, fora da área que rola.
 *
 * Medido em tela (1280×768, o notebook comum): com todos os grupos na área
 * rolável, o conteúdo dava 1019px contra 663px visíveis — Configurações ficava
 * fora da dobra em TODAS as alturas testadas, inclusive 1080px. É o item que
 * mais se procura quando não se acha algo; deixá-lo dependendo de scroll
 * recriaria, em outra forma, o problema que esta reorganização veio resolver.
 */
export const GRUPO_NO_RODAPE: NavGroupId = "organizacao";

/**
 * Como `minRole` foi escolhido — medido tela a tela, não estimado:
 *
 *   1. A página redireciona por papel?  → usa esse papel. Assim a navegação
 *      nunca mostra um link que morre em /403.
 *   2. Não redireciona, mas a navegação antiga já filtrava? → mantém o filtro
 *      antigo, para esta mudança reorganizar sem alterar quem vê o quê.
 *   3. Nenhum dos dois → viewer.
 *
 * `ROLE_RANK` só distingue papel dentro do tenant; capacidade interna da tela
 * (`canShare` em Respostas rápidas, `canCompare` em Desempenho) NÃO é porta
 * fechada e por isso não vira `minRole`.
 */
export const NAV_DESTINATIONS: NavDestination[] = [
  // ---- Visão geral — a mesa do dono: onde o dia começa ----
  {
    // NEXUS §19 (VISÃO GERAL) + §20: o Dashboard é o primeiro item do sidebar,
    // a porta de entrada (`app/app/page.tsx` já é a Home, não um redirect).
    // O logo do topo também aponta para cá — o item existe porque a §19 o
    // lista, e dois caminhos para a mesma tela custam uma linha, não um pixel
    // de descoberta. ⚠️ href "/app" é prefixo de TODO caminho do tenant: o
    // `isActive` do Sidebar trata esta rota com igualdade exata, senão o
    // Dashboard ficaria ativo em todas as telas.
    href: "/app",
    label: "Dashboard",
    description: "Clientes para agir, roadmap, radar e o que a IA recomenda agora.",
    icon: Gauge,
    group: "visao",
    sidebar: true,
  },
  {
    // NEXUS §21/§19: "o que preciso fazer agora?" — tarefas, follow-ups e
    // recomendações num lugar só. A §19 o lista em VISÃO GERAL (não em
    // Atendimento), porque é a tela de quem decide o dia, não de quem atende
    // o telefone. Portas: este item e o ⌘K; a landing pós-login continua
    // sendo o Dashboard.
    href: "/app/meu-dia",
    label: "Meu Dia",
    description: "O que fazer agora: tarefas, follow-ups ativos e recomendações.",
    icon: Sun,
    group: "visao",
    sidebar: true,
  },
  {
    // A §19 mantém em VISÃO GERAL só Dashboard + Meu Dia. Medição da dobra
    // (18 links + 8 títulos = 744px de 763px) não comporta um terceiro: a
    // porta do Indicadores é o ⌘K e o Dashboard, que herda os agregados do mês
    // (mesma fonte, `agregadosDoMes` — a mesma pergunta respondida em dois
    // lugar é o que este destino nunca devia ter sido).
    href: "/app/indicadores",
    label: "Indicadores",
    description: "Evolução de venda, carteira de clientes, ranking e curva ABC do mês.",
    icon: ChartLineUp,
    group: "visao",
  },
  {
    // Global Search (§17): a PÁGINA de resultados — a paleta ⌘K é a
    // abreviação, esta é a tela completa, com navegação e as seis entidades do
    // `lib/busca/global` lado a lado. §19 não a lista no sidebar e a dobra
    // medida (18 links + 8 títulos = 744px de 763px) não comporta mais uma
    // porta: a porta é o ⌘K, o botão "Buscar…" do topo e o Enter dentro da
    // própria busca.
    href: "/app/busca",
    label: "Busca",
    description: "Resultados da busca global: telas, conversas, clientes, pedidos, leads, produtos e títulos.",
    icon: MagnifyingGlass,
    group: "visao",
  },

  // ---- Atendimento — onde o operador passa o dia ----
  {
    href: "/app/inbox",
    label: "Inbox",
    description: "As conversas de WhatsApp, com você e a IA atendendo lado a lado.",
    icon: Inbox,
    group: "atendimento",
    sidebar: true,
  },
  {
    href: "/app/radar",
    label: "Radar",
    description: "Quem esfriou e ainda está aberto — o que corre risco de morrer sem resposta.",
    icon: ClockCountdown,
    group: "atendimento",
    sidebar: true,
  },
  {
    // §19 (ATENDIMENTO): terceiro item do grupo na ordem da spec — Inbox,
    // Radar, Follow-ups. Era tela do hub de IA; vira item de sidebar com o
    // minRole manager que sempre teve (o grupo de hub perde um card da
    // jornada "Montar o agente" — sem prejuízo: o hub é inventário completo,
    // e o card também aparece no ⌘K).
    href: "/app/ai/followups",
    label: "Follow-ups",
    description: "Como o agente retoma uma conversa que esfriou, para nenhuma morrer no silêncio.",
    icon: FlowArrow,
    group: "atendimento",
    minRole: "manager",
    sidebar: true,
  },
  {
    // Entra em "atendimento", e não em "organizacao", porque a Agenda é onde o
    // dia acontece e não onde ele se configura: quem atende abre isto de manhã
    // junto com o Inbox. Os TIPOS de agendamento — que são configuração de
    // verdade — foram para Configurações, como este comentário previa: ver
    // `/app/settings/tenant/agenda` no grupo "organizacao".
    //
    // ⚠️ ESTA FRASE ESTAVA VENCIDA: dizia "a disponibilidade ainda não tem tela",
    // e tem — é a aba "Atendimento" de `/app/team`, com editor de fuso e janelas
    // (`app/app/team/_components/AttendantsClient.tsx`). Ela chegou a custar uma
    // investigação inteira: quem leu isto aqui concluiu que faltava construir a
    // tela, quando o que faltava era o CAMINHO até ela. O aviso da Agenda agora
    // aponta para `/app/team?aba=atendimento`.
    //
    // §19 INFIDO: a Agenda não está na lista da §19, e entra mesmo assim. É a
    // "porta do dia" (a doutrina do Hub: onde o dia acontece é diferente de onde
    // ele se configura), e tem teste e2e dedicado clicando nela no menu
    // (`agenda-tela-do-produto.spec.ts`). O que cedeu na dobra medida foi as
    // Etapas do funil, que passou para o hub de Configurações.
    href: "/app/agenda",
    label: "Agenda",
    description: "O que está marcado, com quem, e quem atende — seu e da equipe.",
    icon: CalendarBlank,
    group: "atendimento",
    sidebar: true,
  },
  {
    // Renomeado de "Templates": estes são scripts do atendente, consumidos pelo
    // Composer do inbox. O nome "Templates" fica livre para os da Meta (HSM),
    // onde é o termo técnico correto.
    //
    // §19: "Respostas rápidas" não está na lista — SEM sidebar (a dobra medida
    // é o motivo, junto com Indicadores/Agentes/Roteadores). As portas são o
    // composer do Inbox (a tela que consome o conteúdo) e o ⌘K.
    href: "/app/templates",
    label: "Respostas rápidas",
    description: "Scripts salvos para responder mais rápido, seus ou da equipe.",
    icon: FileText,
    group: "atendimento",
  },

  // ---- Vendas — o funil ----
  {
    // ATT.txt Fase 2: o coração comercial. §19 o primeiro de VENDAS — pedido
    // nasce do funil e da conversa, não é configuração.
    href: "/app/pedidos",
    label: "Pedidos",
    description:
      "Os pedidos da loja, com origem (IA, vendedor, WhatsApp, B2B) e status do ciclo comercial.",
    icon: Receipt,
    group: "vendas",
    sidebar: true,
  },
  {
    href: "/app/contacts",
    label: "Clientes",
    description: "Seus clientes e o histórico de cada um.",
    icon: Users,
    group: "vendas",
    sidebar: true,
  },
  {
    // ⚠️ Esta tela nasceu porque a FERRAMENTA já existia sem ela. O agente de IA
    // vinha com "procurar produto na loja" ligada por padrão, lendo uma tabela
    // que ninguém nunca preencheu — e o efeito não era silêncio: era o agente
    // respondendo "não tenho nada com esse nome" para uma loja de estoque cheio.
    //
    // Fica no grupo de VENDAS, e não em Configurações, porque consultar preço é
    // trabalho de quem ATENDE, todo dia — diferente de "tipos de agendamento",
    // que se configura uma vez.
    href: "/app/products",
    label: "Produtos",
    description: "O catálogo da loja, com o preço que o atendente de IA responde.",
    icon: Storefront,
    group: "vendas",
    sidebar: true,
  },
  {
    // ⚠️ ERA "Kanban", e a URL continua sendo. O nome saiu da interface porque o
    // produto tinha CINCO vocabulários para a mesma coisa — "Kanban" no menu,
    // "Pipelines" no título desta tela, "Funis" no menu ao lado, "funil" em todo
    // o corpo dela e "quadro" no onboarding inteiro. Três deles no mesmo
    // viewport: o <h1> dizia "Pipelines", o estado vazio dizia "Sem pipelines
    // configurados" e o botão embaixo dizia "Criar meu primeiro funil".
    //
    // Ficou "Funis" porque é o que esta tela É: a lista dos funis, de onde se
    // abre o quadro de cada um. "Pipeline" é palavra de quem construiu o
    // sistema; "funil de vendas" é palavra de quem vende.
    //
    // §19 INFIDO: chama "Oportunidades" na lista do sidebar. Mantém "Funis" —
    // é o nome que a tela já é, com teste e2e exigindo-o por extenso, e o
    // vocabulário do dono de PME; renomear sem decisão explícita do dono seria
    // inventar regra de produto. A ordem física do array É a ordem do menu:
    // Pedidos, Clientes, Produtos, Oportunidades — a da §19.
    href: "/app/kanban",
    label: "Funis",
    description: "Seus funis de venda — clique em um para abrir o quadro de clientes.",
    icon: Kanban,
    group: "vendas",
    sidebar: true,
  },
  {
    // 0226: o "quanto cada vendedor leva" com Dar Baixa. O dono pergunta todo
    // mês — §19 o põe em EQUIPE, ao lado de quem compõe a comissão.
    href: "/app/comissoes",
    label: "Comissões",
    description: "Comissão por pedido no mês, com baixa do que já foi pago.",
    icon: ChartBar,
    group: "equipe",
    sidebar: true,
  },
  {
    // Títulos: consulta eventual de cobrança — SEM sidebar (§19: a dobra é
    // medida, e o grupo FINANCEIRO tem UMA porta rolável). A porta é o ⌘K e
    // a própria tela de Financeiro, que lista os títulos na aba "Receber".
    href: "/app/titulos",
    label: "Títulos",
    description: "Contas a receber por vencimento, derivadas dos pedidos faturados.",
    icon: ClockCountdown,
    group: "financeiro",
  },
  {
    // §19: consulta eventual (doutrina da dobra, como Recuperação) — sem
    // sidebar; porta no ⌘K e no grupo FISCAL.
    href: "/app/faturamento",
    label: "Faturamento",
    description: "Pedidos faturados com a NF vinculada.",
    icon: Archive,
    group: "fiscal",
  },
  {
    // FINANCEIRO — §19 lista o grupo com QUATRO portas ("Contas a Pagar",
    // "Contas a Receber", "Cobranças", "Fluxo de Caixa"), e esta tela as tem
    // como abas. Rotas finas por aba (§19 literal) virariam 4×30px sem ganho
    // de descoberta; a tela-com-abas entrega as quatro atrás de um link —
    // decisão registrada no handoff (passo 5). O rótulo do link é a primeira
    // porta da lista.
    href: "/app/financeiro",
    label: "Contas a Receber",
    description:
      "O financeiro inteiro: contas a receber, pagar, cobranças e fluxo de caixa, com conciliação pedido × NF.",
    icon: Wallet,
    group: "financeiro",
    sidebar: true,
  },
  {
    // O "detalhar carteira" do Mercos: cada cliente na sua situação, com
    // última compra e dias parado. Sem sidebar (doutrina da dobra): a porta
    // é o ⌘K e o donut do Indicadores.
    href: "/app/carteira",
    label: "Carteira",
    description: "Clientes por situação — ativos, inativos e prospects.",
    icon: Users,
    group: "vendas",
  },
  {
    // Rotina do vendedor externo (visitas, check-in, atividades). Sem sidebar
    // (§19 não a lista; dobra medida): a porta é o ⌘K.
    href: "/app/tarefas",
    label: "Tarefas",
    description: "Visitas agendadas, check-in e atividades realizadas.",
    icon: ClockCountdown,
    group: "vendas",
  },
  {
    // Estoque (NEXUS §46): saldo, razão de movimentações e sugestão de
    // recomposição. OPERAÇÃO na §19 — e a ordem física É a da spec: Estoque,
    // Compras, Expedição.
    href: "/app/estoque",
    label: "Estoque",
    description: "Saldo dos produtos, movimentações e sugestão de compra.",
    icon: Package,
    group: "operacao",
    sidebar: true,
  },
  {
    // Compras (NEXUS §47): a §19 a lista em OPERAÇÃO, e a entrada no sidebar
    // vem com ela — a promessa do comentário antigo, cumprida.
    href: "/app/compras",
    label: "Compras",
    description: "Pedidos de compra aos fornecedores e quem os fornece.",
    icon: ShoppingCart,
    group: "operacao",
    sidebar: true,
  },
  {
    // ATT.txt Fase 3: transporte próprio. §19 o lista em OPERAÇÃO — expedir é
    // back-office: acontece depois da venda, no galpão.
    href: "/app/expedicao",
    label: "Expedição",
    description: "Cargas do transporte próprio, romaneio e controle de entregas.",
    icon: Truck,
    group: "operacao",
    sidebar: true,
  },
  {
    // Prospecção B2B: descobrir empresas por região/categoria e levar ao CRM.
    // Uma tela com abas (não 7 itens no menu): a dobra em 900px agradece.
    href: "/app/prospeccao",
    label: "Prospecção",
    description: "Encontre empresas por região e categoria e leve ao CRM.",
    icon: MagnifyingGlass,
    group: "vendas",
    sidebar: true,
  },
  {
    // ATT.txt Fase 3: fiscal. §19 a única porta rolável do grupo FISCAL.
    href: "/app/notas",
    label: "Notas fiscais",
    description: "Emita a partir do pedido faturado e acompanhe o status na SEFAZ.",
    icon: Archive,
    group: "fiscal",
    sidebar: true,
  },
  {
    // ATT.txt Fase 4: recuperação. §19 não a lista — SEM sidebar; a porta é o
    // alerta do Dashboard ("clientes sumidos") e o ⌘K.
    href: "/app/recuperacao",
    label: "Recuperação",
    description: "Quem comprava e parou, por ordem de prioridade — com ação direta.",
    icon: ClockCountdown,
    group: "vendas",
  },
  {
    // A promessa que o comentário da Agenda fazia desde que ela nasceu. Aqui se
    // decide O QUE se pode marcar, quanto dura e quem atende — e é isto que a
    // tela de marcar e o agente de IA oferecem ao cliente.
    //
    // Nasceu porque a `calendar_event_types` tinha dez categorias no CHECK,
    // duração, buffers e antecedência mínima, e NÃO havia como criar ou editar
    // um tipo por lugar nenhum: a organização recebia três semeados e ficava com
    // eles para sempre.
    href: "/app/settings/tenant/agenda",
    label: "Tipos de agendamento",
    description: "O que se pode marcar, quanto dura, onde acontece e quem atende.",
    icon: CalendarBlank,
    group: "organizacao",
    // "Sua empresa", junto de Atendimento e Empresa: é configuração do NEGÓCIO,
    // não da conta de quem está logado. O gate `navegacao-registry` cobra a
    // seção em todo grupo que tem hub, e sem ela o destino não aparece no hub.
    section: "Sua empresa",
    // SEM `sidebar`, como as outras DEZ entradas de "organizacao": este grupo
    // tem hub, e se chega às telas dele por "Configurações". Eu tinha posto
    // `sidebar: true` e a cerca reprovou dizendo "a tela existe e não tem porta
    // na navegação" — a porta existia, era outra.
  },
  {
    // Estava enterrado em Configurações e ninguém sabia que existia — o achado
    // que originou esta reorganização. A URL não muda; só o lugar na navegação.
    //
    // ⚠️ ERA "Funis", nome que ele DISPUTAVA com o destino acima: os dois
    // listavam as mesmas linhas de `crm_pipelines`, lado a lado no mesmo grupo,
    // com nomes que não diziam qual servia para quê. A diferença real é o VERBO,
    // e é ela que o nome carrega agora: lá se ABRE o funil, aqui se CONFIGURA o
    // que ele significa.
    //
    // §19: a lista não tem Etapas, e a dobra medida (−116px no menu antigo;
    // 18 links + 8 títulos = 744px de 763px no novo) não comportava mantê-la.
    // De volta ao hub de Configurações — que agora É um hub, com seção própria,
    // a um clique do rodapé fixo. O que sobrevive do achado original é o que
    // importa: FUNIS (o uso, o dia a dia) continua no sidebar, sem passar por
    // Configurações; a CONFIGURAÇÃO das colunas é tarefa ocasional, e o e2e
    // `navegacao.spec.ts` acompanhou a porta nova (hub → card → tela).
    href: "/app/settings/tenant/pipelines",
    label: "Etapas do funil",
    description: "As colunas de cada funil, o vocabulário do negócio e os motivos de perda.",
    icon: Funnel,
    group: "organizacao",
    minRole: "manager",
    section: "Sua empresa",
  },

  // ---- Inteligência — montar, ensinar, acompanhar (100% hub) ----
  {
    // §19: Agentes não está na lista — SEM sidebar (a dobra medida é o motivo).
    // O grupo INTELIGÊNCIA é o primeiro hub-only do menu: nenhum item rola no
    // sidebar, só o link "Ver tudo em IA". Agentes continua a primeira tela da
    // jornada "Montar o agente" lá dentro.
    href: "/app/ai/agents",
    label: "Agentes",
    description: "Quem atende por você: instruções, modelo, ferramentas e publicação.",
    icon: Robot,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
  },
  {
    // §19 não lista Roteadores — SEM sidebar (mesma medição de Agentes).
    href: "/app/ai/routers",
    label: "Roteadores",
    description: "Qual agente pega qual conversa, e quando o humano assume.",
    icon: Signpost,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/credentials",
    label: "Credenciais",
    description: "A chave do provedor de IA que os agentes usam para pensar.",
    icon: Key,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
  },
  {
    // O sistema chama modelo em 23 lugares e, até esta tela, a escolha vivia
    // espalhada por três pilhas de código e sete variáveis de ambiente — não
    // havia onde responder "quem usa IA aqui, e com qual chave?".
    href: "/app/ai/providers",
    label: "Provedores",
    description: "Qual inteligência atende cada parte do sistema — e o que acontece se ela falhar.",
    icon: Plugs,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
    // SEM `sidebar: true`, como TODAS as telas deste grupo (é 100% hub, §19).
    // Configurar provedor é tarefa de poucas vezes; o caminho é o hub
    // "Ver tudo em IA", igual a Credenciais, Conhecimento, Memória e Skills.
  },
  {
    href: "/app/ai/knowledge/sources",
    label: "Conhecimento",
    description: "Os materiais que o agente consulta antes de responder sobre o seu negócio.",
    icon: BookOpen,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/memory",
    label: "Memória",
    description: "O que o agente já aprendeu sobre a sua operação e reaproveita.",
    icon: Brain,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/skills",
    label: "Skills",
    description: "As ações que o agente pode executar sozinho durante o atendimento.",
    icon: PuzzlePiece,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/cases",
    label: "Casos",
    description: "Os atendimentos que o agente conduziu, do início ao desfecho.",
    icon: ClipboardText,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "agent",
  },
  {
    href: "/app/ai/inbox",
    label: "Alertas",
    description: "O que a IA encontrou e precisa de uma decisão sua.",
    icon: Flag,
    group: "ia",
    section: "Acompanhar o agente",
  },
  {
    // Órfã: nenhum lugar do app linkava para cá. O flywheel gerava propostas de
    // melhoria do agente e a fila só era vista por quem soubesse a URL.
    href: "/app/ai/proposals",
    label: "Propostas",
    description: "Melhorias que a IA sugere para si mesma, esperando sua decisão.",
    icon: Lightbulb,
    group: "ia",
    section: "Acompanhar o agente",
  },
  {
    // NEXUS FASE 10: o Decision Log com Aprovar/Recusar — ações que o
    // vendedor autônomo propôs, com motivo, dados e política.
    href: "/app/ai/decisoes",
    label: "Decisões",
    description: "Ações propostas pela IA esperando sua decisão, e o que já foi decidido.",
    icon: Flag,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "manager",
  },
  {
    // A tela de Uso responde "quanto gastei". Esta responde a pergunta que não
    // tinha lugar nenhum: "o agente parou de responder, o que aconteceu?".
    // Antes da migration 0128 ela seria impossível de construir com honestidade
    // — llm_calls só registrava sucesso.
    href: "/app/ai/runs",
    label: "Execuções",
    description: "O que a IA fez — e, quando falhou, o que aconteceu e o que fazer.",
    icon: ListChecks,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "manager",
    // Idem: fora da sidebar para o menu não passar da dobra. Quem vem para cá
    // está diagnosticando, e chega pelo hub ou pelo link do aviso na Central.
  },
  {
    href: "/app/ai/usage",
    label: "Uso e orçamento",
    description: "Quanto a IA consumiu e qual é o teto de gasto do mês.",
    icon: Gauge,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "manager",
  },
  {
    // NEXUS §56: o painel do gestor — decisões, oportunidades, follow-ups
    // e orçamento num lugar só. Sem sidebar (doutrina da dobra).
    href: "/app/ai/controle",
    label: "Controle de IA",
    description: "O que a IA propôs, decidiu, acompanha e consumiu.",
    icon: Gauge,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "manager",
  },

  // ---- Olhar o sistema funcionando — o grupo Análise, repartido pela §19 ----
  // A §19 não tem grupo "Análise": Desempenho/Relatórios/Audit Log viram
  // destinos de VISÃO GERAL sem sidebar (o dono olha o negócio), e
  // Evolução da IA/Inteligência passaram para o hub de INTELIGÊNCIA (a
  // jornada do agente). Porta de todos: ⌘K — e o hub, onde houver.
  {
    // §19 não lista Desempenho — SEM sidebar (medido: 18 links/8 títulos já
    // ocupam 744px dos 763px da nav em 1280×900).
    href: "/app/metrics",
    label: "Desempenho",
    description: "Funil e performance por atendente nos últimos 30 dias.",
    icon: ChartBar,
    group: "visao",
  },
  {
    // Observabilidade do agente: era o motivo de o grupo Análise existir
    // separado dos agentes. Com a §19 dissolvendo Análise, ela entra na
    // jornada — "Acompanhar" é o terceiro passo dela — e sai do sidebar
    // (mesma medição de Agentes/Roteadores).
    href: "/app/ai/evolution",
    label: "Evolução da IA",
    description: "Se o agente está melhorando, onde ele erra e o que falta ensinar.",
    icon: ChartLineUp,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "manager",
  },
  {
    // §19 não lista Audit Log — SEM sidebar (medido). minRole manager fica.
    href: "/app/audit",
    label: "Audit Log",
    description: "Quem fez o quê, quando — o histórico que não se apaga.",
    icon: ClockCounterClockwise,
    group: "visao",
    minRole: "manager",
  },
  {
    // ATT.txt F5 (sem B2B): vendas por vendedor/cliente/produto + Curva ABC.
    // §19 não lista — SEM sidebar; chega-se pelos Pedidos e pelo ⌘K.
    href: "/app/relatorios",
    label: "Relatórios",
    description: "Vendas por vendedor, cliente e produto, com Curva ABC e exportação.",
    icon: ClipboardText,
    group: "visao",
    minRole: "manager",
  },
  {
    // Grafo funcional de inteligência (NEXUS FASE 2): clientes, regiões,
    // situações de recompra, riscos, conhecimento e métricas — tudo lido das
    // APIs reais, nada decorativo. SEM sidebar (dobra medida): as portas são o
    // ⌘K, o link no Radar e o hub de Inteligência. Entra na seção
    // "Acompanhar o agente" porque é a tela de olhar o negócio enquanto o
    // agente trabalha — o hub é a única porta que o grupo tem.
    href: "/app/inteligencia",
    label: "Inteligência",
    description: "O grafo vivo do negócio — selecione nós e monte contextos para agir.",
    icon: Brain,
    group: "ia",
    section: "Acompanhar o agente",
  },

  // ---- Organização — conta, empresa, acesso ----
  {
    href: "/app/settings/profile",
    label: "Perfil",
    description: "Seu nome, idioma, fuso horário e avatar.",
    icon: UserCircle,
    group: "organizacao",
    section: "Sua conta",
  },
  {
    href: "/app/settings/security",
    label: "Segurança",
    description: "Verificação em duas etapas, códigos de recuperação e sessões.",
    icon: ShieldCheck,
    group: "organizacao",
    section: "Sua conta",
  },
  {
    href: "/app/settings/notifications",
    label: "Notificações",
    description: "Por onde e sobre o quê você quer ser avisado.",
    icon: Bell,
    group: "organizacao",
    section: "Sua conta",
  },
  {
    href: "/app/team",
    label: "Equipe",
    description: "Quem trabalha aqui, com qual papel e quanta conversa cada um aguenta.",
    icon: UsersThree,
    group: "equipe",
    // §19 (EQUIPE): o dono gerencia pessoas no grupo, não dentro de
    // Configurações. Sem sidebar (dobra medida) e sem seção — EQUIPE não tem
    // hub; a porta é o ⌘K e os cards de Comissões. O card SUMIU do hub de
    // Configurações junto com o movimento (seção obrigatória em grupo com hub).
  },
  {
    // A porta que faltava (issue #144): rodízio de atendimento e restrição de
    // visibilidade existiam inteiros no backend e não tinham NENHUMA tela — só
    // dava para ligar com UPDATE à mão no banco.
    href: "/app/settings/atendimento",
    label: "Distribuição de atendimento",
    description: "Quem recebe cada cliente novo, e o que cada atendente enxerga.",
    icon: UsersThree,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "manager",
  },
  {
    href: "/app/settings/tenant",
    label: "Organização",
    description: "Dados da empresa, retenção de dados e encarregado de LGPD.",
    icon: Buildings,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "admin",
  },
  {
    href: "/app/settings/marca",
    label: "Marca",
    description: "O nome e a cor que sua empresa mostra dentro do sistema.",
    icon: Palette,
    group: "organizacao",
    section: "Sua empresa",
    // `admin` pelo mesmo motivo da linha de cima: o que se edita ali é
    // identidade da empresa, e dá-lo a `manager` o colocaria abaixo de billing e
    // de API tokens na mesma prancheta.
    minRole: "admin",
    // SEM `sidebar`: fica só no hub. Trocar a marca é tarefa de uma vez, e
    // agrupar o menu já o fez crescer — duas telas a mais estouraram a dobra em
    // 900px, medido pelo e2e `navegacao.spec.ts`.
  },
  {
    href: "/app/settings/billing",
    label: "Billing",
    description: "Plano e cobrança.",
    icon: Receipt,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "admin",
  },
  {
    href: "/app/lgpd/requests",
    label: "LGPD",
    description: "Pedidos de exportação e exclusão de dados feitos por clientes.",
    icon: ScalesSimple,
    group: "organizacao",
    section: "Dados e acesso",
    minRole: "admin",
  },
  {
    href: "/app/settings/api-tokens",
    label: "API Tokens",
    description: "Chaves para outro sistema conversar com o seu CRM.",
    icon: Lock,
    group: "organizacao",
    section: "Dados e acesso",
    minRole: "admin",
  },

  // ---- Canais e integrações — por onde as mensagens entram e saem ----
  // O grupo CANAIS da §19 antiga não existe: a §19 dissolveu Canais e estas
  // telas viram a última seção do hub de Configurações (fisicamente no fim do
  // array de propósito — a ordem das seções do hub é a de primeira aparição).
  {
    href: "/app/connections",
    label: "Conexões",
    // Cobre os DOIS caminhos desde o PR #105: número por QR e canal oficial da
    // Meta (com os templates dele), cada um numa aba. A descrição cita "oficial"
    // e "Meta" de propósito — é por esses nomes que se procura no ⌘K, e a busca
    // varre a descrição além do rótulo.
    //
    // §19: fora do sidebar (dobra medida). O healthDot continua declarado, mas
    // só renderiza no item de sidebar — no hub não há dot hoje; mantê-lo custa
    // uma linha e preserva o sinal quando voltar.
    description:
      "Seus números de WhatsApp: por QR ou canal oficial da Meta, com saúde, reconexão e templates.",
    icon: PlugsConnected,
    group: "organizacao",
    section: "Canais e integrações",
    minRole: "admin",
    healthDot: true,
  },
  {
    // Não tinha link nenhum no app inteiro: só se chegava digitando a URL.
    // §19: fora do sidebar (dobra medida); porta = hub de Configurações e ⌘K.
    href: "/app/integrations/nuvemshop",
    label: "Nuvemshop",
    description: "Conecte a loja para trazer pedidos e clientes para dentro do CRM.",
    icon: Storefront,
    group: "organizacao",
    section: "Canais e integrações",
    // A página não filtra por papel, mas as Server Actions de conectar e
    // desconectar exigem admin — mostrar a um viewer seria oferecer botão morto.
    minRole: "admin",
  },
  {
    // §19: fora do sidebar (dobra medida); porta = hub de Configurações e ⌘K.
    href: "/app/webhooks",
    label: "Webhooks",
    description: "Avise outros sistemas quando algo acontecer aqui dentro.",
    icon: WebhooksLogo,
    group: "organizacao",
    section: "Canais e integrações",
    minRole: "manager",
  },
];

/**
 * Único ponto de decisão de permissão da navegação.
 *
 * É o que dispensa os sete `usePermission()` que o Sidebar chamava em sequência
 * — hooks não rodam em laço condicional, então cada permissão exigia sua linha.
 * Como função pura, um `.filter()` resolve todas.
 */
export function canSee(d: NavDestination, isPlatformAdmin: boolean, role: Role | null): boolean {
  if (isPlatformAdmin) return true;
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[d.minRole ?? "viewer"];
}

/**
 * Projeção do sidebar: só o uso diário, agrupado, sem grupo vazio.
 *
 * §19: INTELIGÊNCIA é hub-only — nenhum item rola, só o link "Ver tudo em IA".
 * Um grupo com hub sobrevive com ZERO itens de sidebar (senão o portal some);
 * sem hub ele precisa de pelo menos um item visível (cabeçalho órfão é
 * reprovado por `sidebar-grupos.test.tsx`). E o grupo inteiro some quando o
 * papel não alcança NENHUM destino dele — a mesma cerca de sempre.
 */
export function sidebarGroups(
  isPlatformAdmin: boolean,
  role: Role | null,
): Array<{ group: NavGroup; items: NavDestination[] }> {
  return NAV_GROUPS.map((group) => {
    const items = NAV_DESTINATIONS.filter(
      (d) => d.group === group.id && d.sidebar && canSee(d, isPlatformAdmin, role),
    );
    const algumaPorta = NAV_DESTINATIONS.some(
      (d) => d.group === group.id && canSee(d, isPlatformAdmin, role),
    );
    const visivel = items.length > 0 || (group.hub !== undefined && algumaPorta);
    return { group, items, visivel };
  }).filter((g) => g.visivel);
}

/**
 * Projeção do hub: TODAS as telas do grupo — inclusive as que já estão no
 * sidebar. O hub é inventário, não sobra; é onde se descobre o que existe.
 *
 * A ordem das seções é a de primeira aparição no registro, então reordenar a
 * jornada é reordenar o array — não há uma segunda lista para manter em sincronia.
 */
export function hubSections(
  group: NavGroupId,
  isPlatformAdmin: boolean,
  role: Role | null,
): Array<{ section: string; items: NavDestination[] }> {
  const porSecao = new Map<string, NavDestination[]>();
  for (const d of NAV_DESTINATIONS) {
    if (d.group !== group || !canSee(d, isPlatformAdmin, role)) continue;
    const secao = d.section ?? "";
    const atual = porSecao.get(secao);
    if (atual) atual.push(d);
    else porSecao.set(secao, [d]);
  }
  return [...porSecao.entries()].map(([section, items]) => ({ section, items }));
}

/** Projeção do ⌘K: todo destino visível, do sidebar ou não. */
export function searchable(isPlatformAdmin: boolean, role: Role | null): NavDestination[] {
  return NAV_DESTINATIONS.filter((d) => canSee(d, isPlatformAdmin, role));
}
