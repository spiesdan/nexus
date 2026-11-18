/**
 * J6 — ENCERRAR E ARQUIVAR CONVERSA: a prova de ROTA, sem navegador.
 *
 * A jornada do inbox (13-jornadas.md, §J6) fecha 7 de 9 e a lacuna nomeada é
 * exatamente esta: "Encerrar ('Fechar esta conversa?', com confirmação) e
 * arquivar têm botão em ConversationHeader.tsx e nenhum spec que clique neles".
 *
 * Aqui a prova é a camada de baixo, e por um motivo declarado: o E2E depende de
 * banco semeado, WAHA e navegador; quando o ambiente não tem conversa com
 * mensagem a spec pula. A rota não pula. Ela prova três coisas que o clique não
 * prova sozinho:
 *
 *   1. o happy path GRAVA o que a tela promete (`status: closed`, `archived`);
 *   2. a recusa de permissão acontece ANTES de qualquer escrita (o guard é a
 *      primeira coisa depois do parse — não há query antes dele);
 *   3. o erro do banco vira `fail()` com código e status, e não um 200 vazio.
 *
 * O que este arquivo NÃO prova: que o botão está visível na largura certa, que
 * o diálogo de confirmação aparece. Isso é `inbox-fechar-pela-tela.test.tsx`,
 * ao lado. Dois arquivos porque são duas perguntas diferentes.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const ATENDENTE = "11111111-1111-4111-8111-111111111111";
const CONVERSA = "33333333-3333-4333-8333-333333333333";

const authzOk = {
  ok: true as const,
  user: { id: ATENDENTE, email: "atendente@j6.test" },
  org: { orgId: ORG, role: "agent" as const, name: "Org J6" },
};

type Resultado = { data: unknown; error: unknown };

/**
 * Dublê encadeável do PostgREST.
 *
 * O detalhe que importa: `close` faz DOIS updates encadeados diferentes — o
 * primeiro termina em `.maybeSingle()`, o segundo é aguardado direto. Um dublê
 * que resolvesse os dois pelo mesmo caminho não distinguiria "a conversa foi
 * fechada" de "o silêncio foi solto", e um erro no segundo passaria como
 * sucesso. Por isso cada `update` empurra uma entrada em `atualizacoes` e o
 * `then` do encadeamento resolve a SEGUNDA.
 */
function duble(comportamento: { fechar: () => Promise<Resultado>; soltar?: () => Promise<Resultado> }) {
  const atualizacoes: Array<Record<string, unknown>> = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "not", "in", "order", "limit", "range"]) {
    q[m] = () => q;
  }
  q.update = (carga: Record<string, unknown>) => {
    atualizacoes.push(carga);
    return q;
  };
  q.maybeSingle = () => comportamento.fechar();
  q.then = (resolve: (v: Resultado) => unknown) =>
    (comportamento.soltar
      ? comportamento.soltar()
      : Promise.resolve({ data: null, error: null })
    ).then(resolve);
  return { q, atualizacoes };
}

