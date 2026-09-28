import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusPage, type VarianteStatus } from "@/components/nexus-ui/feedback/StatusPage";

/**
 * O catálogo das 6 rotas de status num arquivo só — e este teste é o contrato
 * que o e2e (`error-pages`, `rbac-roles`, `invite-lifecycle`, `system-update`)
 * espera por texto. Mudar a cópia de uma variante muda AQUI primeiro.
 */
describe("StatusPage", () => {
  const copias: [VarianteStatus, string][] = [
    ["sem-permissao", "403 — Sem permissão"],
    ["nao-encontrada", "404 — Página não encontrada"],
    ["erro-interno", "500 — Erro interno"],
    ["manutencao", "503 — Em manutenção"],
    ["conta-suspensa", "Conta suspensa"],
    ["acesso-negado-admin", "Acesso negado"],
  ];

  it.each(copias)("variante %s renderiza o título exato que o e2e procura", (variante, titulo) => {
    render(<StatusPage variante={variante} idioma="pt-BR" />);
    expect(screen.getByRole("heading", { level: 1, name: titulo })).toBeInTheDocument();
  });

  it("/403 e /404 botam o voltar primário na inbox (é para lá que o guard manda)", () => {
    render(<StatusPage variante="sem-permissao" idioma="pt-BR" />);
    expect(screen.getByRole("link", { name: "Voltar pra Inbox" })).toHaveAttribute(
      "href",
      "/app/inbox",
    );
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/");
  });

  it("conta-suspensa sem operador configurado NÃO renderiza endereço nenhum", () => {
    render(<StatusPage variante="conta-suspensa" idioma="pt-BR" suporte={null} />);
    expect(screen.queryByRole("link", { name: /@/ })).toBeNull();
    expect(screen.getByText(/fale com quem administra este sistema/i)).toBeInTheDocument();
  });

  it("conta-suspensa com operador aponta o mailto para ELE (nunca para o produto)", () => {
    render(<StatusPage variante="conta-suspensa" idioma="pt-BR" suporte="ops@revenda.example" />);
    expect(screen.getByRole("link", { name: "ops@revenda.example" })).toHaveAttribute(
      "href",
      "mailto:ops@revenda.example",
    );
  });

  it("admin proibido leva de volta ao /app e ao início", () => {
    render(<StatusPage variante="acesso-negado-admin" idioma="pt-BR" />);
    expect(screen.getByRole("link", { name: "Voltar para /app" })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(screen.getByRole("link", { name: "Início" })).toHaveAttribute("href", "/");
  });
});
