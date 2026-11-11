/**
 * POST /api/v1/prospecting/campaigns/regiao
 *
 * O que este teste prende é o que a rota GRAVA e o que ela RECUSA:
 *   - a audiência é recalculada no servidor a partir das CIDADES; o corpo não
 *     pode trazer `contato_ids` (aceitar a lista da tela deixaria mandar para
 *     quem não foi atendido na região);
 *   - o número escolhido é validado ANTES do insert — campanha não nasce ativa
 *     para pausar no primeiro tick "sem canal";
 *   - contato sem telefone ou já reservado por outra campanha fica de fora da
 *     lista, e lista vazia é 422, não campanha fantasma;
 *   - a campanha nasce `publico: contatos`, `mensagem_tipo: texto`, um minuto
 *     entre mensagens e ATIVA.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { listarClientesPorRegiao } from "@/lib/comercial/clientes-por-regiao";
import { validarNumeroDaCampanha } from "@/lib/prospeccao/numero-da-campanha";
import { idsReservadosPorOutras } from "@/lib/prospeccao/reserva-de-campanha";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/comercial/clientes-por-regiao", () => ({
  listarClientesPorRegiao: vi.fn(),
}));
vi.mock("@/lib/prospeccao/numero-da-campanha", () => ({
  validarNumeroDaCampanha: vi.fn(),
  mensagemDoNumeroInvalido: (motivo: string) => `recusa:${motivo}`,
}));
vi.mock("@/lib/prospeccao/reserva-de-campanha", () => ({
  idsReservadosPorOutras: vi.fn(),
}));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";

let inserido: Record<string, unknown> | null = null;
let erroDoBanco: { message: string; code?: string } | null = null;

function fakeClient() {
  function builder() {
    let payload: Record<string, unknown> | null = null;
    const q: Record<string, unknown> = {};
    const volta = () => q;
    q.insert = vi.fn((novo: Record<string, unknown>) => {
      payload = novo;
      inserido = novo;
      return q;
    });
    q.select = vi.fn(volta);
    q.single = vi.fn(() =>
      Promise.resolve(
        erroDoBanco
          ? { data: null, error: erroDoBanco }
          : { data: { id: "camp-1", ...(payload ?? {}) }, error: null },
      ),
    );
    return q;
  }
  return { from: vi.fn(() => builder()) };
}

function corpo(valor: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/prospecting/campaigns/regiao", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(valor),
  });
}

const VALIDO = {
  nome: "Clientes de Canoinhas",
  cidades: [{ cidade: "Canoinhas", estado: "SC" }],
  session_id: SESSION_ID,
  mensagens: ["Olá! Temos uma condição especial para você."],
  janelas: [{ inicio: "07:00", fim: "12:00", dias: [1, 2, 3, 4, 5] }],
  data_inicio: "2026-11-12",
  data_fim: "2026-11-16",
  limite_diario: 40,
};

const cliente = (id: string, telefone: string | null = "+5549999998888") => ({
  contact_id: id,
  nome: id,
  telefone,
  telefone_e164: telefone,
  cidade: "Canoinhas",
  uf: "SC",
  pedidos: 1,
  total_cents: 10_000,
  ultimo_pedido_em: "2026-10-01T12:00:00.000Z",
});

beforeEach(() => {
  inserido = null;
  erroDoBanco = null;
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    org: { orgId: ORG_ID },
    user: { id: "user-1" },
  } as never);
  vi.mocked(createClient).mockResolvedValue(fakeClient() as never);
  vi.mocked(validarNumeroDaCampanha).mockReset();
  vi.mocked(validarNumeroDaCampanha).mockResolvedValue({
    ok: true,
    numero: { id: SESSION_ID, rotulo: "Comercial", telefone: "+5549999990000" },
  } as never);
  vi.mocked(idsReservadosPorOutras).mockReset();
  vi.mocked(idsReservadosPorOutras).mockResolvedValue(new Set<string>() as never);
  vi.mocked(listarClientesPorRegiao).mockReset();
  vi.mocked(listarClientesPorRegiao).mockResolvedValue({
    lista: [cliente("c-1"), cliente("c-2")],
    pedidos_lidos: 3,
    completa: true,
  } as never);
});

describe("POST /api/v1/prospecting/campaigns/regiao", () => {
  it("recusa sem permissão, antes de tocar o banco", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);
    const { POST } = await import("./route");
    const resposta = await POST(corpo(VALIDO));
    expect(resposta.status).toBe(403);
    expect(inserido).toBeNull();
  });

  it("sem cidade é 422 — campanha por região não tem 'todas'", async () => {
    const { POST } = await import("./route");
    const resposta = await POST(corpo({ ...VALIDO, cidades: [] }));
    expect(resposta.status).toBe(422);
    expect(inserido).toBeNull();
  });

  it("sem número escolhido é 422 — a escolha é do operador, não da máquina", async () => {
    const { POST } = await import("./route");
    const resposta = await POST(corpo({ ...VALIDO, session_id: undefined }));
    expect(resposta.status).toBe(422);
    expect(inserido).toBeNull();
  });

  it("número oficial/sem conexão é 422 com o motivo, e nada é gravado", async () => {
    vi.mocked(validarNumeroDaCampanha).mockResolvedValue({
      ok: false,
      motivo: "capability",
    } as never);
    const { POST } = await import("./route");
    const resposta = await POST(corpo(VALIDO));
    expect(resposta.status).toBe(422);
    expect((await resposta.json()).error.details.codigo).toBe("capability");
    expect(inserido).toBeNull();
  });

  it("público vazio é 422 — não cria campanha para ninguém", async () => {
    vi.mocked(listarClientesPorRegiao).mockResolvedValue({
      lista: [cliente("c-1", null)],
      pedidos_lidos: 1,
      completa: true,
    } as never);
    const { POST } = await import("./route");
    const resposta = await POST(corpo(VALIDO));
    expect(resposta.status).toBe(422);
    expect((await resposta.json()).error.details.sem_telefone).toBe(1);
    expect(inserido).toBeNull();
  });

  it("grava audiência de CONTATOS, número escolhido, texto e um minuto", async () => {
    const { POST } = await import("./route");
    const resposta = await POST(corpo(VALIDO));
    expect(resposta.status).toBe(201);

    expect(inserido).toMatchObject({
      organization_id: ORG_ID,
      nome: VALIDO.nome,
      publico: "contatos",
      contato_ids: ["c-1", "c-2"],
      session_id: SESSION_ID,
      mensagem_tipo: "texto",
      mensagens: VALIDO.mensagens,
      // O recorte de garimpagem não existe aqui: a cidade mora no cadastro.
      categorias: [],
      cidades: [{ cidade: "Canoinhas", estado: "SC" }],
      espaco_ms: 60_000,
      limite_diario: 40,
      data_inicio: "2026-11-12",
      data_fim: "2026-11-16",
      status: "ativa",
      created_by: "user-1",
    });
    expect(typeof inserido?.agendada_em).toBe("string");
    // Nunca cai no default `prospects` do banco.
    expect(inserido?.prospect_ids).toBeUndefined();
    // E a lista NÃO veio do corpo: o servidor recalculou.
    expect(
      vi.mocked(listarClientesPorRegiao).mock.calls[0]?.[1],
    ).toMatchObject({ organizationId: ORG_ID, cidades: VALIDO.cidades });
  });

  it("contato já reservado por outra campanha sai da lista, não derruba o POST", async () => {
    vi.mocked(idsReservadosPorOutras).mockResolvedValue(new Set(["c-2"]) as never);
    const { POST } = await import("./route");
    const resposta = await POST(corpo(VALIDO));
    expect(resposta.status).toBe(201);
    expect(inserido?.contato_ids).toEqual(["c-1"]);
  });

  it("corrida com outra campanha (23505) vira 409, não 500", async () => {
    erroDoBanco = { message: "duplicate key", code: "23505" };
    const { POST } = await import("./route");
    const resposta = await POST(corpo(VALIDO));
    expect(resposta.status).toBe(409);
  });
});
