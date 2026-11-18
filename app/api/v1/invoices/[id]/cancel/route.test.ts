/**
 * POST /api/v1/invoices/[id]/cancel — a corrida com o drain.
 *
 * O defeito medido em 18/11/2026: o drain reivindica o job
 * (`pendente → processando`) antes da SEFAZ e grava o resultado na nota no
 * fim. Cancelar no meio marcava `cancelada`, e o drain sobrescrevia com
 * `autorizada` (ou o inverso): a nota existe no fisco e o app diz que foi
 * cancelada. O comentário da rota dizia que o claim condicional protegia —
 * valia para dois drains, não para cancel × drain.
 *
 * A rota agora recusa job `processando` (transmissão viva) e encerra o
 * `pendente` por CAS. Os testes abaixo fixam isso sem transmitir nada.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const NOTA_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "33333333-3333-4333-8333-333333333333";

type Chamada = { tabela: string; op: string; args: unknown[] };

let chamadas: Chamada[] = [];

function builder(tabela: string, respostas: Record<string, unknown>) {
  let op = "select";
  const q: Record<string, unknown> = {};
  q.select = () => q;
  for (const nome of ["eq", "in", "order", "limit", "is", "not"]) q[nome] = () => q;
  q.update = (valor: unknown) => {
    op = "update";
    chamadas.push({ tabela, op, args: [valor] });
    return q;
  };
  q.insert = (valor: unknown) => {
    op = "insert";
    chamadas.push({ tabela, op, args: [valor] });
    return q;
  };
  const responder = () => respostas[`${tabela}:${op}`] ?? { data: null, error: null };
  q.single = () => Promise.resolve(responder());
  q.maybeSingle = () => Promise.resolve(responder());
  q.then = (ok: unknown, err: unknown) => Promise.resolve(responder()).then(ok as never, err as never);
  return q;
}

function montar(over: {
  statusDaNota?: string;
  job?: { id: string; status: string } | null;
  encerramentoDoJob?: { data?: unknown };
  updateDaNota?: { data?: unknown; error?: unknown };
}) {
  chamadas = [];
  const cliente = {
    from: (tabela: string) =>
      builder(tabela, {
        "invoices:select": {
          data: {
            id: NOTA_ID,
            status: over.statusDaNota ?? "pendente",
            chave_acesso: null,
            protocolo: null,
          },
          error: null,
        },
        "invoices:update": over.updateDaNota ?? { data: { id: NOTA_ID }, error: null },
      }),
  };
  const admin = {
    from: (tabela: string) =>
      builder(tabela, {
        "fiscal_jobs:select": { data: over.job ?? null, error: null },
        "fiscal_jobs:update": over.encerramentoDoJob ?? { data: [{ id: JOB_ID }], error: null },
        "fiscal_events:insert": { data: null, error: null },
      }),
  };
  vi.mocked(createClient).mockResolvedValue(cliente as never);
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
}

async function cancelar() {
  const { POST } = await import("./route");
  const req = new NextRequest(`http://localhost/api/v1/invoices/${NOTA_ID}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return POST(req, { params: Promise.resolve({ id: NOTA_ID }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    org: { orgId: ORG_ID },
    user: { id: "user-1" },
  } as never);
});

describe("cancelar nota — corrida com o drain", () => {
  it("job processando (transmissão viva) devolve 409 e não escreve na nota", async () => {
    montar({ job: { id: JOB_ID, status: "processando" } });

    const res = await cancelar();
    expect(res.status).toBe(409);
    expect(chamadas.filter((c) => c.tabela === "invoices" && c.op === "update")).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it("job pendente é encerrado por CAS antes do cancelamento", async () => {
    montar({ job: { id: JOB_ID, status: "pendente" } });

    const res = await cancelar();
    expect(res.status).toBe(200);

    const encerramento = chamadas.find((c) => c.tabela === "fiscal_jobs" && c.op === "update");
    expect(encerramento?.args[0]).toMatchObject({ status: "concluido" });
    const nota = chamadas.find((c) => c.tabela === "invoices" && c.op === "update");
    expect(nota?.args[0]).toMatchObject({ status: "cancelada" });
  });

  it("CAS do job perdido (drain reivindicou no meio) devolve 409 sem cancelar", async () => {
    montar({
      job: { id: JOB_ID, status: "pendente" },
      encerramentoDoJob: { data: [] },
    });

    const res = await cancelar();
    expect(res.status).toBe(409);
    expect(chamadas.filter((c) => c.tabela === "invoices" && c.op === "update")).toHaveLength(0);
  });

  it("CAS do status da nota perdido também devolve 409, não sobrescreve", async () => {
    montar({
      job: null,
      updateDaNota: { data: null, error: null },
    });

    const res = await cancelar();
    expect(res.status).toBe(409);
  });
});
