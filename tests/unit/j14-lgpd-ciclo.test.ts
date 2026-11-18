/**
 * J14 — IMPORTAR/EXPORTAR, LGPD E TRILHA DE AUDITORIA.
 *
 * `13-jornadas.md` §J14 é explícito: "LGPD: o ciclo solicitação → aprovação →
 * prévia → anonimização, que é o produto vendido como LGPD nativa, não tem
 * prova de tela". O ciclo tem quatro rotas e nenhum spec de jornada; os dois
 * que citam `/app/lgpd/requests` só provam que a tela abre.
 *
 * Este arquivo prova o ciclo sem navegador, no nível que decide se o pedido do
 * titular anda ou não:
 *
 *   - listagem: filtro por status e faixa de SLA (o que a tela usa), validação;
 *   - aprovação: Idempotency-Key obrigatória, justificativa mínima, 409 em
 *     estado errado, 404, replay idempotente e a transição para `processing`;
 *   - prévia: máscara de e-mail/telefone, CPF NUNCA no payload, 404.
 *
 * A anonimização em si (`/lgpd/anonymize` e o worker) tem prova própria em
 * `tests/unit/lgpd-*`; aqui se mede o que a TELA dispara, não a cascata.
 *
 * Nada aqui toca dado pessoal real: o banco é dublê, e o titular é fixture.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { collectExportData } from "@/lib/lgpd/export-collector";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/lgpd/export-collector", () => ({ collectExportData: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ADMIN = "11111111-1111-4111-8111-111111111111";
const PEDIDO = "44444444-4444-4444-8444-444444444444";

const authzOk = {
  ok: true as const,
  user: { id: ADMIN, email: "dpo@j14.test" },
  org: { orgId: ORG, role: "admin" as const, name: "Org J14" },
};

const ctx = { params: Promise.resolve({ id: PEDIDO }) };

/** Encadeável, com `from(tabela)` e registro do que foi escrito. */
function adminDuble(cfg: {
  chaveExistente?: unknown;
  pedido?: unknown;
  erroUpdate?: unknown;
  erroEmit?: unknown;
}) {
  const chamadas = {
    updates: [] as Array<{ tabela: string; carga: Record<string, unknown> }>,
    inserts: [] as Array<{ tabela: string; carga: Record<string, unknown> }>,
    rpc: [] as Array<{ nome: string; args: Record<string, unknown> }>,
  };

  const admin = {
    from(tabela: string) {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.update = (carga: Record<string, unknown>) => {
        chamadas.updates.push({ tabela, carga });
        return q;
      };
      q.insert = (carga: Record<string, unknown>) => {
        chamadas.inserts.push({ tabela, carga });
        return q;
      };
      q.maybeSingle = () =>
        Promise.resolve({
          data: tabela === "idempotency_keys" ? (cfg.chaveExistente ?? null) : (cfg.pedido ?? null),
          error: null,
        });
      q.single = () => Promise.resolve({ data: { id: "k-1" }, error: null });
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: null,
          error: tabela === "lgpd_requests" ? (cfg.erroUpdate ?? null) : null,
        }).then(resolve);
      return q;
    },
    rpc: (nome: string, args: Record<string, unknown>) => {
      chamadas.rpc.push({ nome, args });
      return Promise.resolve({ data: null, error: cfg.erroEmit ?? null });
    },
  };

  return { admin, chamadas };
}

