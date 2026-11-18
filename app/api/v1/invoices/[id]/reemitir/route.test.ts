/**
 * POST /api/v1/invoices/[id]/reemitir — a recuperação na rota.
 *
 * O teste prende a decisão que a rota tomava errado: nota `em_emissao` com job
 * `processando` travado devolvia 422 (a máquina de estados proibia
 * `em_emissao → em_emissao`) e a única saída era editar o banco. Aqui a nota
 * volta à fila reabrindo O MESMO job por CAS; job fresco continua 409.
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

function minutosAtras(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

function builder(tabela: string, respostas: Record<string, unknown>) {
  let op = "select";
  const q: Record<string, unknown> = {};
  const metodo = (nome: string) => (...args: unknown[]) => {
    void nome;
    void args;
    return q;
  };
  for (const nome of ["eq", "in", "is", "order", "limit", "not"]) q[nome] = metodo(nome);
  q.select = () => q;
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
  const responder = () => {
    const chave = `${tabela}:${op}`;
    return respostas[chave] ?? { data: null, error: null };
  };
  q.single = () => Promise.resolve(responder());
  q.maybeSingle = () => Promise.resolve(responder());
  q.then = (ok: unknown, err: unknown) => Promise.resolve(responder()).then(ok as never, err as never);
  return q;
}

function montar(over: {
  statusDaNota: string;
  job?: { id: string; status: string; updated_at: string } | null;
  casDoJobPerde?: boolean;
  casDaNotaPerde?: boolean;
  insertFalha?: { code: string };
}) {
  chamadas = [];
  const respostaJobUpdate = over.casDoJobPerde
    ? { data: [], error: null }
    : { data: [{ id: JOB_ID }], error: null };
  const cliente = {
    from: (tabela: string) =>
      builder(tabela, {
        "invoices:select": {
          data: { id: NOTA_ID, status: over.statusDaNota },
          error: null,
        },
        "invoices:update": over.casDaNotaPerde
          ? { data: null, error: null }
          : { data: { id: NOTA_ID }, error: null },
        "fiscal_jobs:select": { data: over.job ?? null, error: null },
        "fiscal_jobs:insert": over.insertFalha
          ? { data: null, error: over.insertFalha }
          : { data: null, error: null },
      }),
  };
  const admin = {
    from: (tabela: string) =>
      builder(tabela, {
        "fiscal_jobs:update": respostaJobUpdate,
      }),
  };
  vi.mocked(createClient).mockResolvedValue(cliente as never);
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
}

async function reemitir() {
  const { POST } = await import("./route");
  const req = new NextRequest(`http://localhost/api/v1/invoices/${NOTA_ID}/reemitir`, {
    method: "POST",
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

describe("reemitir", () => {
  it("nota em_emissao com job travado volta à fila reabrindo o MESMO job", async () => {
    montar({
      statusDaNota: "em_emissao",
      job: { id: JOB_ID, status: "processando", updated_at: minutosAtras(60) },
    });

    const res = await reemitir();
    expect(res.status).toBe(201);

    const reabertura = chamadas.find((c) => c.tabela === "fiscal_jobs" && c.op === "update");
    expect(reabertura?.args[0]).toMatchObject({ status: "pendente" });
    expect(chamadas.some((c) => c.tabela === "fiscal_jobs" && c.op === "insert")).toBe(false);

    const nota = chamadas.find((c) => c.tabela === "invoices" && c.op === "update");
    expect(nota?.args[0]).toMatchObject({ status: "em_emissao" });
    expect(audit).toHaveBeenCalled();
  });

  it("job processando fresco devolve 409 e não escreve nada", async () => {
    montar({
      statusDaNota: "em_emissao",
      job: { id: JOB_ID, status: "processando", updated_at: minutosAtras(2) },
    });

    const res = await reemitir();
    expect(res.status).toBe(409);
    expect(chamadas).toHaveLength(0);
  });

  it("CAS perdido na reabertura devolve 409 (outra tentativa mexeu no job)", async () => {
    montar({
      statusDaNota: "em_emissao",
      job: { id: JOB_ID, status: "processando", updated_at: minutosAtras(60) },
      casDoJobPerde: true,
    });

    const res = await reemitir();
    expect(res.status).toBe(409);
    expect(chamadas.some((c) => c.tabela === "invoices" && c.op === "update")).toBe(false);
  });

  it("nota erro sem job enfileira um job novo", async () => {
    montar({ statusDaNota: "erro", job: null });

    const res = await reemitir();
    expect(res.status).toBe(201);
    const job = chamadas.find((c) => c.tabela === "fiscal_jobs" && c.op === "insert");
    expect(job?.args[0]).toMatchObject({ invoice_id: NOTA_ID, status: "pendente" });
  });

  it("job já pendente é idempotente: 200 sem inserir outro", async () => {
    montar({
      statusDaNota: "erro",
      job: { id: JOB_ID, status: "pendente", updated_at: minutosAtras(1) },
    });

    const res = await reemitir();
    expect(res.status).toBe(200);
    expect(chamadas.some((c) => c.tabela === "fiscal_jobs" && c.op === "insert")).toBe(false);
    const corpo = (await res.json()) as { data?: { ja_na_fila?: boolean } };
    expect(corpo.data?.ja_na_fila).toBe(true);
  });

  it("corrida de dois clique no INSERT cai na unique e devolve 201", async () => {
    montar({ statusDaNota: "erro", job: null, insertFalha: { code: "23505" } });

    const res = await reemitir();
    expect(res.status).toBe(201);
  });

  it("CAS do status da nota perdido (cancelou no meio) devolve 409, não reabre", async () => {
    montar({ statusDaNota: "erro", job: null, casDaNotaPerde: true });

    const res = await reemitir();
    expect(res.status).toBe(409);
  });

  it("nota autorizada não volta para emissão", async () => {
    montar({ statusDaNota: "autorizada", job: null });

    const res = await reemitir();
    expect(res.status).toBe(422);
    expect(chamadas).toHaveLength(0);
  });
});
