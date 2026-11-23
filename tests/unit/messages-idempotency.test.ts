/**
 * IDEMPOTÊNCIA DE POST /api/v1/messages — retry não pode enviar duas vezes.
 *
 * O cliente já manda `Idempotency-Key` em todo POST; a rota de mensagens não
 * lia o header, então um timeout seguido de retryduplicava a mensagem na caixa
 * de entrada. Aqui se mede o contrato do mesmo desenho das rotas fiscais:
 * mesma chave + mesmo payload devolve a ORIGINAL com `Idempotency-Replayed`,
 * mesma chave + payload diferente é 409, e sem chave o comportamento é o de
 * sempre (dois envios).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enviar: vi.fn(),
  admin: null as unknown,
}));

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({ ok: true, user: { id: "user-1" }, org: { orgId: "org-1" } }),
}));
vi.mock("@/lib/schemas", () => ({
  sendMessageSchema: {},
  validateRequest: async (_schema: unknown, req: Request) => await req.json(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.admin }));
vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: mocks.enviar }));

import { POST } from "../../app/api/v1/messages/route";

type Linha = {
  organization_id: string;
  endpoint: string;
  key: string;
  request_hash: string;
  status_code: number;
  response_body: unknown;
  expires_at: string;
};

const linhas = new Map<string, Linha>();
const chaveDa = (org: string, endpoint: string, key: string) => `${org}|${endpoint}|${key}`;

class Consulta {
  filtros: Record<string, unknown> = {};
  constructor(
    private readonly operacao: "select" | "insert" | "update" | "delete",
    private readonly valor?: unknown,
  ) {}
  eq(coluna: string, valor: unknown): this {
    this.filtros[coluna] = valor;
    return this;
  }
  private id(): string {
    return chaveDa(
      String(this.filtros.organization_id),
      String(this.filtros.endpoint),
      String(this.filtros.key),
    );
  }
  async maybeSingle() {
    return { data: linhas.get(this.id()) ?? null, error: null };
  }
  async insert(linha: Linha) {
    const id = chaveDa(linha.organization_id, linha.endpoint, linha.key);
    if (linhas.has(id)) return { error: { code: "23505" } };
    linhas.set(id, linha);
    return { error: null };
  }
  /** `update().eq()...` é awaitado direto no helper — o builder precisa ser thenable. */
  then<TResult = unknown>(resolve?: (valor: { error: null }) => TResult): Promise<TResult> {
    const executar = async (): Promise<{ error: null }> => {
      if (this.operacao === "update") {
        const atual = linhas.get(this.id());
        if (atual) linhas.set(this.id(), { ...atual, ...(this.valor as Partial<Linha>) });
      }
      if (this.operacao === "delete") linhas.delete(this.id());
      return { error: null };
    };
    return executar().then((valor) => (resolve ? resolve(valor) : (valor as TResult)));
  }
  update(patch: Partial<Linha>): Consulta {
    return new Consulta("update", patch);
  }
  delete(): Consulta {
    return new Consulta("delete");
  }
}

const admin = {
  from(tabela: string) {
    if (tabela !== "idempotency_keys") throw new Error(`tabela inesperada: ${tabela}`);
    return {
      select: () => new Consulta("select"),
      insert: (linha: Linha) => new Consulta("insert").insert(linha),
      update: (patch: Partial<Linha>) => new Consulta("update", patch),
      delete: () => new Consulta("delete"),
    };
  },
};

function req(payload: unknown, chave?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (chave) headers["Idempotency-Key"] = chave;
  return new NextRequest("http://localhost/api/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  linhas.clear();
  mocks.enviar.mockReset();
  mocks.admin = admin;
  mocks.enviar.mockImplementation(async () => ({ id: `msg-${mocks.enviar.mock.calls.length}` }));
});

describe("idempotência de POST /messages", () => {
  it("mesma chave + mesmo payload devolve a mensagem original com Idempotency-Replayed", async () => {
    const payload = { conversation_id: "c-1", body: "olá" };
    const primeira = await POST(req(payload, "chave-unica"));
    const segunda = await POST(req(payload, "chave-unica"));

    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(200);
    expect(segunda.headers.get("Idempotency-Replayed")).toBe("true");
    expect((await primeira.json()).data).toEqual((await segunda.json()).data);
    expect(mocks.enviar).toHaveBeenCalledTimes(1);
  });

  it("mesma chave com payload diferente é 409 e não envia de novo", async () => {
    await POST(req({ conversation_id: "c-1", body: "olá" }, "chave-unica"));
    const conflito = await POST(req({ conversation_id: "c-1", body: "outro" }, "chave-unica"));

    expect(conflito.status).toBe(409);
    expect((await conflito.json()).error.code).toBe("idempotency_conflict");
    expect(mocks.enviar).toHaveBeenCalledTimes(1);
  });

  it("sem chave, cada chamada envia (comportamento anterior preservado)", async () => {
    const primeira = await POST(req({ conversation_id: "c-1", body: "a" }));
    const segunda = await POST(req({ conversation_id: "c-1", body: "b" }));

    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(primeira.headers.get("Idempotency-Replayed")).toBeNull();
    expect(mocks.enviar).toHaveBeenCalledTimes(2);
  });
});
