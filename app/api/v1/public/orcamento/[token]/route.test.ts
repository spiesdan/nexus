/**
 * A SUPERFÍCIE HTTP DO ORÇAMENTO PÚBLICO.
 *
 * O que este teste prende é o CONTRATO: sem cookie, o que o cliente (e a página)
 * recebem é o código de status e o corpo. Cada motivo de recusa tem o seu — 404
 * para link que não vale, 409 para pedido cancelado, 422 para ação que não
 * existe — porque a tela mostra uma mensagem diferente para cada um.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  aprovarOrcamentoPublico,
  carregarOrcamentoPublico,
} from "@/lib/comercial/orcamento-publico";

vi.mock("@/lib/comercial/orcamento-publico", () => ({
  carregarOrcamentoPublico: vi.fn(),
  aprovarOrcamentoPublico: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));

const params = (token: string) => ({ params: Promise.resolve({ token }) });

function post(corpoo: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/public/orcamento/tok", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpoo),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/public/orcamento/[token]", () => {
  it("link que não vale é 404 — e o cliente não vê detalhe nenhum", async () => {
    vi.mocked(carregarOrcamentoPublico).mockResolvedValue(null);
    const { GET } = await import("./route");
    const resposta = await GET(new NextRequest("http://localhost/x"), params("tok"));
    expect(resposta.status).toBe(404);
  });

  it("link que vale devolve o orçamento", async () => {
    vi.mocked(carregarOrcamentoPublico).mockResolvedValue({ numero: 42 } as never);
    const { GET } = await import("./route");
    const resposta = await GET(new NextRequest("http://localhost/x"), params("tok"));
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as { data: { numero: number } };
    expect(corpo.data.numero).toBe(42);
    expect(vi.mocked(carregarOrcamentoPublico)).toHaveBeenCalledWith(expect.anything(), "tok");
  });
});

describe("POST /api/v1/public/orcamento/[token]", () => {
  it("ação desconhecida é 422, antes de qualquer escrita", async () => {
    const { POST } = await import("./route");
    const resposta = await POST(post({ acao: "cancelar" }), params("tok"));
    expect(resposta.status).toBe(422);
    expect(vi.mocked(aprovarOrcamentoPublico)).not.toHaveBeenCalled();
  });

  it("corpo ausente não derruba a rota", async () => {
    const { POST } = await import("./route");
    const resposta = await POST(post(null), params("tok"));
    expect(resposta.status).toBe(422);
  });

  it("aprovação que entra na fila sai como aprovado", async () => {
    vi.mocked(aprovarOrcamentoPublico).mockResolvedValue({
      ok: true,
      jaAprovado: false,
      aguardandoGerente: false,
    });
    const { POST } = await import("./route");
    const resposta = await POST(post({ acao: "aprovar" }), params("tok"));
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      data: { aprovado: boolean; ja_aprovado: boolean; aguardando_aprovacao: boolean };
    };
    expect(corpo.data).toEqual({ aprovado: true, ja_aprovado: false, aguardando_aprovacao: false });
  });

  it("aprovação registrada (desconto acima do teto) NÃO sai como aprovado", async () => {
    vi.mocked(aprovarOrcamentoPublico).mockResolvedValue({
      ok: true,
      jaAprovado: false,
      aguardandoGerente: true,
    });
    const { POST } = await import("./route");
    const resposta = await POST(post({ acao: "aprovar" }), params("tok"));
    const corpo = (await resposta.json()) as {
      data: { aprovado: boolean; aguardando_aprovacao: boolean };
    };
    expect(corpo.data.aprovado).toBe(false);
    expect(corpo.data.aguardando_aprovacao).toBe(true);
  });

  it("pedido cancelado é 409; link inválido e pedido ausente são 404", async () => {
    const { POST } = await import("./route");

    vi.mocked(aprovarOrcamentoPublico).mockResolvedValue({ ok: false, motivo: "cancelado" });
    expect((await POST(post({ acao: "aprovar" }), params("tok"))).status).toBe(409);

    vi.mocked(aprovarOrcamentoPublico).mockResolvedValue({ ok: false, motivo: "link_invalido" });
    expect((await POST(post({ acao: "aprovar" }), params("tok"))).status).toBe(404);

    vi.mocked(aprovarOrcamentoPublico).mockResolvedValue({ ok: false, motivo: "nao_encontrado" });
    expect((await POST(post({ acao: "aprovar" }), params("tok"))).status).toBe(404);
  });
});
