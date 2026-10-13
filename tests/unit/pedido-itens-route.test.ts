/**
 * PATCH /api/v1/commercial-orders/[id]/itens — a rota dos itens.
 *
 * ─── O QUE MUDOU DESDE A PRIMEIRA VERSÃO DESTE ARQUIVO ────────────────────
 *
 * Este arquivo existia e **a rota não**. `itensPatchSchema` estava escrito em
 * `lib/schemas/pedidos.ts` desde antes, e nenhuma coisa o consumia: o import
 * de `PATCH` aqui falhava. Quem teste sem implementação é um teste que nunca
 * rodou — e ele esteve no repositório, verde por não medir nada.
 *
 * A regra que ele afirmava era: *"só rascunho/em_analise"*. **O dono pediu para
 * corrigir o pedido depois de pronto**, que é exatamente essa regra — e a rota
 * agora não recusa: devolve `avisos` com o que a troca não estorna.
 *
 * A razão de não decidir aqui está em `lib/comercial/patch-itens.ts`: a regra
 * do que fazer com comissão apurada, expedição e NF emitida **não está escrita
 * neste repositório**, e inventá-la seria fabricar política fiscal.
 *
 * Auth e banco dublados — o que se mede é a DECISÃO da rota.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

/**
 * O SERVIÇO é dublado, e por escolha.
 *
 * O que este arquivo mede é a DECISÃO da rota: o que ela recusa (corpo vazio,
 * viewer, item alheio) e o que ela AVISA (pedido comprometido). A aritmética do
 * patch — subtotal, desconto, frete, recálculo — é do serviço, e medir aqui
 * exigiria um banco de verdade para uma coisa que a rota não decide.
 *
 * Sem este dublê, o serviço real roda contra o banco falso e devolve `ok:
 * false`, e os testes de decisão medem a falha do dublê em vez da rota.
 */
const aplicarPatch = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    adicionados: 1,
    removidos: 0,
    ajustados: 0,
    subtotal_cents: 5000,
    total_cents: 5000,
  })),
);
vi.mock("@/lib/comercial/patch-itens", () => ({ aplicarPatchDeItens: aplicarPatch }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const PEDIDO = "33333333-3333-4333-8333-333333333333";

function sessao(papel: Role) {
  const user: AuthUser = {
    id: ANA,
    email: "ana@example.com",
    full_name: "Ana",
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: papel }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: fail("forbidden_role", `Requer role >= ${min}.`, 403, {}) },
  );
}