function corpoPedido(corpo: unknown = {}): NextRequest {
  return new NextRequest(`http://localhost/api/v1/conversations/${CONVERSA}/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

const ctx = { params: Promise.resolve({ id: CONVERSA }) };

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(authzOk as never);
  vi.mocked(audit).mockClear();
  vi.mocked(createClient).mockClear();
  vi.mocked(createAdminClient).mockClear();
});

describe("POST /api/v1/conversations/[id]/close", () => {
  it("fecha a conversa, solta o silêncio do episódio e audita", async () => {
    const { POST } = await import("@/app/api/v1/conversations/[id]/close/route");
    const { q, atualizacoes } = duble({
      fechar: async () => ({
        data: {
          id: CONVERSA,
          organization_id: ORG,
          status: "closed",
          contact_id: null,
        },
        error: null,
      }),
    });
    vi.mocked(createClient).mockResolvedValue({ from: () => q } as never);

    const res = await POST(corpoPedido(), ctx);
    const json = (await res.json()) as { data: { status: string } };

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("closed");
    // 1º update: o fechamento. 2º: o silêncio condicionado a não ser escalação.
    expect(atualizacoes[0]).toMatchObject({ status: "closed" });
    expect(atualizacoes[1]).toEqual({ bot_silenced_until: null });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "conversation.closed", resourceId: CONVERSA }),
    );
  });

  it("conversa inexistente é 404 e NÃO audita um fechamento que não houve", async () => {
    const { POST } = await import("@/app/api/v1/conversations/[id]/close/route");
    const { q } = duble({ fechar: async () => ({ data: null, error: null }) });
    vi.mocked(createClient).mockResolvedValue({ from: () => q } as never);

    const res = await POST(corpoPedido(), ctx);
    const json = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(audit).not.toHaveBeenCalled();
  });

  it("erro do banco vira 500 com código, não um 200 vazio", async () => {
    const { POST } = await import("@/app/api/v1/conversations/[id]/close/route");
    const { q } = duble({
      fechar: async () => ({ data: null, error: { message: "permission denied for table conversations" } }),
    });
    vi.mocked(createClient).mockResolvedValue({ from: () => q } as never);

    const res = await POST(corpoPedido(), ctx);
    const json = (await res.json()) as { error: { code: string; message: string } };

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("internal_error");
    expect(json.error.message).toContain("permission denied");
  });

  it("permissão negada devolve a resposta do guard e não consulta nem escreve", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden", "Papel insuficiente.", 403),
    } as never);
    const from = vi.fn();
    vi.mocked(createClient).mockResolvedValue({ from } as never);
    const { POST } = await import("@/app/api/v1/conversations/[id]/close/route");

    const res = await POST(corpoPedido(), ctx);

    expect(res.status).toBe(403);
    // O cliente é criado antes do guard (uma linha, sem query); o que não pode
    // acontecer é a CONSULTA. `from` é o primeiro passo de qualquer acesso.
    expect(from).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("exige papel agent — viewer não fecha conversa", async () => {
    const { POST } = await import("@/app/api/v1/conversations/[id]/close/route");
    const { q } = duble({
      fechar: async () => ({ data: { id: CONVERSA, organization_id: ORG, status: "closed" }, error: null }),
    });
    vi.mocked(createClient).mockResolvedValue({ from: () => q } as never);

    await POST(corpoPedido(), ctx);

    expect(requireRole).toHaveBeenCalledWith("agent", expect.objectContaining({ resource: "conversations" }));
  });
});

describe("POST /api/v1/conversations/arquivar-todas", () => {
  function pedido(corpo: unknown): NextRequest {
    return new NextRequest("http://localhost/api/v1/conversations/arquivar-todas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
  }

  /**
   * O arquivamento em lote faz `select(...).eq().not().limit()` aguardado, e
   * depois `update(...).eq().in()` aguardado. O dublê abaixo distingue os dois
   * pelo método terminal: `limit` resolve a LISTA de alvos; `then` resolve o
   * UPDATE. É a única forma de provar que a lista vazia não dispara update.
   */
  function adminDuble(alvos: Array<{ id: string }>, erroUpdate: unknown = null) {
    const atualizacoes: Array<Record<string, unknown> | null> = [];
    const q: Record<string, unknown> = {};
    q.from = () => q;
    q.select = () => q;
    q.eq = () => q;
    q.not = () => q;
    q.limit = () => Promise.resolve({ data: alvos, error: null });
    q.update = (carga: Record<string, unknown>) => {
      atualizacoes.push(carga);
      return q;
    };
    q.in = () => Promise.resolve({ data: null, error: erroUpdate });
    q.then = (resolve: (v: Resultado) => unknown) =>
      Promise.resolve({ data: null, error: erroUpdate }).then(resolve);
    return { q, atualizacoes };
  }

  it("sem confirmação explícita é 400 — duplo clique não limpa a fila do time", async () => {
    const { POST } = await import("@/app/api/v1/conversations/arquivar-todas/route");
    vi.mocked(createAdminClient).mockReturnValue(adminDuble([{ id: CONVERSA }]).q as never);

    const res = await POST(pedido({}));

    expect(res.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("fila já vazia responde 0 sem update", async () => {
    const { POST } = await import("@/app/api/v1/conversations/arquivar-todas/route");
    const { q, atualizacoes } = adminDuble([]);
    vi.mocked(createAdminClient).mockReturnValue(q as never);

    const res = await POST(pedido({ confirmar: true }));
    const json = (await res.json()) as { data: { arquivadas: number } };

    expect(res.status).toBe(200);
    expect(json.data.arquivadas).toBe(0);
    expect(atualizacoes).toHaveLength(0);
  });

  it("arquiva os ids da organização e devolve a contagem real", async () => {
    const { POST } = await import("@/app/api/v1/conversations/arquivar-todas/route");
    const { q, atualizacoes } = adminDuble([{ id: "a" }, { id: "b" }]);
    vi.mocked(createAdminClient).mockReturnValue(q as never);

    const res = await POST(pedido({ confirmar: true }));
    const json = (await res.json()) as { data: { arquivadas: number } };

    expect(res.status).toBe(200);
    expect(json.data.arquivadas).toBe(2);
    expect(atualizacoes[0]).toMatchObject({ status: "archived", unread_count_for_assignee: 0 });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "conversation.archived_all", metadata: { arquivadas: 2 } }),
    );
  });

  it("erro ao gravar o arquivamento é 500 — não responde sucesso com fila intacta", async () => {
    const { POST } = await import("@/app/api/v1/conversations/arquivar-todas/route");
    const { q } = adminDuble([{ id: CONVERSA }], { message: "connection reset" });
    vi.mocked(createAdminClient).mockReturnValue(q as never);

    const res = await POST(pedido({ confirmar: true }));

    expect(res.status).toBe(500);
    expect(audit).not.toHaveBeenCalled();
  });

  it("é operação de manager: agent não recebe a fila do time para limpar", async () => {
    const { POST } = await import("@/app/api/v1/conversations/arquivar-todas/route");
    vi.mocked(createAdminClient).mockReturnValue(adminDuble([]).q as never);

    await POST(pedido({ confirmar: true }));

    expect(requireRole).toHaveBeenCalledWith("manager", expect.objectContaining({ resource: "conversations" }));
  });
});
