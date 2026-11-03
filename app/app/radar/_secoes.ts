/**
 * AS SEIS TELAS DO RADAR — uma por pergunta, cada uma com endereço próprio.
 *
 * O Radar era uma landing com sete seções empilhadas e cinco botões que
 * rolavam até elas. Quem entrava para ver "quem está esfriando" atravessava
 * KPIs, gráficos, categorias, saúde da carteira, oportunidades, recompra,
 * recuperação e demandas antes de chegar — e o botão de seção não dizia onde a
 * pessoa estava (não havia onde estar: tudo era a mesma página).
 *
 * A régua aqui é a mesma da ficha da carga (`/app/expedicao/<id>`): cada
 * tarefa tem endereço, o cabeçalho e a navegação acompanham, e o F5 cai na
 * mesma tela. A ordem é a da pergunta que a pessoa faz quando abre o Radar.
 *
 * Este arquivo é DADO, não tela: a navegação (`_shell.tsx`) e as páginas leem
 * daqui, e `tests/unit/radar-subtelas.test.ts` confere que todo href tem
 * `page.tsx` no disco — botão que aponta para 404 não passa no CI.
 */
export type SecaoRadar =
  | "visao"
  | "categorias"
  | "oportunidades"
  | "risco"
  | "recuperacao"
  | "prospeccao";

export interface SecaoDoRadar {
  id: SecaoRadar;
  href: string;
  /** Rótulo da navegação — curto, porque divide a linha com outros cinco. */
  rotulo: string;
  /** A pergunta que a tela responde. Vira o subtítulo do cabeçalho. */
  subtitulo: string;
}

export const SECOES = [
  {
    id: "visao",
    href: "/app/radar",
    rotulo: "Visão geral",
    subtitulo: "Como está a carteira e o que fazer hoje.",
  },
  {
    id: "categorias",
    href: "/app/radar/categorias",
    rotulo: "Categorias",
    subtitulo: "Quem contatar, separado por motivo, com a próxima ação.",
  },
  {
    id: "oportunidades",
    href: "/app/radar/oportunidades",
    rotulo: "Oportunidades",
    subtitulo: "Quem já comprou e está no ponto de comprar de novo.",
  },
  {
    id: "risco",
    href: "/app/radar/risco",
    rotulo: "Risco de demandas",
    subtitulo: "Demandas abertas que esfriaram sem resposta.",
  },
  {
    id: "recuperacao",
    href: "/app/radar/recuperacao",
    rotulo: "Recuperação",
    subtitulo: "Quem comprava e parou, por ordem de prioridade.",
  },
  {
    id: "prospeccao",
    href: "/app/radar/prospeccao",
    rotulo: "Prospecção",
    subtitulo: "Quem podemos vender hoje, antes do primeiro pedido.",
  },
] as const satisfies readonly SecaoDoRadar[];

/**
 * Qual seção o endereço atual é.
 *
 * Match exato, com barra final tolerada: `/app/radar/risco/` é a mesma tela, e
 * `startsWith` faria `/app/radar/risco-de-algo` (se um dia existir) acender a
 * aba errada.
 */
export function secaoDaRota(pathname: string | null): SecaoDoRadar | null {
  if (!pathname) return null;
  const limpo = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return SECOES.find((s) => s.href === limpo) ?? null;
}

/**
 * Os hashes da landing antiga, e para onde eles vão agora.
 *
 * Eles estão em links que já saíram daqui: o alerta do Dashboard, o briefing de
 * indicadores e o ⌘K. Chegar em `/app/radar#radar-recuperacao` e cair na visão
 * geral seria a tela ignorar o pedido — o `replace` (não `push`) evita deixar
 * um hash morto no histórico.
 */
export const HASH_ANTIGO: Readonly<Record<string, string>> = {
  "radar-visao": "/app/radar",
  "radar-oportunidades": "/app/radar/oportunidades",
  "radar-lista": "/app/radar/oportunidades",
  "radar-demandas": "/app/radar/risco",
  "radar-recuperacao": "/app/radar/recuperacao",
  "radar-prospeccao": "/app/radar/prospeccao",
};
