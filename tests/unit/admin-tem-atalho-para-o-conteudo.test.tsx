/**
 * A CASCA DO ADMIN TAMBÉM TEM ATALHO PARA O CONTEÚDO.
 *
 * ─── O QUE FOI MEDIDO (18/11/2026) ────────────────────────────────────────
 *
 * Com o instrumento de foco (`scripts/auditoria/foco-e-aria.mjs`), no `/admin`
 * o primeiro Tab caía em **"Sair pra app pessoal"**, no cabeçalho da sidebar —
 * não no atalho. O `/app` tem "Pular para o conteúdo" desde sempre; a casca do
 * admin é outra e o atalho não veio junto. Quem navega por teclado atravessa a
 * navegação inteira em toda tela do painel da plataforma.
 *
 * O teste prova o que o instrumento mediu: primeiro Tab = atalho, e o atalho
 * aponta para o `<main id="conteudo">`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/tenants",
}));

// Peças do shell com dependências de contexto que não são o assunto.
vi.mock("@/components/shell/SearchTrigger", () => ({ SearchTrigger: () => null }));
vi.mock("@/components/shell/NotificationCenter", () => ({ NotificationCenter: () => null }));
vi.mock("@/components/shell/UserMenu", () => ({ UserMenu: () => null }));

import { AdminShell } from "@/components/admin/AdminShell";

afterEach(cleanup);

describe("casca do admin", () => {
  it("o primeiro Tab cai no atalho, e ele fica visível", async () => {
    const user = userEvent.setup();
    render(
      <AdminShell userEmail="dono@exemplo.com">
        <h1>Tenants</h1>
      </AdminShell>,
    );

    await user.tab();

    const atalho = screen.getByRole("link", { name: "Pular para o conteúdo" });
    expect(document.activeElement).toBe(atalho);

    // O MECANISMO, não a geometria: o jsdom não calcula layout nem aplica
    // Tailwind, então `getBoundingClientRect` devolve zero para tudo. O que se
    // prova é o par de classes que faz o atalho existir só no foco — o mesmo
    // par que o `AppShell` usa (`focus:not-sr-only`).
    expect(atalho.className).toContain("sr-only");
    expect(atalho.className).toContain("focus:not-sr-only");
  });

  it("o atalho aponta para o conteúdo", () => {
    render(
      <AdminShell userEmail="dono@exemplo.com">
        <h1>Tenants</h1>
      </AdminShell>,
    );

    expect(screen.getByRole("link", { name: "Pular para o conteúdo" })).toHaveAttribute(
      "href",
      "#conteudo",
    );
    expect(document.getElementById("conteudo")).not.toBeNull();
  });
});