function req(corpo: unknown) {
  return new NextRequest(`http://x/api/v1/commercial-orders/${PEDIDO}/itens`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

/**
 * Banco dublado: a rota lê o pedido, e o serviço de patch é dublado — o que se
 * mede aqui é a DECISÃO da rota (o que ela recusa e o que ela avisa), não a
 * aritmética do patch, que é testada no serviço.
 */
function bancoComStatus(status: string, exigeNf = false) {
  bancoCom({ status, exige_nf: exigeNf, total_cents: 4000 });
}

/**
 * Banco dublado: a rota lê o pedido, e o serviço de patch é dublado — o que se
 * mede aqui é a DECISÃO da rota (o que ela recusa e o que ela avisa), não a
 * aritmética do patch, que é testada no serviço.
 *
 * A cadeia é Auto-referente de propósito: o filtro do Supabase encadeia
 * `.eq().eq().maybeSingle()`, e um dublê que só aceita um `eq` falha por
 * `not a function` — que é o erro que a primeira versão deste arquivo
 * produziu, e que parece bug da rota quando é typo do dublê.
 */
function bancoCom(linhaOuNulo: Record<string, unknown> | null) {
  const any = { maybeSingle: () => Promise.resolve({ data: linhaOuNulo, error: null }) };
  const select = () => {
    const q: Record<string, unknown> = { ...any };
    for (const metodo of ["eq", "neq", "in", "order", "limit", "is"]) {
      q[metodo] = () => q;
    }
    return q;
  };
  vi.mocked(createAdminClient).mockReturnValue({ from: () => ({ select }) } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao("agent");
  // O padrão do serviço é "deu certo"; cada teste que muda o desfecho usa
  // `mockResolvedValueOnce`, o que devolve o padrão no teste seguinte.
  aplicarPatch.mockReset();
  aplicarPatch.mockResolvedValue({
    ok: true,
    adicionados: 1,
    removidos: 0,
    ajustados: 0,
    subtotal_cents: 5000,
    total_cents: 5000,
  });
});

describe("PATCH /api/v1/commercial-orders/[id]/itens", () => {
  it("recusa corpo vazio com 422 antes de tocar no banco", async () => {
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error("banco não deveria ser chamado");
    });
    const { PATCH } = await import("@/app/api/v1/commercial-orders/[id]/itens/route");
    const res = await PATCH(req({ adicionar: [], remover: [], ajustar: [] }), {
      params: Promise.resolve({ id: PEDIDO }),
    });
    expect(res.status).toBe(422);
  });

  it("recusa corpo que não é objeto com 422", async () => {
    const { PATCH } = await import("@/app/api/v1/commercial-orders/[id]/itens/route");
    const res = await PATCH(req(null), { params: Promise.resolve({ id: PEDIDO }) });
    expect(res.status).toBe(422);
  });

  it("recusa quantidade zero — um item de quantidade zero não é item", async () => {
    const { PATCH } = await import("@/app/api/v1/commercial-orders/[id]/itens/route");
    const res = await PATCH(
      req({ adicionar: [{ quantidade: 0, preco_unit_cents: 100 }] }),
      { params: Promise.resolve({ id: PEDIDO }) },
    );
    expect(res.status).toBe(422);
  });

  it("recusa preço negativo", async () => {
    const { PATCH } = await import("@/app/api/v1/commercial-orders/[id]/itens/route");
    const res = await PATCH(
      req({ adicionar: [{ quantidade: 1, preco_unit_cents: -5 }] }),
      { params: Promise.resolve({ id: PEDIDO }) },
    );
    expect(res.status).toBe(422);
  });

  it("viewer NÃO altera itens de pedido", async () => {
    sessao("viewer");
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error("banco não deveria ser chamado");
    });
    const { PATCH } = await import("@/app/api/v1/commercial-orders/[id]/itens/route");
    const res = await PATCH(req({ adicionar: [{ quantidade: 1, preco_unit_cents: 100 }] }), {
      params: Promise.resolve({ id: PEDIDO }),
    });
    expect(res.status).toBe(403);
  });

  it("id que não é UUID é 400, não 500", async () => {
    // Sem a checagem, o Postgres responde `invalid input syntax for type uuid`
    // e a rota devolve 500 — o que faz um erro de quem chamou parecer falha
    // do servidor.
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error("banco não deveria ser chamado");
    });
    const { PATCH } = await import("@/app/api/v1/commercial-orders/[id]/itens/route");
    const res = await PATCH(req({ adicionar: [{ quantidade: 1, preco_unit_cents: 100 }] }), {
      params: Promise.resolve({ id: "nao-e-um-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("pedido rascunho: altera sem aviso", async () => {
    bancoComStatus("rascunho");
    const { PATCH } = await import("@/app/api/v1/commercial-orders/[id]/itens/route");
    const res = await PATCH(
      req({ adicionar: [{ quantidade: 1, preco_unit_cents: 5000 }] }),
      { params: Promise.resolve({ id: PEDIDO }) },
    );
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data?: { avisos?: string[]; ja?: boolean } };
    expect(corpo.data?.avisos).toEqual([]);
  });

  it("ATENÇÃO: pedido ENTREGUE agora aceita a troca — o que mudou de propósito", async () => {
    // A regra antiga era "só rascunho/em_analise" e reprovava com 422. O dono
    // pediu para corrigir depois de pronto. Este é o teste que trava a mudança:
    // se alguém voltar a recusar, ele cai aqui.
    bancoComStatus("entregue");
    const { PATCH } = await import("@/app/api/v1/commercial-orders/[id]/itens/route");
    const res = await PATCH(
      req({ adicionar: [{ quantidade: 1, preco_unit_cents: 5000 }] }),
      { params: Promise.resolve({ id: PEDIDO }) },
    );
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data?: { avisos?: string[] } };
    // E não aceita em silêncio: avisa o que a troca não estorna.
    expect(corpo.data?.avisos?.join(" ")).toMatch(/não foram estornadas/i);
  });

  it("pedido faturado aceita, e o aviso cita a NF", async () => {
    bancoComStatus("faturado", true);
    const { PATCH } = await import("@/app/api/v1/commercial-orders/[id]/itens/route");
    const res = await PATCH(
      req({ ajustar: [{ id: ANA, quantidade: 3 }] }),
      { params: Promise.resolve({ id: PEDIDO }) },
    );
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data?: { avisos?: string[] } };
    const avisos = corpo.data?.avisos?.join(" ") ?? "";
    expect(avisos).toMatch(/não foram estornadas/i);
    expect(avisos).toMatch(/exige NF/i);
  });

  it("item que não pertence ao pedido é 422, não 200 silencioso", async () => {
    // O serviço devolve `item_desconhecido`. Um 200 aqui faria a tela dizer
    // "1 item removido" tendo removido 0 — o pior tipo de mentira, porque é
    // plausível.
    bancoComStatus("rascunho");
    aplicarPatch.mockResolvedValueOnce({ ok: false, motivo: "item_desconhecido" } as never);
    const { PATCH } = await import("@/app/api/v1/commercial-orders/[id]/itens/route");
    const res = await PATCH(req({ remover: [ANA] }), { params: Promise.resolve({ id: PEDIDO }) });
    expect(res.status).toBe(422);
  });

  it("pedido inexistente é 404", async () => {
    bancoCom(null);
    const { PATCH } = await import("@/app/api/v1/commercial-orders/[id]/itens/route");
    const res = await PATCH(
      req({ adicionar: [{ quantidade: 1, preco_unit_cents: 100 }] }),
      { params: Promise.resolve({ id: PEDIDO }) },
    );
    expect(res.status).toBe(404);
  });
});
