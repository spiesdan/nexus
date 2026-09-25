/**
 * Trilha do shell (§17 do spec de redesign). O que estes testes protegem:
 *
 *  - a fonte é o registro: hub vira crumb com o rótulo do GRUPO, destino com
 *    o rótulo dele, e nada é escrito à mão no componente;
 *  - id no meio some e id no fim vira "Detalhe" — trilha ensina onde você
 *    está, não decodifica uuid;
 *  - um nível só não renderiza (na raiz `/app` e nos hubs a trilha seria o
 *    título da página repetido);
 *  - `canSee` vale aqui como vale no sidebar: papel sem permissão não lê o
 *    rótulo do destino.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Breadcrumb } from "@/components/shell/Breadcrumb";

const rota = vi.hoisted(() => ({ atual: "/app" }));
const auth = vi.hoisted(() => ({ admin: false, role: "admin" as string | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => rota.atual,
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { is_platform_admin: auth.admin },
    activeOrg: auth.role ? { orgId: "org-1", name: "Org", role: auth.role } : null,
  }),
}));

function irPara(pathname: string): void {
  rota.atual = pathname;
}

function como(admin: boolean, role: string | null): void {
  auth.admin = admin;
  auth.role = role;
}

afterEach(cleanup);

describe("Trilha do shell", () => {
  it("não renderiza na raiz do app nem num nível só", () => {
    como(false, "admin");
    irPara("/app");
    const raiz = render(<Breadcrumb />);
    expect(raiz.container.innerHTML).toBe("");
    cleanup();
    irPara("/app/ai");
    const hub = render(<Breadcrumb />);
    expect(hub.container.innerHTML).toBe("");
  });

  it("vira trilha no detalhe: destino clicável + Detalhe como página atual", () => {
    como(false, "admin");
    irPara("/app/pedidos/123");
    render(<Breadcrumb />);
    const nav = screen.getByRole("navigation", { name: "Trilha de navegação" });
    expect(nav).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Pedidos" });
    expect(link).toHaveAttribute("href", "/app/pedidos");
    const atual = screen.getByText("Detalhe");
    expect(atual).toHaveAttribute("aria-current", "page");
    expect(atual).not.toHaveAttribute("href");
  });

  it("engole id no meio sem perder o nível seguinte", () => {
    como(false, "admin");
    irPara("/app/pedidos/12345678-1234-1234-1234-123456789abc/itens");
    render(<Breadcrumb />);
    screen.getByRole("link", { name: "Pedidos" });
    expect(screen.getByText("Itens")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText(/12345678/)).toBeNull();
  });

  it("cruza um hub pelo rótulo do grupo, não pelo link do hub", () => {
    como(false, "admin");
    irPara("/app/ai/agents");
    render(<Breadcrumb />);
    const hub = screen.getByRole("link", { name: "Inteligência" });
    expect(hub).toHaveAttribute("href", "/app/ai");
    expect(screen.getByText("Agentes")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Ver tudo em IA" })).toBeNull();
  });

  it("desce três níveis em Configurações com o destino do meio clicável", () => {
    como(false, "admin");
    irPara("/app/settings/tenant/agenda");
    render(<Breadcrumb />);
    screen.getByRole("link", { name: "Configurações" });
    const org = screen.getByRole("link", { name: "Organização" });
    expect(org).toHaveAttribute("href", "/app/settings/tenant");
    expect(screen.getByText("Tipos de agendamento")).toHaveAttribute("aria-current", "page");
  });

  it("respeita canSee: sem papel não lê o rótulo do destino", () => {
    // `/app/ai/agents` tem minRole manager (registro). Papel nulo cai no
    // humanizador do registro desconhecido em vez de citar o destino.
    como(false, null);
    irPara("/app/ai/agents");
    render(<Breadcrumb />);
    expect(screen.queryByRole("link", { name: "Agentes" })).toBeNull();
    expect(screen.getByText("Agents")).toHaveAttribute("aria-current", "page");
  });

  it("admin de plataforma vê qualquer destino", () => {
    como(true, null);
    irPara("/app/ai/agents");
    render(<Breadcrumb />);
    // Último crumb é página atual (span): o rótulo é o do registro ("Agentes",
    // com e), não o humanizador ("Agents").
    expect(screen.getByText("Agentes")).toHaveAttribute("aria-current", "page");
  });
});
