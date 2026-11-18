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
import {
  carregarContextoSped,
  motivoDeNaoTransmitir,
  transmitirCancelamento,
} from "@/lib/fiscal/eventos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/fiscal/eventos", () => ({
  carregarContextoSped: vi.fn(),
  motivoDeNaoTransmitir: vi.fn(() => null),
  transmitirCancelamento: vi.fn(),
}));

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

async function cancelar(corpo: Record<string, unknown> = {}) {
  const { POST } = await import("./route");
  const req = new NextRequest(`http://localhost/api/v1/invoices/${NOTA_ID}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
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
  vi.mocked(carregarContextoSped).mockResolvedValue({ orgId: ORG_ID } as never);
  vi.mocked(motivoDeNaoTransmitir).mockReturnValue(null);
  vi.mocked(transmitirCancelamento).mockResolvedValue({
    ok: true,
    protocolo: "P-1",
    cstat: "135",
    xmotivo: null,
    retentavel: false,
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

/**
 * CANCELAMENTO CONCORRENTE DE NOTA AUTORIZADA (D4).
 *
 * Antes: a rota transmitia o evento 110111 e só depois olhava o estado. Dois
 * cliques simultâneos podiam gerar dois eventos para a mesma chave. Agora um
 * claim em `invoices.cancelamento_em_andamento_em` serializa a transmissão:
 * o segundo recebe 409 (ou replay, se a primeira já terminou).
 */
function montarAutorizada(over: {
  claimGanha: boolean;
  statusDepois?: string;
  transmissao?: { ok: boolean; retentavel?: boolean; xmotivo?: string | null };
}) {
  chamadas = [];
  let leiturasDaNota = 0;
  const cliente = {
    from: (tabela: string) => {
      let op = "select";
      let valores: Record<string, unknown> | undefined;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      for (const nome of ["eq", "in", "order", "limit", "is", "lt", "not"]) q[nome] = () => q;
      q.update = (v: Record<string, unknown>) => {
        op = "update";
        valores = v;
        chamadas.push({ tabela, op, args: [v] });
        return q;
      };
      q.insert = (v: unknown) => {
        op = "insert";
        chamadas.push({ tabela, op, args: [v] });
        return q;
      };
      const responder = () => {
        if (tabela === "invoices" && op === "select") {
          leiturasDaNota += 1;
          const status = leiturasDaNota === 1 ? "autorizada" : (over.statusDepois ?? "autorizada");
          return {
            data: {
              id: NOTA_ID,
              status,
              chave_acesso: "42261135233142000183550010000046411361083248",
              protocolo: "242260552859580",
            },
            error: null,
          };
        }
        if (tabela === "invoices" && op === "update") {
          if (typeof valores?.cancelamento_em_andamento_em === "string") {
            return over.claimGanha ? { data: [{ id: NOTA_ID }], error: null } : { data: [], error: null };
          }
          if (valores?.cancelamento_em_andamento_em === null) return { data: null, error: null };
          if (valores?.status === "cancelada") return { data: { id: NOTA_ID }, error: null };
          return { data: null, error: null };
        }
        return { data: null, error: null };
      };
      q.single = () => Promise.resolve(responder());
      q.maybeSingle = () => Promise.resolve(responder());
      q.then = (ok: unknown, err: unknown) => Promise.resolve(responder()).then(ok as never, err as never);
      return q;
    },
  };
  const admin = {
    from: (tabela: string) => {
      let op = "select";
      const q: Record<string, unknown> = {};
      q.select = () => q;
      for (const nome of ["eq", "in", "order", "limit", "is"]) q[nome] = () => q;
      q.update = () => {
        op = "update";
        return q;
      };
      q.insert = (v: unknown) => {
        op = "insert";
        chamadas.push({ tabela, op, args: [v] });
        return q;
      };
      q.maybeSingle = () => Promise.resolve({ data: null, error: null });
      q.then = (ok: unknown, err: unknown) => Promise.resolve({ data: null, error: null }).then(ok as never, err as never);
      void op;
      return q;
    },
  };
  vi.mocked(createClient).mockResolvedValue(cliente as never);
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
  vi.mocked(transmitirCancelamento).mockResolvedValue(
    (over.transmissao ?? { ok: true }) as never,
  );
}

const MOTIVO = "cliente desistiu da compra";

describe("cancelar nota autorizada — concorrência na SEFAZ", () => {
  it("claim livre transmite uma vez, grava cancelada e libera", async () => {
    montarAutorizada({ claimGanha: true });

    const res = await cancelar({ motivo: MOTIVO });
    expect(res.status).toBe(200);
    expect(transmitirCancelamento).toHaveBeenCalledTimes(1);

    const cancelamento = chamadas.find(
      (c) => c.tabela === "invoices" && c.op === "update" && (c.args[0] as { status?: string }).status === "cancelada",
    );
    expect(cancelamento).toBeTruthy();

    const liberacoes = chamadas.filter(
      (c) =>
        c.tabela === "invoices" &&
        c.op === "update" &&
        (c.args[0] as { cancelamento_em_andamento_em?: unknown }).cancelamento_em_andamento_em === null,
    );
    expect(liberacoes).toHaveLength(1);
  });

  it("claim perdido com nota ainda autorizada: 409 e nenhuma transmissão", async () => {
    montarAutorizada({ claimGanha: false, statusDepois: "autorizada" });

    const res = await cancelar({ motivo: MOTIVO });
    expect(res.status).toBe(409);
    expect(transmitirCancelamento).not.toHaveBeenCalled();
    expect(chamadas.some((c) => c.tabela === "fiscal_events" && c.op === "insert")).toBe(false);
  });

  it("claim perdido porque a primeira já cancelou: 200 replay, sem segundo evento", async () => {
    montarAutorizada({ claimGanha: false, statusDepois: "cancelada" });

    const res = await cancelar({ motivo: MOTIVO });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: { ja_cancelada?: boolean } };
    expect(corpo.data.ja_cancelada).toBe(true);
    expect(transmitirCancelamento).not.toHaveBeenCalled();
    expect(chamadas.some((c) => c.tabela === "fiscal_events" && c.op === "insert")).toBe(false);
  });

  it("falha da SEFAZ libera o claim para o retry (não deixa a nota presa)", async () => {
    montarAutorizada({
      claimGanha: true,
      transmissao: { ok: false, retentavel: true, xmotivo: "timeout" },
    });

    const res = await cancelar({ motivo: MOTIVO });
    expect(res.status).toBe(502);

    const liberacoes = chamadas.filter(
      (c) =>
        c.tabela === "invoices" &&
        c.op === "update" &&
        (c.args[0] as { cancelamento_em_andamento_em?: unknown }).cancelamento_em_andamento_em === null,
    );
    expect(liberacoes).toHaveLength(1);
    expect(
      chamadas.some(
        (c) =>
          c.tabela === "invoices" &&
          c.op === "update" &&
          (c.args[0] as { status?: string }).status === "cancelada",
      ),
    ).toBe(false);
  });
});
