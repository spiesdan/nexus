/**
 * O motor da Global Search (§17) — a MESMA fonte da paleta ⌘K e da página
 * `/app/busca`. O que se protege aqui são os CONTRATOS que as duas superfícies
 * dependem: sem chamada abaixo de 2 letras, ordem das seções (é a ordem em que
 * a paleta desenha), hrefs de destino, e que seção que falhou some em vez de
 * derrubar as outras.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buscarEntidades, MINIMO_DE_LETRAS, telasQueCasam } from "@/lib/busca/global";
import type { NavDestination } from "@/lib/navigation/registry";

const get = vi.fn();

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: (url: string) => get(url),
  },
}));

/**
 * Resposta por caminho, FILTRANDO pelo termo como o servidor faria — sem isso
 * a seção "produtos" viria sempre cheia e o teste mentiria sobre o que o motor
 * devolve. `vazio` simula a seção que não achou nada.
 */
function respondePorCaminho(url: string): { data: unknown[] } {
  const u = new URL(url, "http://localhost");
  const termo = (u.searchParams.get("busca") ?? u.searchParams.get("search") ?? "").toLowerCase();
  const linhas: Record<string, unknown[]> = {
    "/api/v1/conversations": [{ id: "conv-1", contacts: { display_name: "Ana" } }],
    "/api/v1/contacts": [{ id: "cont-1", display_name: "Ana", name: null }],
    "/api/v1/commercial-orders": [{ id: "ped-1", numero: 1237, cliente_nome: "Ana" }],
    "/api/v1/leads": [],
    "/api/v1/products": [{ id: "prod-1", nome: "Camiseta", codigo: null, marca: null }],
    "/api/v1/titulos": [],
  };
  const todas = linhas[u.pathname] ?? [];
  return { data: todas.filter((l) => JSON.stringify(l).toLowerCase().includes(termo)) };
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (url: string) => respondePorCaminho(url));
});

describe("buscarEntidades", () => {
  it("não gasta uma chamada abaixo do mínimo de letras", async () => {
    await expect(buscarEntidades(" ")).resolves.toEqual([]);
    await expect(buscarEntidades("a")).resolves.toEqual([]);
    expect(get).not.toHaveBeenCalled();
    expect(MINIMO_DE_LETRAS).toBe(2);
  });

  it("devolve só as seções que acharam, na ordem do dia", async () => {
    const secoes = await buscarEntidades("ana");
    // Conversas/clientes/pedidos acharam; leads e títulos vieram vazios e
    // produtos não casa — os três fora.
    expect(secoes.map((s) => s.id)).toEqual(["conversas", "clientes", "pedidos"]);
    expect(secoes[0]?.rotulo).toBe("Conversas");
    expect(secoes[0]?.itens[0]).toMatchObject({ href: "/app/inbox/conv-1", titulo: "Ana" });
    expect(secoes[1]?.itens[0]?.href).toBe("/app/contacts/cont-1");
    expect(secoes[2]?.itens[0]).toMatchObject({ href: "/app/pedidos/ped-1" });
  });

  it("manda o termo para os seis servidores com o vocabulário de cada um", async () => {
    await buscarEntidades("ana loja");
    const urls = get.mock.calls.map((c) => String(c[0]));
    expect(urls).toHaveLength(6);
    expect(urls.some((u) => u.includes("/conversations?search=ana%20loja"))).toBe(true);
    expect(urls.some((u) => u.includes("/contacts?search=ana%20loja"))).toBe(true);
    expect(urls.some((u) => u.includes("/commercial-orders?busca=ana%20loja"))).toBe(true);
    expect(urls.some((u) => u.includes("/leads?busca=ana%20loja"))).toBe(true);
    expect(urls.some((u) => u.includes("/products?busca=ana%20loja"))).toBe(true);
    expect(urls.some((u) => u.includes("/titulos?busca=ana%20loja"))).toBe(true);
  });

  it("seção que rejeita some — o resto continua de pé", async () => {
    get.mockImplementation(async (url: string) => {
      if (url.includes("/contacts")) throw new Error("servidor fora");
      return respondePorCaminho(url);
    });
    const secoes = await buscarEntidades("ana");
    expect(secoes.map((s) => s.id)).toEqual(["conversas", "pedidos"]);
  });

  it("produto e título levam à lista com o termo dentro, não a um detalhe órfão", async () => {
    const secoes = await buscarEntidades("camiseta");
    const produto = secoes.find((s) => s.id === "produtos");
    expect(produto?.itens[0]?.href).toBe("/app/products?busca=camiseta");
  });
});

describe("telasQueCasam", () => {
  const visiveis = [
    { href: "/app/kanban", label: "Funis", description: "Seus funis de venda.", group: "vendas" },
    { href: "/app/inbox", label: "Inbox", description: "As conversas de WhatsApp.", group: "atendimento" },
  ] as unknown as NavDestination[];

  it("termo vazio devolve vazio — quem digita depois é quem decide", () => {
    expect(telasQueCasam(visiveis, "  ")).toEqual([]);
  });

  it("casa por rótulo e descrição, sem acento nem caixa", () => {
    expect(telasQueCasam(visiveis, "FUNIS").map((d) => d.href)).toEqual(["/app/kanban"]);
    expect(telasQueCasam(visiveis, "whatsapp").map((d) => d.href)).toEqual(["/app/inbox"]);
    expect(telasQueCasam(visiveis, "funi").map((d) => d.href)).toEqual(["/app/kanban"]);
  });
});
