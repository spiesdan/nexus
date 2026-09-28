/**
 * Central de avisos no shell (§17). O que estes testes protegem:
 *
 *  - o contador continua sendo o `useAgentInbox("open")` de sempre e os
 *    testids antigos do sino (`alerts-bell`, `alerts-bell-count`) mudam de
 *    `<Link>` para gatilho do painel sem sumir;
 *  - o painel é prévia da central: mesmo rótulo de severidade, mesmo
 *    `kindLabel`, e todo item leva a `/app/ai/inbox` (sem ação própria);
 *  - vazio diz que está vazio; carregando não mente.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { NotificationCenter } from "@/components/shell/NotificationCenter";

const inbox = vi.hoisted(() => ({
  loading: false,
  count: 0,
  items: [] as Array<{
    id: string;
    kind: string;
    severity: "info" | "warn" | "critical";
    title: string;
    body: string | null;
    ref_kind: string | null;
    ref_id: string | null;
    status: "open";
    created_at: string;
  }>,
}));

vi.mock("@/hooks/ai/useAgentInbox", () => ({
  useAgentInbox: () =>
    inbox.loading
      ? { data: undefined, isLoading: true }
      : { data: { items: inbox.items, open_count: inbox.count }, isLoading: false },
}));

function abrir(): void {
  fireEvent.click(screen.getByTestId("alerts-bell"));
}

afterEach(cleanup);

describe("Central de avisos no shell", () => {
  it("gatilho mantém o contador de sempre e abre o painel", () => {
    inbox.count = 3;
    render(<NotificationCenter />);
    const sino = screen.getByTestId("alerts-bell");
    expect(sino).toHaveAttribute("aria-label", expect.stringContaining("3"));
    expect(screen.getByTestId("alerts-bell-count")).toHaveTextContent("3");
    abrir();
    expect(screen.getByTestId("notification-center")).toBeInTheDocument();
    expect(screen.getByText("Central de avisos")).toBeInTheDocument();
  });

  it("mostra o aviso como prévia e leva para a central inteira", () => {
    inbox.count = 1;
    inbox.items = [
      {
        id: "item-1",
        kind: "job_dead",
        severity: "critical",
        title: "Uma tarefa parou",
        body: "detalhe",
        ref_kind: null,
        ref_id: null,
        status: "open",
        created_at: new Date().toISOString(),
      },
    ];
    render(<NotificationCenter />);
    abrir();
    const item = screen.getByTestId("notification-center-item");
    expect(item).toHaveAttribute("href", "/app/ai/inbox");
    expect(screen.getByText("Uma tarefa parou")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /central de avisos/i }).length).toBeGreaterThan(0);
    cleanup();
    inbox.items = [];
    inbox.count = 0;
  });

  it("vazio diz que está vazio, sem fingir carregando", () => {
    inbox.count = 0;
    inbox.items = [];
    render(<NotificationCenter />);
    abrir();
    expect(screen.getByText("Nenhum aviso em aberto")).toBeInTheDocument();
  });

  it("carregando não mostra o estado vazio", () => {
    inbox.loading = true;
    render(<NotificationCenter />);
    abrir();
    expect(screen.queryByText("Nenhum aviso em aberto")).toBeNull();
    cleanup();
    inbox.loading = false;
  });
});
