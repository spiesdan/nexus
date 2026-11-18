/**
 * J14 — A ANONIMIZAÇÃO DO TITULAR (a última perna do ciclo LGPD).
 *
 * `13-jornadas.md` §J14 diz que o ciclo "solicitação → aprovação → prévia →
 * anonimização" não tem prova. As três primeiras pernas estão em
 * `j14-lgpd-ciclo.test.ts`; esta é a quarta — e é a que NÃO tem volta.
 *
 * O que se prova aqui, na rota que executa o direito:
 *
 *   1. a cascata grava o que a LGPD exige: PII nula, `is_anonymized`, nome
 *      reescrito, lead marcado, atividade redigida, evento emitido e auditoria;
 *   2. re-anonimizar é 200 `already_anonymized` e NÃO escreve de novo (idempotência
 *      é o que impede um segundo evento e um segundo rastro);
 *   3. contato inexistente é 404 sem escrita e sem auditoria;
 *   4. quem não é admin da organização do contato recebe a resposta do guard e
 *      NADA é escrito;
 *   5. payload inválido é 422 (validação antes da cascata);
 *   6. falha no UPDATE principal é 500 e não vira "anonimizado" em silêncio.
 *
 * Dado pessoal: tudo é dublê e fixture — nenhum contato real é tocado.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ADMIN = "11111111-1111-4111-8111-111111111111";
const CONTATO = "55555555-5555-4555-8555-555555555555";

const authzOk = {
  ok: true as const,
  user: { id: ADMIN, email: "dpo@j14.test" },
  org: { orgId: ORG, role: "admin" as const, name: "Org J14" },
};

interface Escrita {
  tabela: string;
  carga: Record<string, unknown>;
  eq: Array<[string, unknown]>;
}

function duble(cfg: {
  contato?: Record<string, unknown> | null;
  erroSelecao?: { message: string } | null;
  erroUpdateContato?: { message: string } | null;
  leads?: { id: string; title: string | null }[];
}) {
  const escritas: Escrita[] = [];
  const rpc: Array<{ nome: string; args: Record<string, unknown> }> = [];

  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: ADMIN } }, error: null }),
    },
    from(tabela: string) {
      const q: Record<string, unknown> = {};
      const estado: Escrita = { tabela, carga: {}, eq: [] };
      q.select = () => q;
      q.eq = (coluna: string, valor: unknown) => {
        estado.eq.push([coluna, valor]);
        return q;
      };
      q.update = (carga: Record<string, unknown>) => {
        estado.carga = carga;
        escritas.push(estado);
        return q;
      };
      q.maybeSingle = async () => ({
        data:
          tabela === "contacts" ? (cfg.contato === undefined ? null : cfg.contato) : null,
        error: cfg.erroSelecao ?? null,
      });
      // `crm_leads` é lido por select (then) e atualizado por update (then).
      q.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) => {
        if (tabela === "crm_leads") {
          return Promise.resolve({ data: cfg.leads ?? [], error: null }).then(resolve);
        }
        if (tabela === "contacts") {
          return Promise.resolve({ data: null, error: cfg.erroUpdateContato ?? null }).then(resolve);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve);
      };
      return q;
    },
    rpc: async (nome: string, args: Record<string, unknown>) => {
      rpc.push({ nome, args });
      return { data: null, error: null };
    },
  };

  return { client, escritas, rpc };
}

function pedido(corpo: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/lgpd/anonymize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

const CONTATO_VIVO = {
  id: CONTATO,
  organization_id: ORG,
  is_anonymized: false,
  anonymized_at: null,
};

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(authzOk as never);
  vi.mocked(audit).mockClear();
  vi.mocked(createClient).mockReset();
});

describe("POST /lgpd/anonymize — o direito do titular é executado", () => {
  it("cascata: PII nula, contato marcado, lead anonimizado, evento e auditoria", async () => {
    const { client, escritas, rpc } = duble({
      contato: CONTATO_VIVO,
      leads: [{ id: "lead-1", title: "Maria Silva" }],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("@/app/api/v1/lgpd/anonymize/route");
    const res = await POST(pedido({ contact_id: CONTATO, justification: "Pedido LGPD do titular" }));
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: { contact_id: string; anonymized_at: string } };
    expect(corpo.data.contact_id).toBe(CONTATO);
    expect(corpo.data.anonymized_at).toMatch(/^\d{4}-/);

    const contato = escritas.find((e) => e.tabela === "contacts");
    expect(contato?.carga).toMatchObject({
      name: null,
      email: null,
      phone_number: null,
      cpf_encrypted: null,
      cpf_hash: null,
      is_anonymized: true,
    });
    // O nome visível é reescrito e NÃO carrega o nome original.
    expect(String(contato?.carga.display_name)).toMatch(/^Contato Anonimizado #[0-9a-f]{8}$/);
    expect(contato?.eq).toEqual([["id", CONTATO]]);

    const lead = escritas.find((e) => e.tabela === "crm_leads");
    expect(lead?.carga.title).toBe("Maria Silva (anonimizado)");
    expect(lead?.eq).toEqual([["id", "lead-1"]]);

    const atividade = escritas.find((e) => e.tabela === "crm_lead_activities");
    expect(atividade?.carga).toEqual({ payload: { redacted: true } });

    expect(rpc.map((r) => r.nome)).toContain("emit_event");
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "lgpd.anonymize_executed",
        organizationId: ORG,
        resourceId: CONTATO,
        actorUserId: ADMIN,
      }),
    );
  });

  it("re-anonimizar é 200 already_anonymized e não escreve nem audita de novo", async () => {
    const { client, escritas } = duble({
      contato: {
        ...CONTATO_VIVO,
        is_anonymized: true,
        anonymized_at: "2026-11-01T10:00:00.000Z",
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("@/app/api/v1/lgpd/anonymize/route");
    const res = await POST(pedido({ contact_id: CONTATO, justification: "Repetição do pedido" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ action: "already_anonymized" });
    expect(escritas).toEqual([]);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("contato inexistente é 404 — sem escrita e sem auditoria", async () => {
    const { client, escritas } = duble({ contato: null });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("@/app/api/v1/lgpd/anonymize/route");
    const res = await POST(
      pedido({ contact_id: "99999999-9999-4999-8999-999999999999", justification: "x".repeat(12) }),
    );
    expect(res.status).toBe(404);
    expect(escritas).toEqual([]);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("sem papel admin na organização do contato, devolve o guard e não escreve", async () => {
    const { client, escritas } = duble({ contato: CONTATO_VIVO });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: { code: "forbidden_role" } }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    } as never);

    const { POST } = await import("@/app/api/v1/lgpd/anonymize/route");
    const res = await POST(pedido({ contact_id: CONTATO, justification: "Pedido do titular" }));
    expect(res.status).toBe(403);
    expect(escritas).toEqual([]);
    // A checagem é na organização DO CONTATO, não na ativa do cookie.
    expect(vi.mocked(requireRole)).toHaveBeenCalledWith(
      "admin",
      expect.objectContaining({ organizationId: ORG, allowPlatformAdmin: true }),
    );
  });

  it("payload inválido é 422 antes de qualquer leitura/escrita", async () => {
    const { client, escritas } = duble({ contato: CONTATO_VIVO });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("@/app/api/v1/lgpd/anonymize/route");
    const res = await POST(pedido({ contact_id: "nao-e-uuid", justification: "curta" }));
    expect(res.status).toBe(422);
    expect(escritas).toEqual([]);
  });

  it("falha no UPDATE principal é 500 e não finge anonimização", async () => {
    const { client } = duble({
      contato: CONTATO_VIVO,
      erroUpdateContato: { message: "lock timeout" },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("@/app/api/v1/lgpd/anonymize/route");
    const res = await POST(pedido({ contact_id: CONTATO, justification: "Pedido do titular" }));
    expect(res.status).toBe(500);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });
});
