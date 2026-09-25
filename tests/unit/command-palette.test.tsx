/**
 * ⌘K — a porta da Global Search (§17).
 *
 * v1 buscava só NAVEGAÇÃO; as seis entidades entram pela mesma janela sem
 * trocar o que já estava provado aqui: acha tela por descrição, ignora acento,
 * respeita papel, Enter navega para o destaque. O mock de `apiClient` filtra
 * pelo termo como o servidor faria — sem ele, cada teste pagaria seis buscas
 * reais (que no jsdom rejeitam) e "Nada encontrado" seria acerto de sorte.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CommandPalette } from "@/components/shell/CommandPalette";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

vi.mock("@/lib/api/client", () => {
  const FIXTURES: Array<{ caminho: string; itens: Array<Record<string, unknown>> }> = [
    {
      caminho: "/api/v1/conversations",
      itens: [
        {
          id: "conv-1",
          contacts: { display_name: "Ana Loja", name: null },
          last_message_preview: "Fecha hoje?",
        },
      ],
    },
    {
      caminho: "/api/v1/contacts",
      itens: [{ id: "cont-1", display_name: "Ana Loja", name: null }],
    },
    {
      caminho: "/api/v1/commercial-orders",
      itens: [{ id: "ped-1", numero: 1237, cliente_nome: "Ana Loja" }],
    },
    { caminho: "/api/v1/leads", itens: [{ id: "lead-1", title: "Ana Loja reforma" }] },
    {
      caminho: "/api/v1/products",
      itens: [
        { id: "prod-1", nome: "Camiseta Preta", codigo: "CAM01", marca: "Acme" },
      ],
    },
    {
      caminho: "/api/v1/titulos",
      itens: [
        {
          order_id: "tit-1",
          numero: 1237,
          cliente_nome: "Ana Loja",
          parcela: 2,
          de: 6,
        },
      ],
    },
  ];
  return {
    apiClient: {
      get: vi.fn(async (url: string) => {
        const u = new URL(url, "http://localhost");
        const termo = (
          u.searchParams.get("busca") ??
          u.searchParams.get("search") ??
          ""
        ).toLowerCase();
        const fixture = FIXTURES.find((f) => u.pathname.endsWith(f.caminho));
        const itens = (fixture?.itens ?? []).filter((i) =>
          JSON.stringify(i).toLowerCase().includes(termo),
        );
        return { data: itens };
      }),
    },
  };
});

const push = vi.fn();
const authRef: { user: Pick<AuthUser, "is_platform_admin">; activeOrg: ActiveOrg | null } = {
  user: { is_platform_admin: false },
  activeOrg: { orgId: "org-1", name: "Org", role: "admin" },
};

vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => authRef }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function comoPapel(role: ActiveOrg["role"]) {
  authRef.activeOrg = { orgId: "org-1", name: "Org", role };
}

afterEach(() => {
  cleanup();
  push.mockClear();
  comoPapel("admin");
});

function abrir() {
  return render(<CommandPalette open onOpenChange={() => {}} />);
}

describe("CommandPalette", () => {
  it("acha uma tela que o sidebar não mostra", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "conhec");
    expect(screen.getByRole("option", { name: /Conhecimento/ })).toBeTruthy();
  });

  it("ignora acento, porque ninguém digita acento com pressa", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "orcamento");
    expect(screen.getByRole("option", { name: /Uso e orçamento/ })).toBeTruthy();
  });

  it("busca também na descrição, não só no rótulo", async () => {
    const user = userEvent.setup();
    abrir();
    // Ninguém procura "Radar" por esse nome; procura pelo problema que resolve.
    await user.type(screen.getByRole("combobox"), "esfriou");
    expect(screen.getByRole("option", { name: /Radar/ })).toBeTruthy();
  });

  it("respeita o papel", async () => {
    comoPapel("agent");
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "audit");
    expect(screen.queryByRole("option", { name: /Audit Log/ })).toBeNull();
  });

  it("Enter navega para o item destacado", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "conhec");
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/app/ai/knowledge/sources");
  });

  it("seta para baixo move o destaque antes do Enter", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "a");
    await user.keyboard("{ArrowDown}{Enter}");
    const segundo = screen.getAllByRole("option")[1];
    expect(segundo).toBeDefined();
    expect(push).toHaveBeenCalledWith(segundo?.getAttribute("data-href"));
  });

  it("sem texto, oferece o trabalho do dia em vez de tela vazia", () => {
    abrir();
    expect(screen.getByRole("option", { name: /Inbox/ })).toBeTruthy();
  });

  it("diz quando não achou, em vez de sumir sem explicação", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "zzzzzz");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/Nada encontrado/i)).toBeTruthy();
  });

  it("traz as entidades depois do debounce, cada uma na sua seção", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "ana loja");
    // findBy* espera o debounce de 300ms — o mesmo relógio da paleta.
    expect(await screen.findByRole("group", { name: "Conversas" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Clientes" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Pedidos" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Leads" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Títulos" })).toBeTruthy();
    expect(screen.getAllByText("Ana Loja").length).toBeGreaterThan(1);
    // Produto não casa com "ana loja" — seção que não achou não aparece.
    expect(screen.queryByRole("group", { name: "Produtos" })).toBeNull();
  });

  it("Enter cai na entidade quando nenhuma tela casa com o termo", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "camiseta");
    expect(await screen.findByRole("option", { name: /Camiseta Preta/ })).toBeTruthy();
    await user.keyboard("{Enter}");
    // O clique leva à lista com o termo dentro: produto não tem página própria.
    expect(push).toHaveBeenCalledWith("/app/products?busca=camiseta");
  });

  it("as setas atravessam as seções — o último item é alcançável pelo teclado", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "ana loja");
    await screen.findByRole("group", { name: "Títulos" });
    const opcoes = screen.getAllByRole("option");
    const ultimo = opcoes[opcoes.length - 1];
    // Demais de uma vez: o destaque faz clamp no fim, então chega ao último.
    await user.keyboard("{ArrowDown}".repeat(opcoes.length + 2));
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith(ultimo?.getAttribute("data-href"));
  });

  it("oferece a ponte para a página de resultados com o termo na URL", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "conhec");
    const botao = await screen.findByRole("button", { name: /Ver todos os resultados/ });
    await user.click(botao);
    expect(push).toHaveBeenCalledWith("/app/busca?q=conhec");
  });
});
