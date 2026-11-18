/**
 * A TRILHA NÃO OFERECE CAMINHO QUE NÃO EXISTE.
 *
 * ─── O DEFEITO (medido em 18/11/2026, lendo o componente) ──────────────────
 *
 * `Breadcrumb` monta as migalhas a partir do registro de navegação. Segmento
 * que o registro não conhece (rota da allowlist legada, tela nova ainda não
 * registrada) entra com `label` humanizado e **sem `href`** — e o render fazia:
 *
 *     <Link href={m.href ?? "#"}>…</Link>
 *
 * Ou seja: uma migalha que PARECE link, entra na ordem de Tab, recebe foco e,
 * ao ser ativada, joga a pessoa no topo da página (`#`). Para quem usa teclado
 * é pior que não existir: é um alvo a mais no caminho, sem destino.
 *
 * A correção é de semântica, não de estilo: migalha sem destino é TEXTO.
 *
 * ─── POR QUE UM TESTE DE RENDER, E NÃO UMA VARREDURA DE STRING ─────────────
 *
 * `href="#"` pode ser legítimo em outro componente (um "voltar ao topo", por
 * exemplo). O que este teste fixa é o comportamento da TRILHA: com rotas que o
 * registro não conhece, não sai âncora nenhuma para `#`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/foo/bar/baz",
}));

// Dependências de contexto do shell — o assunto é a trilha, não o provider.
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { is_platform_admin: false }, activeOrg: { role: "admin" } }),
}));

vi.mock("@/hooks/i18n/useT", () => ({
  useT: () => (texto: string) => texto,
}));

import { Breadcrumb } from "@/components/shell/Breadcrumb";

afterEach(cleanup);

describe("Breadcrumb com segmento fora do registro", () => {
  it("não cria âncora para `#` — migalha sem destino é texto", () => {
    const { container } = render(<Breadcrumb />);

    const mortos = [...container.querySelectorAll('a[href="#"]')];
    expect(mortos.map((a) => a.textContent)).toEqual([]);
  });

  it("continua mostrando os três níveis, com o último marcado como página atual", () => {
    const { container } = render(<Breadcrumb />);

    // Humanização: "foo" → "Foo".
    expect(screen.getByText("Foo")).toBeInTheDocument();
    expect(screen.getByText("Bar")).toBeInTheDocument();

    const atual = container.querySelector('[aria-current="page"]');
    expect(atual?.textContent).toBe("Baz");
  });

  it("o nível intermediário sem destino não é focável", () => {
    const { container } = render(<Breadcrumb />);
    const meio = screen.getByText("Foo");
    // `tagName` é a asserção que importa: `span` não entra na ordem de Tab,
    // `a` entra — e era exatamente o que acontecia com o `href="#"`.
    expect(meio.tagName).toBe("SPAN");
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });
});
