import { describe, expect, it } from "vitest";

import {
  GRUPO_NO_RODAPE,
  NAV_DESTINATIONS,
  NAV_GROUPS,
  canSee,
  hubSections,
  searchable,
  sidebarGroups,
} from "@/lib/navigation/registry";

/**
 * O registro é a fonte única da navegação. Estes testes cobrem as projeções
 * puras — quem renderiza (sidebar, hub, ⌘K) não decide nada, só desenha o que
 * sai daqui. A completude do registro contra as rotas de verdade é assunto de
 * `navegacao-completude.test.ts`.
 */

const ADMIN = { platform: false, role: "admin" as const };
const MANAGER = { platform: false, role: "manager" as const };
const AGENT = { platform: false, role: "agent" as const };
const VIEWER = { platform: false, role: "viewer" as const };

function dest(href: string) {
  const d = NAV_DESTINATIONS.find((x) => x.href === href);
  if (!d) throw new Error(`destino ausente do registro: ${href}`);
  return d;
}

describe("integridade do registro", () => {
  it("não tem href duplicado", () => {
    const vistos = new Map<string, number>();
    for (const d of NAV_DESTINATIONS) vistos.set(d.href, (vistos.get(d.href) ?? 0) + 1);
    const duplicados = [...vistos.entries()].filter(([, n]) => n > 1).map(([href]) => href);
    expect(duplicados).toEqual([]);
  });

  it("todo destino aponta para um grupo declarado", () => {
    const ids = new Set(NAV_GROUPS.map((g) => g.id));
    const orfaos = NAV_DESTINATIONS.filter((d) => !ids.has(d.group)).map((d) => d.href);
    expect(orfaos).toEqual([]);
  });

  it("todo destino tem descrição — é o que o hub e o ⌘K mostram", () => {
    const semTexto = NAV_DESTINATIONS.filter((d) => d.description.trim() === "").map((d) => d.href);
    expect(semTexto).toEqual([]);
  });

  it("todo destino de um grupo com hub declara sua seção", () => {
    const comHub = new Set(NAV_GROUPS.filter((g) => g.hub).map((g) => g.id));
    const semSecao = NAV_DESTINATIONS.filter((d) => comHub.has(d.group) && !d.section).map(
      (d) => d.href,
    );
    expect(semSecao).toEqual([]);
  });
});

describe("canSee", () => {
  it("nega quem está abaixo do minRole", () => {
    expect(canSee(dest("/app/audit"), MANAGER.platform, MANAGER.role)).toBe(true);
    expect(canSee(dest("/app/audit"), AGENT.platform, AGENT.role)).toBe(false);
  });

  it("destino sem minRole é visível até para viewer", () => {
    expect(canSee(dest("/app/inbox"), VIEWER.platform, VIEWER.role)).toBe(true);
  });

  it("platform admin vê tudo, inclusive sem org ativa", () => {
    for (const d of NAV_DESTINATIONS) expect(canSee(d, true, null)).toBe(true);
  });

  it("sem papel e sem ser platform admin não vê nada", () => {
    expect(canSee(dest("/app/inbox"), false, null)).toBe(false);
  });
});

