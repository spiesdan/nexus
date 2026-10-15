/**
 * Regressão do redact de tenant (LGPD): offset sobre conjunto mutável.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══════════════════════════════════════════
 *
 * O loop lia `contacts` com `is_anonymized = false` + `range(offset, +99)` e
 * anonimizava in-place. Linha anonimizada SAI do conjunto filtrado, então o
 * `offset` crescente pulava ~100 contatos por lote: com 250 contatos, só ~100
 * eram redigidos e o pedido terminava `completed` — redact INCOMPLETO com
 * carimbo de completo (risco legal). O teste abaixo falha no código antigo
 * (offset) e passa no novo (releitura do início + exclusão de falhas).
 *
 * Segunda trava: `organizations.status` só vira `redacted` com zero falhas.
 * Com pendências o pedido termina `pending_review` e a org não pode dizer
 * "redacted" com dado por anonimizar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { cascadeRedactContact } from "@/lib/lgpd/redact-cascade";
import { findLgpdRequest } from "@/lib/lgpd/repository";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/lgpd/repository", () => ({ findLgpdRequest: vi.fn() }));
vi.mock("@/lib/lgpd/redact-cascade", () => ({ cascadeRedactContact: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const ORG = "org-teste-redact";
const REQUEST = "req-teste-redact";

// Banco de mentira: contatos com flag de anonimizado.
let loja: Array<{ id: string; anon: boolean }>;
let pedido: Record<string, unknown>;
let orgStatus: string | null;
const QUEBRA_EM: Set<string> = new Set();

function contato(i: number) {
  return { id: `contato-${String(i).padStart(4, "0")}`, anon: false };
}

function adminFalso() {
  const cadeiaContatos = () => {
    const filtros: Array<(c: { id: string; anon: boolean }) => boolean> = [];
    const api: Record<string, unknown> = {};
    api.eq = (col: string, val: unknown) => {
      if (col === "is_anonymized") filtros.push((c) => c.anon === val);
      return api;
    };
    api.not = (col: string, op: string, val: string) => {
      if (col === "id" && op === "in") {
        const ids = new Set(val.replace(/[()]/g, "").split(","));
        filtros.push((c) => !ids.has(c.id));
      }
      return api;
    };
    api.order = () => api;
    api.range = (de: number, ate: number) => {
      const linhas = loja
        .filter((c) => filtros.every((f) => f(c)))
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .slice(de, ate + 1)
        .map((c) => ({ id: c.id }));
      return Promise.resolve({ data: linhas, error: null });
    };
    return api;
  };
  return {
    from: (tabela: string) => {
      if (tabela === "contacts") return { select: () => cadeiaContatos() };
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
        update: (patch: Record<string, unknown>) => {
          const aplicar = () => {
            if (tabela === "lgpd_requests") pedido = { ...pedido, ...patch };
            if (tabela === "organizations" && typeof patch["status"] === "string") {
              orgStatus = patch["status"] as string;
            }
          };
          const cadeia: Record<string, unknown> = {};
          // `.eq().eq()` (duplo) ou `.eq()` (simples, ex. organizations por id):
          // ambos terminam aplicando.
          cadeia.eq = () => {
            aplicar();
            return { eq: () => Promise.resolve({ error: null }) };
          };
          return cadeia;
        },
      };
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  QUEBRA_EM.clear();
  loja = [];
  orgStatus = "active";
  pedido = {
    status: "pending",
    attempts: 0,
    request_type: "store_redact",
    scope: "tenant",
    request_payload: {},
  };
  vi.mocked(createAdminClient).mockReturnValue(adminFalso() as never);
  vi.mocked(findLgpdRequest).mockImplementation(async () => ({ ...pedido }) as never);
  vi.mocked(cascadeRedactContact).mockImplementation(async (args: {
    contactId: string;
  }) => {
    const alvo = loja.find((c) => c.id === args.contactId);
    if (!alvo) return { alreadyAnonymized: true, counts: {} } as never;
    if (QUEBRA_EM.has(alvo.id)) throw new Error("cascade quebrou");
    if (alvo.anon) return { alreadyAnonymized: true, counts: {} } as never;
    alvo.anon = true;
    return {
      alreadyAnonymized: false,
      counts: { contacts: 1, conversations: 0, messages: 0 },
    } as never;
  });
  vi.mocked(audit).mockResolvedValue(undefined as never);
});

function evento() {
  return {
    id: "evt-1",
    organization_id: ORG,
    event_type: "lgpd.redact_received",
    entity_kind: "lgpd_request",
    entity_id: REQUEST,
    payload: { request_id: REQUEST, scope: "tenant", emergency: true },
    metadata: {},
    consumed_by: [],
    attempts: 0,
  };
}

describe("redact de tenant", () => {
  it("250 contatos em lotes de 100: nenhum é pulado", async () => {
    loja = Array.from({ length: 250 }, (_, i) => contato(i));
    const { processLgpdRedact } = await import("@/workers/lgpd-redact-worker");
    const r = await processLgpdRedact(evento() as never);

    expect(r.status).toBe("ok");
    expect(loja.filter((c) => !c.anon)).toEqual([]);
    expect(pedido["status"]).toBe("completed");
    expect(orgStatus).toBe("redacted");
  });

  it("falha persistente: termina pending_review e a org NÃO vira redacted", async () => {
    loja = Array.from({ length: 30 }, (_, i) => contato(i));
    QUEBRA_EM.add("contato-0007");
    const { processLgpdRedact } = await import("@/workers/lgpd-redact-worker");
    const r = await processLgpdRedact(evento() as never);

    expect(r.status).toBe("error");
    expect(pedido["status"]).toBe("pending_review");
    expect(orgStatus).toBe("active");
    // Os outros 29 passaram — a falha de um não trava o resto.
    expect(loja.filter((c) => !c.anon).map((c) => c.id)).toEqual(["contato-0007"]);
  });
});
