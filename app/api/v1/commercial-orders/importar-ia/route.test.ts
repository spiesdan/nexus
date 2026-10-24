/**
 * A ROTA DO PEDIDO POR IA — o que ela promete e o que ela recusa.
 *
 * O caminho caro é uma chamada de modelo. Por isso os testes verificam,
 * primeiro, tudo o que acontece ANTES dela: sem login, sem catálogo, sem IA ou
 * com formato errado, o modelo não é chamado. Depois, o caminho feliz: a
 * imagem chega como parte de arquivo, o nome volta casado com o catálogo e o
 * produto NÃO é gravado no pedido — a rota devolve proposta.
 */
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Produto } from "@/lib/schemas/produtos";

const ORG_ID = "33333333-3333-4333-8333-333333333333";

const generateObjectMock = vi.hoisted(() => vi.fn());
const resolverMock = vi.hoisted(() => vi.fn());
const rateLimitMock = vi.hoisted(() => vi.fn());
const requireRoleMock = vi.hoisted(() => vi.fn());
const createClientMock = vi.hoisted(() => vi.fn());
const adminInsertMock = vi.hoisted(() => vi.fn());
const computeCostMock = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateObject: generateObjectMock }));
vi.mock("@/lib/ai/gateway-binding", () => ({ resolverModeloDoPonto: resolverMock }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: rateLimitMock }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ insert: adminInsertMock }),
  }),
}));
vi.mock("@/lib/ai/runtime/cost", () => ({ computeCostCents: computeCostMock }));
vi.mock("@/lib/ai/log-invocation", () => ({ providerDoModelo: () => "anthropic" }));

function produto(parcial: Partial<Produto> & Pick<Produto, "id" | "nome">): Produto {
  return {
    codigo: parcial.id.toUpperCase(),
    descricao: null,
    marca: "BILL",
    categoria: "LIMPEZA",
    preco_cents: 1290,
    moeda: "BRL",
    custo_cents: null,
    controla_estoque: true,
    quantidade: 10,
    ativo: true,
    origem: "mercos",
    imagem_url: null,
    ncm: null,
    ncm_origem: null,
    unidade: "UN",
    cfop: null,
    destaque: false,
    preco_promocional_cents: null,
    promocao_ate: null,
    ipi_pct: null,
    comissao_pct: null,
    multiplo: 1,
    observacoes: null,
    peso_bruto_kg: null,
    largura_cm: null,
    altura_cm: null,
    comprimento_cm: null,
    caixa_peso_bruto_kg: null,
    caixa_largura_cm: null,
    caixa_altura_cm: null,
    caixa_comprimento_cm: null,
    variacoes: null,
    updated_at: "2026-10-23T00:00:00.000Z",
    ...parcial,
  };
}

const CATALOGO = [
  produto({ id: "agua-5l", nome: "AGUA SANITARIA BILL 5 L" }),
  produto({ id: "alcool-46", nome: "ALCOOL 46% 1L" }),
];

type ResultadoDoBanco = { data: unknown; error: { message: string } | null };

function fakeBuilder(resultado: ResultadoDoBanco) {
  const q: Record<string, unknown> = {};
  const volta = () => q;
  q.select = vi.fn(volta);
  q.eq = vi.fn(volta);
  q.order = vi.fn(volta);
  q.limit = vi.fn(volta);
  q.then = (onOk: unknown, onErr: unknown) =>
    Promise.resolve(resultado).then(onOk as never, onErr as never);
  return q;
}

let builder: ReturnType<typeof fakeBuilder>;
let de: ReturnType<typeof vi.fn>;

function request(form: FormData): NextRequest {
  // O vitest roda em jsdom; `NextRequest` do undici não aceita o FormData do
  // jsdom (o boundary é interno e o construtor tenta ler `_buffer`). A rota só
  // usa `formData()`, então um duplo com esse único método é fiel ao contrato.
  return {
    headers: new Headers(),
    formData: async () => form,
  } as unknown as NextRequest;
}

