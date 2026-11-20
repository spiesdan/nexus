/**
 * O SELETOR DE EMPRESA DIZ ONDE A PESSOA ESTÁ, NÃO SÓ O QUE O BOTÃO FAZ.
 *
 * ─── O DEFEITO (medido em 18/11/2026, lendo o componente) ─────────────────
 *
 * O gatilho tinha `aria-label="Trocar de empresa"`. Como `aria-label`
 * SUBSTITUI o conteúdo do botão para a árvore de acessibilidade, quem usa
 * leitor de tela ouvia só a AÇÃO — nunca o ESTADO. E o nome da empresa ativa
 * era texto visual que some abaixo de `sm` (fica só a inicial), então nem o
 * contexto visual socorria.
 *
 * O usuário de duas organizações é exatamente quem precisa saber "onde estou"
 * antes de trocar: o rótulo passa a compor estado + ação. A PROPRIEDADE que
 * importa (e o que este teste guarda) não é a string exata: é o nome acessível
 * COMEÇAR pelo texto visível, conter a ação e NÃO repetir a inicial.
 *
 * A ordem virou defeito medido: `label-content-name-mismatch` (axe, serious)
 * acusava o mesmo nó em 82 rotas — `accessibleName.indexOf(visibleText) === 0`
 * falhava porque "Empresa atual: X..." punha a ação antes do rótulo. A inicial
 * `aria-hidden` também entra no `textContent` visível, então passou a ser
 * conteúdo gerado por CSS, fora do nome.
 *
 * A segunda asserção é o item ativo. `aria-current` em `menuitem` tem suporte
 * irregular entre leitores de tela, e o check é `aria-hidden` — então "qual
 * está ativa" não chegava de jeito nenhum. O texto recortado (", atual") é o
 * que garante o anúncio, e é a mesma informação que o ícone carrega.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const organizacoes = [
  { organization_id: "org-a", organization_name: "Alfa Distribuidora" },
  { organization_id: "org-b", organization_name: "Beta Comércio" },
];

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useUser: () => ({ organizations: organizacoes }),
  useActiveOrg: () => ({ orgId: "org-a", name: "Alfa Distribuidora" }),
}));

vi.mock("@/hooks/i18n/useT", () => ({
  useT: () => (texto: string) => texto,
}));

vi.mock("@/app/actions/shell/setActiveOrg", () => ({
  setActiveOrg: vi.fn(async () => undefined),
}));

import { TenantSwitcher } from "@/components/shell/TenantSwitcher";

afterEach(cleanup);

describe("TenantSwitcher", () => {
  it("o nome acessível do gatilho carrega a empresa ativa", () => {
    render(<TenantSwitcher />);

    // Pela PROPRIEDADE, não pela frase: começar pelo rótulo visível é o que o
    // axe exige e o que evita a regressão em massa no shell.
    const gatilho = screen.getByRole("button", { name: /^Alfa Distribuidora/ });
    const nome = gatilho.getAttribute("aria-label") ?? "";
    expect(nome).toMatch(/^Alfa Distribuidora/);
    expect(nome).toContain("Trocar de empresa");
    // A inicial `aria-hidden` não entra no nome: "EE2E Test Org" era o outro
    // lado do mesmo defeito (texto visível fora do nome acessível).
    expect(nome).not.toContain("EE2E");
    expect(nome).not.toMatch(/^E\s?E2E/);
    // O texto visível continua o mesmo — o rótulo acessível não mudou a tela.
    expect(screen.getByText("Alfa Distribuidora")).toBeInTheDocument();
  });

  it("o item da empresa ativa é anunciado como atual", async () => {
    const user = userEvent.setup();
    render(<TenantSwitcher />);

    await user.click(screen.getByRole("button", { name: /Trocar de empresa/ }));

    const menu = await screen.findByRole("menu");
    expect(menu).toBeInTheDocument();

    const ativa = screen.getByRole("menuitem", { name: /Alfa Distribuidora/ });
    // O texto recortado é o que o leitor de tela lê; o check é decoração.
    expect(ativa.textContent).toContain("atual");
    expect(ativa).toHaveAttribute("aria-current", "true");

    const outra = screen.getByRole("menuitem", { name: /Beta Comércio/ });
    expect(outra.textContent).not.toContain("atual");
    expect(outra).not.toHaveAttribute("aria-current");
  });
});