describe("sidebarGroups", () => {
  it("devolve os grupos na ordem declarada em NAV_GROUPS", () => {
    const ordem = sidebarGroups(true, null).map((g) => g.group.id);
    const esperada = NAV_GROUPS.map((g) => g.id).filter((id) => ordem.includes(id));
    expect(ordem).toEqual(esperada);
  });

  it("só inclui destino marcado como sidebar", () => {
    const hrefs = sidebarGroups(true, null).flatMap((g) => g.items.map((i) => i.href));
    // Conhecimento e Agentes existem no registro, mas são do hub — §19 os
    // tirou do sidebar; Estoque é uma das portas novas da lista.
    expect(hrefs).not.toContain("/app/ai/knowledge/sources");
    expect(hrefs).not.toContain("/app/ai/agents");
    expect(hrefs).toContain("/app/estoque");
  });

  it("mantém Funis no sidebar e devolve as Etapas ao hub — §19 + dobra medida", () => {
    const vendas = sidebarGroups(true, null).find((g) => g.group.id === "vendas");
    expect(vendas?.items.map((i) => i.href)).toContain("/app/kanban");
    // O uso (abrir o funil) não passa por Configurações; a CONFIGURAÇÃO das
    // colunas voltou para o hub porque a medição da dobra não a comportava
    // (18 links + 8 títulos = 744px de 763px).
    const hrefs = sidebarGroups(true, null).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/app/settings/tenant/pipelines");
  });

  it("§19: o menu rolável tem 18 links e 8 títulos — o orçamento da dobra", () => {
    // "A dobra é medida, não estimada." Este é o guarda de orçamento que derruba a
    // contagem ANTES do e2e (1280×900, modelo 4 + 30·L + 25·H ≤ 763px). Link
    // novo entra só se outro sair — ou se a medição real do e2e mudar.
    const grupos = sidebarGroups(true, null).filter((g) => g.group.id !== GRUPO_NO_RODAPE);
    const links = grupos.reduce((n, g) => n + g.items.length + (g.group.hub ? 1 : 0), 0);
    expect(links, "18 portas roláveis: 17 destinos + o hub de Inteligência").toBe(18);
    expect(grupos.map((g) => g.group.id), "8 títulos — Configurações é rodapé").toEqual([
      "visao",
      "vendas",
      "atendimento",
      "ia",
      "operacao",
      "financeiro",
      "fiscal",
      "equipe",
    ]);
  });

  it("omite o grupo inteiro quando o papel não vê nenhum destino dele", () => {
    // Sem papel não há menu — nem o hub-only de Inteligência sobrevive: o
    // grupo de hub aparece só se o papel alcança AO MENOS um destino dele
    // (senão vira cabeçalho órfão com link morto).
    expect(sidebarGroups(false, null).map((g) => g.group.id)).toEqual([]);
    expect(sidebarGroups(AGENT.platform, AGENT.role).map((g) => g.group.id)).toContain(
      "atendimento",
    );
  });

  it("o grupo de Inteligência é 100% hub: nenhum item rola, só a porta de entrada", () => {
    // §19: Agentes, Roteadores e Follow-ups saíram do sidebar (dobra medida;
    // o Follow-ups foi para ATENDIMENTO, na lista da §19). O grupo permanece
    // com zero itens porque tem hub — "Ver tudo em IA" é o link que impede o
    // título de ficar órfão.
    const ia = sidebarGroups(true, null).find((g) => g.group.id === "ia");
    expect(ia, "o portal de Inteligência não pode sumir do menu").toBeDefined();
    expect(ia?.items).toEqual([]);
    expect(ia?.group.hub?.href).toBe("/app/ai");
  });
});

describe("hubSections", () => {
  it("agrupa a IA nas três etapas da jornada, na ordem", () => {
    const secoes = hubSections("ia", true, null).map((s) => s.section);
    expect(secoes).toEqual(["Montar o agente", "Ensinar o agente", "Acompanhar o agente"]);
  });

  it("o hub mostra também o que já está no sidebar — é inventário, não sobra", () => {
    const hrefs = hubSections("ia", true, null).flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain("/app/ai/agents");
    expect(hrefs).toContain("/app/ai/knowledge/sources");
    // O grupo Análise da §19 antiga foi dissolvido: Evolução e o grafo
    // de Inteligência entraram na jornada "Acompanhar o agente".
    expect(hrefs).toContain("/app/ai/evolution");
    expect(hrefs).toContain("/app/inteligencia");
  });

  it("as telas de canais viraram a última seção do hub de Configurações", () => {
    // §19 dissolveu o grupo CANAIS; a porta continua sendo o hub (e o ⌘K),
    // agora com seção própria — e ainda no fim da leitura, porque a ordem das
    // seções é a de primeira aparição no registro.
    const secoes = hubSections("organizacao", true, null).map((s) => s.section);
    expect(secoes).toContain("Canais e integrações");
    expect(secoes[secoes.length - 1]).toBe("Canais e integrações");
    const hrefs = hubSections("organizacao", true, null).flatMap((s) =>
      s.items.map((i) => i.href),
    );
    expect(hrefs).toContain("/app/connections");
    expect(hrefs).toContain("/app/settings/tenant/pipelines");
  });

  it("não vaza destino acima do papel", () => {
    const hrefs = hubSections("organizacao", VIEWER.platform, VIEWER.role).flatMap((s) =>
      s.items.map((i) => i.href),
    );
    expect(hrefs).not.toContain("/app/settings/api-tokens");
    expect(hrefs).toContain("/app/settings/profile");
  });

  it("some com a seção que ficou vazia pela permissão", () => {
    const secoes = hubSections("organizacao", VIEWER.platform, VIEWER.role).map((s) => s.section);
    expect(secoes).not.toContain("Dados e acesso");
  });
});

describe("searchable", () => {
  it("expõe todo destino visível, do sidebar ou não", () => {
    const hrefs = searchable(ADMIN.platform, ADMIN.role).map((d) => d.href);
    expect(hrefs).toContain("/app/ai/knowledge/sources");
    expect(hrefs).toContain("/app/inbox");
  });

  it("respeita o papel", () => {
    const hrefs = searchable(AGENT.platform, AGENT.role).map((d) => d.href);
    expect(hrefs).not.toContain("/app/audit");
  });
});