function pedidoAprovar(corpo: unknown, chave: string | null = "idem-j14-1"): NextRequest {
  return new NextRequest(`http://localhost/api/v1/lgpd/requests/${PEDIDO}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(chave ? { "Idempotency-Key": chave } : {}),
    },
    body: JSON.stringify(corpo),
  });
}

const PEDIDO_RECEBIDO = {
  id: PEDIDO,
  organization_id: ORG,
  request_type: "redact",
  status: "received",
  contact_id: "ct-1",
  external_customer_id: null,
  due_at: "2026-11-20T12:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(authzOk as never);
  vi.mocked(audit).mockClear();
  vi.mocked(createAdminClient).mockReset();
});

describe("POST /lgpd/requests/[id]/approve — o pedido do titular anda", () => {
  it("sem Idempotency-Key é 422 e nada é escrito", async () => {
    const { POST } = await import("@/app/api/v1/lgpd/requests/[id]/approve/route");
    const { admin } = adminDuble({ pedido: PEDIDO_RECEBIDO });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(pedidoAprovar({ approved_reason: "Pedido do titular confirmado" }, null), ctx);
    const json = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(422);
    expect(json.error.code).toBe("missing_idempotency_key");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("justificativa com menos de 10 caracteres é barrada — é a validação da tela, no servidor", async () => {
    const { POST } = await import("@/app/api/v1/lgpd/requests/[id]/approve/route");
    const { admin, chamadas } = adminDuble({ pedido: PEDIDO_RECEBIDO });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(pedidoAprovar({ approved_reason: "curto" }), ctx);
    const json = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(422);
    expect(json.error.code).toBe("validation_failed");
    expect(chamadas.rpc).toHaveLength(0);
  });

  it("solicitação inexistente é 404 — não emite evento para um id que não existe", async () => {
    const { POST } = await import("@/app/api/v1/lgpd/requests/[id]/approve/route");
    const { admin, chamadas } = adminDuble({ pedido: null });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(pedidoAprovar({ approved_reason: "Pedido do titular confirmado" }), ctx);

    expect(res.status).toBe(404);
    expect(chamadas.rpc).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it("solicitação já em processing é 409 — aprovar de novo não reenfileira", async () => {
    const { POST } = await import("@/app/api/v1/lgpd/requests/[id]/approve/route");
    const { admin, chamadas } = adminDuble({
      pedido: { ...PEDIDO_RECEBIDO, status: "processing" },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(pedidoAprovar({ approved_reason: "Pedido do titular confirmado" }), ctx);
    const json = (await res.json()) as { error: { code: string; message: string } };

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("conflict");
    expect(json.error.message).toContain("processing");
    expect(chamadas.rpc).toHaveLength(0);
  });

  it("aprovação feliz emite o evento, muda para processing e audita", async () => {
    const { POST } = await import("@/app/api/v1/lgpd/requests/[id]/approve/route");
    const { admin, chamadas } = adminDuble({ pedido: PEDIDO_RECEBIDO });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(pedidoAprovar({ approved_reason: "Pedido do titular confirmado" }), ctx);
    const json = (await res.json()) as { data: { request_id: string; status: string } };

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ request_id: PEDIDO, status: "processing" });
    expect(chamadas.rpc[0]).toMatchObject({
      nome: "emit_event",
      args: expect.objectContaining({ p_event_type: "lgpd.redact_received", p_entity_id: PEDIDO }),
    });
    expect(chamadas.updates).toContainEqual({
      tabela: "lgpd_requests",
      carga: expect.objectContaining({ status: "processing" }),
    });
    expect(chamadas.inserts[0]).toMatchObject({
      tabela: "idempotency_keys",
      carga: expect.objectContaining({ key: "idem-j14-1", status_code: 202 }),
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "lgpd.manually_approved", resourceId: PEDIDO }),
    );
  });

  it("replay da MESMA chave devolve a resposta guardada e não emite de novo", async () => {
    const { POST } = await import("@/app/api/v1/lgpd/requests/[id]/approve/route");
    const { admin, chamadas } = adminDuble({
      chaveExistente: {
        id: "k-1",
        response_body: { request_id: PEDIDO, status: "processing" },
        status_code: 202,
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(pedidoAprovar({ approved_reason: "Pedido do titular confirmado" }), ctx);
    const json = (await res.json()) as { data: { status: string } };

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("processing");
    // Este é o ponto: retry de rede não pode virar DOIS eventos de LGPD.
    expect(chamadas.rpc).toHaveLength(0);
    expect(chamadas.updates).toHaveLength(0);
  });

  it("erro ao transicionar o status é 500 — não audita uma aprovação que não gravou", async () => {
    const { POST } = await import("@/app/api/v1/lgpd/requests/[id]/approve/route");
    const { admin } = adminDuble({
      pedido: PEDIDO_RECEBIDO,
      erroUpdate: { message: "connection reset" },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(pedidoAprovar({ approved_reason: "Pedido do titular confirmado" }), ctx);

    expect(res.status).toBe(500);
    expect(audit).not.toHaveBeenCalled();
  });

  it("permissão negada devolve a resposta do guard", async () => {
    const { fail } = await import("@/lib/api/wrappers");
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden", "Apenas admin aprova.", 403),
    } as never);
    const { POST } = await import("@/app/api/v1/lgpd/requests/[id]/approve/route");

    const res = await POST(pedidoAprovar({ approved_reason: "Pedido do titular confirmado" }), ctx);

    expect(res.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe("GET /lgpd/requests — a lista que a tela de LGPD abre", () => {
  function listaDuble(linhas: unknown[], erro: unknown = null, total = 0) {
    const q: Record<string, unknown> = {};
    q.from = () => q;
    q.select = () => q;
    q.eq = () => q;
    q.order = () => q;
    q.range = () => Promise.resolve({ data: erro ? null : linhas, error: erro, count: total });
    // O count da rota é aguardado direto (head: true), sem `range`.
    q.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: erro, count: total }).then(resolve);
    return q;
  }

  it("status inválido é 422 — filtro de tela errado não vira lista completa em silêncio", async () => {
    const { GET } = await import("@/app/api/v1/lgpd/requests/route");
    vi.mocked(createClient).mockResolvedValue({ from: () => listaDuble([]) } as never);

    const res = await GET(new NextRequest("http://localhost/api/v1/lgpd/requests?status=inventado"));

    expect(res.status).toBe(422);
  });

  it("lista vazia é sucesso com total 0 — não é erro nem 404", async () => {
    const { GET } = await import("@/app/api/v1/lgpd/requests/route");
    vi.mocked(createClient).mockResolvedValue({ from: () => listaDuble([]) } as never);

    const res = await GET(new NextRequest("http://localhost/api/v1/lgpd/requests"));
    const json = (await res.json()) as { data: unknown[]; meta: { total: number } };

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(json.meta.total).toBe(0);
  });

  it("linha vencida ganha sla_bucket 'overdue' — a tela consegue destacar o atraso", async () => {
    const { GET } = await import("@/app/api/v1/lgpd/requests/route");
    const vencida = {
      id: PEDIDO,
      request_type: "redact",
      status: "received",
      received_at: "2026-11-01T00:00:00.000Z",
      due_at: "2026-11-02T00:00:00.000Z",
      attempts: 0,
      scope: {},
      error_message: null,
      completed_at: null,
      emergency: false,
      source: "manual",
      contact_id: null,
      external_customer_id: null,
      organization_id: ORG,
    };
    vi.mocked(createClient).mockResolvedValue({ from: () => listaDuble([vencida], null, 1) } as never);

    const res = await GET(new NextRequest("http://localhost/api/v1/lgpd/requests?sla_bucket=overdue"));
    const json = (await res.json()) as { data: Array<{ sla_bucket: string }> };

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]!.sla_bucket).toBe("overdue");
  });

  it("erro do banco é 500 — a tela não mostra 'nenhuma solicitação' quando a consulta falhou", async () => {
    const { GET } = await import("@/app/api/v1/lgpd/requests/route");
    vi.mocked(createClient).mockResolvedValue({
      from: () => listaDuble([], { message: "permission denied for table lgpd_requests" }),
    } as never);

    const res = await GET(new NextRequest("http://localhost/api/v1/lgpd/requests"));

    expect(res.status).toBe(500);
  });

  it("é rota de admin (o DPO), não de qualquer atendente", async () => {
    const { GET } = await import("@/app/api/v1/lgpd/requests/route");
    vi.mocked(createClient).mockResolvedValue({ from: () => listaDuble([]) } as never);

    await GET(new NextRequest("http://localhost/api/v1/lgpd/requests"));

    expect(requireRole).toHaveBeenCalledWith(
      "admin",
      expect.objectContaining({ resource: "lgpd_requests", allowPlatformAdmin: true }),
    );
  });
});

describe("GET /lgpd/requests/[id]/preview — a prévia não vaza PII", () => {
  it("mascara e-mail e telefone e NUNCA devolve CPF", async () => {
    vi.mocked(collectExportData).mockResolvedValue({
      contact: {
        id: "ct-1",
        name: "Fulana de Tal",
        display_name: "Fulana",
        email: "fulana@exemplo.com",
        phone_number: "5511987654321",
        cpf_present: true,
        birthdate: "1990-01-01",
        is_blocked: false,
        is_anonymized: false,
        tags: [],
        source: "whatsapp",
        created_at: "2026-01-01T00:00:00.000Z",
        last_activity_at: null,
      },
      conversations: [],
      messages_count_total: 0,
      messages_recent: [],
      leads: [],
      orders: [],
      activities: [],
      audit_log_extract: [],
      consents: [],
    } as never);
    const { admin } = adminDuble({
      pedido: { id: PEDIDO, contact_id: "ct-1", external_customer_id: null, request_type: "data_request" },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const { GET } = await import("@/app/api/v1/lgpd/requests/[id]/preview/route");

    const res = await GET(new NextRequest(`http://localhost/api/v1/lgpd/requests/${PEDIDO}/preview`), ctx);
    const json = (await res.json()) as {
      data: { contact: { email: string; phone_number: string; cpf_present: boolean } };
    };

    expect(res.status).toBe(200);
    expect(json.data.contact.email).toBe("f***@exemplo.com");
    expect(json.data.contact.phone_number).toBe("(**) ****-4321");
    // O CPF existe (o DPO precisa saber que há dado a anonimizar) e o VALOR
    // não sai — nem mascarado, nem como campo. Este é o contrato escrito na rota.
    expect(json.data.contact.cpf_present).toBe(true);
    expect(json.data.contact).not.toHaveProperty("cpf");
  });

  it("pedido inexistente é 404 e nem coleta dados", async () => {
    const { admin } = adminDuble({ pedido: null });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(collectExportData).mockClear();
    const { GET } = await import("@/app/api/v1/lgpd/requests/[id]/preview/route");

    const res = await GET(new NextRequest(`http://localhost/api/v1/lgpd/requests/${PEDIDO}/preview`), ctx);

    expect(res.status).toBe(404);
    expect(collectExportData).not.toHaveBeenCalled();
  });
});