function formDeTexto(texto: string): FormData {
  const form = new FormData();
  form.append("texto", texto);
  return form;
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeEach(() => {
  vi.clearAllMocks();
  builder = fakeBuilder({ data: CATALOGO, error: null });
  de = vi.fn(() => builder);
  createClientMock.mockResolvedValue({ from: de } as never);
  requireRoleMock.mockResolvedValue({
    ok: true,
    org: { orgId: ORG_ID, role: "agent" },
    user: { id: "usuario-1" },
  } as never);
  resolverMock.mockResolvedValue({
    model: "modelo-falso",
    modelId: "modelo-falso",
    origem: "binding",
  } as never);
  rateLimitMock.mockResolvedValue({
    allowed: true,
    count: 1,
    limit: 10,
    window_sec: 60,
  } as never);
  computeCostMock.mockResolvedValue(0);
  adminInsertMock.mockResolvedValue({ error: null });
  generateObjectMock.mockResolvedValue({
    object: {
      itens: [{ nome: "AGUA SANITARIA BILL 5 L", quantidade: 2 }],
    },
    usage: { inputTokens: 120, outputTokens: 20 },
  });
});

describe("POST /api/v1/commercial-orders/importar-ia", () => {
  it("imagem vira parte de arquivo e o nome volta casado — sem gravar pedido", async () => {
    const form = new FormData();
    form.append("arquivo", new File([PNG], "pedido.png", { type: "image/png" }));

    const { POST } = await import("./route");
    const resposta = await POST(request(form));
    expect(resposta.status).toBe(200);

    const corpo = (await resposta.json()) as {
      data: { itens: { produto_id: string | null; confianca: string; quantidade: number }[] };
    };
    expect(corpo.data.itens[0]).toMatchObject({
      produto_id: "agua-5l",
      confianca: "alta",
      quantidade: 2,
    });

    const chamada = generateObjectMock.mock.calls[0]?.[0] as {
      messages: { content: unknown }[];
      maxOutputTokens: number;
    };
    const conteudo = chamada.messages[0]?.content as unknown[];
    expect(conteudo.some((p) => (p as { type?: string }).type === "file")).toBe(true);
    // O teto é explícito para a OpenRouter não pré-autorizar o máximo do
    // modelo (65.536) numa tarefa cuja resposta cabe em poucos milhares.
    expect(chamada.maxOutputTokens).toBe(8_192);
    expect(de).toHaveBeenCalledWith("catalog_products");
    expect(builder.eq).toHaveBeenCalledWith("organization_id", ORG_ID);
  });

  it("texto colado não vira arquivo e é fechado em <pedido>", async () => {
    const { POST } = await import("./route");
    const resposta = await POST(request(formDeTexto("2 agua sanitária 5L")));
    expect(resposta.status).toBe(200);

    const chamada = generateObjectMock.mock.calls[0]?.[0] as {
      messages: { content: unknown }[];
    };
    expect(typeof chamada.messages[0]?.content).toBe("string");
    expect(chamada.messages[0]?.content).toContain("<pedido>");
  });

  it("formato que não é imagem/PDF/áudio/CSV não gasta chamada de modelo", async () => {
    const form = new FormData();
    form.append(
      "arquivo",
      new File([new Uint8Array([0x50, 0x4b])], "planilha.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    const { POST } = await import("./route");
    const resposta = await POST(request(form));
    expect(resposta.status).toBe(422);
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("catálogo vazio recusa ANTES de chamar o modelo", async () => {
    builder = fakeBuilder({ data: [], error: null });
    de.mockReturnValue(builder);

    const { POST } = await import("./route");
    const resposta = await POST(request(formDeTexto("2 agua sanitária")));
    expect(resposta.status).toBe(422);
    const corpo = (await resposta.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe("catalogo_vazio");
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("IA desligada devolve 503 e explica onde ligar", async () => {
    resolverMock.mockResolvedValue(null);

    const { POST } = await import("./route");
    const resposta = await POST(request(formDeTexto("2 agua sanitária")));
    expect(resposta.status).toBe(503);
    const corpo = (await resposta.json()) as { error: { code: string; message: string } };
    expect(corpo.error.code).toBe("ai_indisponivel");
    expect(corpo.error.message).toContain("Credenciais");
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("leitura vazia não inventa item", async () => {
    generateObjectMock.mockResolvedValue({
      object: { itens: [] },
      usage: { inputTokens: 10, outputTokens: 1 },
    });

    const { POST } = await import("./route");
    const resposta = await POST(request(formDeTexto("qualquer coisa")));
    expect(resposta.status).toBe(422);
    const corpo = (await resposta.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe("pedido_sem_produtos");
  });

  it("falha do modelo vira mensagem de leitura, não stack trace", async () => {
    generateObjectMock.mockRejectedValue(new Error("algo inesperado no provedor"));

    const { POST } = await import("./route");
    const resposta = await POST(request(formDeTexto("2 agua sanitária")));
    expect(resposta.status).toBe(422);
    const corpo = (await resposta.json()) as { error: { code: string; message: string } };
    expect(corpo.error.code).toBe("leitura_do_pedido_falhou");
    expect(corpo.error.message).not.toContain("algo inesperado no provedor");
  });

  it("conta sem saldo não vira 'foto ruim' — a mensagem diz o que pagar", async () => {
    // Texto exato da OpenRouter medido em produção em 2026-10-24. Antes, ele
    // caía no genérico "tente uma foto mais nítida": a pessoa repetia a foto
    // enquanto o conserto era crédito na conta.
    generateObjectMock.mockRejectedValue(
      Object.assign(
        new Error(
          "This request requires more credits, or fewer max_tokens. You requested up to 65536 tokens, but can only afford 124.",
        ),
        { statusCode: 402 },
      ),
    );

    const { POST } = await import("./route");
    const resposta = await POST(request(formDeTexto("2 agua sanitária")));
    expect(resposta.status).toBe(503);
    const corpo = (await resposta.json()) as { error: { code: string; message: string } };
    expect(corpo.error.code).toBe("ai_provider_error");
    expect(corpo.error.message).toContain("saldo");
    expect(corpo.error.message).not.toContain("nítida");
  });

  it("chave recusada aponta a credencial, não o enquadramento da foto", async () => {
    generateObjectMock.mockRejectedValue(
      Object.assign(new Error("401 Unauthorized: invalid api key"), { statusCode: 401 }),
    );

    const { POST } = await import("./route");
    const resposta = await POST(request(formDeTexto("2 agua sanitária")));
    expect(resposta.status).toBe(503);
    const corpo = (await resposta.json()) as { error: { code: string; message: string } };
    expect(corpo.error.code).toBe("ai_provider_error");
    expect(corpo.error.message).toContain("chave");
  });

  it("Content-Length acima do teto é recusado sem ler o multipart", async () => {
    const formData = vi.fn(async () => new FormData());
    const requisicao = {
      headers: new Headers({ "content-length": String(22 * 1024 * 1024) }),
      formData,
    } as unknown as NextRequest;

    const { POST } = await import("./route");
    const resposta = await POST(requisicao);
    expect(resposta.status).toBe(413);
    const corpo = (await resposta.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe("payload_too_large");
    expect(formData).not.toHaveBeenCalled();
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("rate limit barra antes de qualquer custo", async () => {
    rateLimitMock.mockResolvedValue({
      allowed: false,
      count: 11,
      limit: 10,
      window_sec: 60,
    });

    const { POST } = await import("./route");
    const resposta = await POST(request(formDeTexto("2 agua sanitária")));
    expect(resposta.status).toBe(429);
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("sem permissão, nem lê o formulário", async () => {
    requireRoleMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: { code: "unauthorized" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    } as never);

    const { POST } = await import("./route");
    const resposta = await POST(request(formDeTexto("2 agua sanitária")));
    expect(resposta.status).toBe(401);
    expect(generateObjectMock).not.toHaveBeenCalled();
  });
});
