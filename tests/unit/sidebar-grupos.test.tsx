/**
 * Sidebar agrupado por objetivo (NEXUS §19). O que estes testes protegem:
 *
 *  - a hierarquia existe (o usuário reclamou de 17 itens no mesmo peso visual);
 *  - a taxonomia é a da §19: oito títulos, na ordem declarada, com o orçamento
 *    da dobra (18 links roláveis) — o uso diário (Funis) segue sem passar por
 *    Configurações; a configuração de colunas voltou para o hub por medição;
 *  - agrupar não criou cabeçalho órfão (grupo sem porta some; grupo de hub
 *    sobrevive sem item, com o link do hub);
 *  - colapsado não renderiza título nenhum: 6 rótulos em 64px seria ilegível.
 *
 * A regra de quem-vê-o-quê é do registro e está coberta em
 * `navegacao-registry.test.ts`; aqui é a superfície.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Sidebar } from "@/components/shell/Sidebar";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

const authRef: { user: Pick<AuthUser, "is_platform_admin">; activeOrg: ActiveOrg | null } = {
  user: { is_platform_admin: false },
  activeOrg: null,
};

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => authRef,
  usePermission: () => false,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inbox",
}));
vi.mock("@/components/connections/ConnectionHealthDot", () => ({
  ConnectionHealthDot: () => null,
}));
vi.mock("@/app/actions/shell/toggleSidebar", () => ({
  toggleSidebar: vi.fn(),
}));
// Busca a versão via react-query; sem QueryClientProvider ele lança, e o
// rodapé de versão não é o que estes testes examinam.
vi.mock("@/components/shell/VersionFooter", () => ({
  VersionFooter: () => null,
}));
// O rodapé de fila também busca do servidor via react-query; os títulos dos
// grupos é o que estes testes examinam.
vi.mock("@/components/shell/SidebarNotice", () => ({
  SidebarNotice: () => null,
}));

function comoPapel(role: ActiveOrg["role"]) {
  authRef.user = { is_platform_admin: false };
  authRef.activeOrg = { orgId: "org-1", name: "Org", role };
}

afterEach(cleanup);

describe("Sidebar agrupado", () => {
  it("renderiza os títulos de grupo na ordem de uso", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    const titulos = screen
      .getAllByRole("heading")
      .map((el) => el.textContent?.trim())
      .filter(Boolean);
    // Configurações não tem título aqui: seu hub vive no rodapé fixo, fora da
    // área que rola — medido, ele caía fora da dobra até em 1080px. Os oito
    // títulos abaixo são o orçamento da §19 (18 links + 8 títulos = 744px de
    // 763px em 1280×900; a contagem também é guardada em
    // `navegacao-registry.test.ts`).
    expect(titulos).toEqual([
      "Visão geral",
      "Vendas",
      "Atendimento",
      "Inteligência",
      "Operação",
      "Financeiro",
      "Fiscal",
      "Equipe",
    ]);
  });

  it("Etapas do funil fica atrás do hub de Configurações — §19, dobra medida", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    // Era item de CRM ("sem passar por Configurações") e a §19 não a lista.
    // A medição (18 links/8 títulos) não a comportava; a porta agora é o
    // rodapé fixo → hub → card. O uso — FUNIS — continua aqui embaixo.
    expect(screen.queryByRole("link", { name: "Etapas do funil" })).toBeNull();
  });

  it("e os dois itens de funil não disputam o mesmo nome", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    // Só "Funis" está no menu agora; "Etapas do funil" mora no hub. O nome
    // disputado acabou por construção — o assert fica como registro disso.
    expect(screen.getByRole("link", { name: "Funis" })).toHaveAttribute("href", "/app/kanban");
    expect(screen.queryByRole("link", { name: "Etapas do funil" })).toBeNull();
  });

  it("as portas novas da §19 estão no menu, e as recolhidas saíram", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    // Entra: Estoque/Compras (OPERACAO) e Meu Dia (VISÃO GERAL), que a §19
    // lista. Sai: Nuvemshop e Audit Log, recolhidos pela dobra medida — as
    // portas deles são o hub de Configurações (Nuvemshop, na seção de
    // canais) e o ⌘K (Audit).
    expect(screen.getByRole("link", { name: /Estoque/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Compras/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Meu Dia/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Nuvemshop/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Audit Log/ })).toBeNull();
  });

  it("Configurações fica no rodapé, nunca dependendo de scroll", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    const config = screen.getByRole("link", { name: /Configurações/ });
    expect(config).toHaveAttribute("href", "/app/settings");
    // Fora da <nav> que rola.
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(nav.contains(config)).toBe(false);
  });

  it("não deixa cabeçalho órfão quando a permissão esvazia o grupo", () => {
    // Para um agent, INTELIGÊNCIA não tem nenhum item rolável (§19: 100% hub) —
    // o título só pode existir junto da porta, o link "Ver tudo em IA". Grupo
    // sem porta some; grupo com porta sobrevive sem item. "Canais" nem existe
    // mais (dissolvido pela §19) — o assert fica como guarda do nome velho.
    comoPapel("agent");
    render(<Sidebar collapsed={false} />);
    const titulos = screen.getAllByRole("heading").map((el) => el.textContent?.trim());
    expect(titulos).not.toContain("Canais");
    expect(titulos).toContain("Atendimento");
    expect(titulos).toContain("Inteligência");
    expect(screen.getByRole("link", { name: /Ver tudo em IA/ })).toHaveAttribute("href", "/app/ai");
  });

  it("oferece o hub dos grupos que têm um", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    expect(screen.getByRole("link", { name: /Ver tudo em IA/ })).toHaveAttribute("href", "/app/ai");
  });

  it("colapsado esconde os títulos mas mantém os links", () => {
    comoPapel("admin");
    render(<Sidebar collapsed />);
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
    expect(screen.getByRole("link", { name: /Inbox/ })).toBeTruthy();
  });

  it("marca a rota atual com aria-current", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    expect(screen.getByRole("link", { name: /Inbox/ })).toHaveAttribute("aria-current", "page");
    // "Kanban" saiu da interface; o item da mesma URL agora se chama "Funis".
    expect(screen.getByRole("link", { name: "Funis" })).not.toHaveAttribute("aria-current");
  });
});
