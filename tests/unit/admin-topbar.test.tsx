/**
 * TopBar do admin (§17). O que este teste protege: o shell de plataforma
 * nasceu com as MESMAS portas do tenant — busca (⌘K) no meio, sino da central
 * e menu do usuário à direita —, e o hambúrguer continuou existindo abaixo de
 * `lg`. Antes o admin desktop não tinha nenhuma das três: dava pra buscar só
 * no sidebar e pra sair só voltando pro `/app`.
 *
 * As peças são as reais; o que se mocka aqui é a dependência DELAS
 * (sessão/requisição), não elas — se alguém trocar a TopBar por um `div`, o
 * teste reprova.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { AdminShell } from "@/components/admin/AdminShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/tenants",
}));

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useUser: () => ({
    email: "dono@exemplo.com",
    full_name: "Dono",
    avatar_url: null,
    is_platform_admin: true,
  }),
  useAuth: () => ({
    user: { email: "dono@exemplo.com", is_platform_admin: true },
    activeOrg: { orgId: "org-1", name: "Org", role: "admin" },
    signOut: vi.fn(),
  }),
  usePermission: () => true,
  useActiveOrg: () => ({ orgId: "org-1", name: "Org", role: "admin" }),
}));

vi.mock("@/hooks/ai/useAgentInbox", () => ({
  useAgentInbox: () => ({ data: { items: [], open_count: 2 }, isLoading: false }),
}));

afterEach(cleanup);

describe("TopBar do admin", () => {
  it("carrega busca, sino e menu do usuário junto do título", () => {
    render(<AdminShell userEmail="dono@exemplo.com">{null}</AdminShell>);

    // Escopo no `<header>` da barra: "Admin Plataforma" também é o título do
    // sidebar — pegar o texto solto pegaria os dois.
    const barra = screen.getByRole("banner");
    expect(within(barra).getByText("Admin Plataforma")).toBeInTheDocument();
    expect(within(barra).getByRole("button", { name: /buscar/i })).toBeInTheDocument();
    expect(within(barra).getByTestId("alerts-bell")).toBeInTheDocument();
    expect(within(barra).getByTestId("alerts-bell-count")).toHaveTextContent("2");
    expect(within(barra).getByRole("button", { name: /menu do usu[aá]rio/i })).toBeInTheDocument();
  });

  it("hambúrguer do mobile segue no ar (sidebar fixa não existe abaixo de lg)", () => {
    render(<AdminShell userEmail="dono@exemplo.com">{null}</AdminShell>);
    expect(
      screen.getByRole("button", { name: /abrir menu de navegação/i }),
    ).toBeInTheDocument();
  });
});
