/**
 * A FILA do aviso de rota — a regra que o dono pediu em 2026-11-09.
 *
 * Quando o número de expedição não está `WORKING`, o aviso NÃO sai pelo
 * comercial: o fato fica em `shipment_notices` e o cron entrega quando a sessão
 * voltar. O teste roda o caminho real (`avisarClientesDaCarga` e
 * `entregarAvisosPendentes`) contra um banco em memória mínimo, mockando só o
 * transporte (sessão e envio). O que se mede é a DECISÃO e o estado final da
 * fila, não a forma do SQL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sessao: vi.fn(),
  ensure: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/automation/start-conversation", () => ({
  sessaoParaAvisosDeExpedicao: mocks.sessao,
  ensureConversation: mocks.ensure,
}));

vi.mock("@/app/api/v1/messages/_handler", () => ({
  sendMessageHandler: mocks.send,
}));

import {
  avisarClientesDaCarga,
  entregarAvisosPendentes,
} from "@/lib/expedicao/aviso-de-carga";

interface Aviso {
  id: string;
  organization_id: string;
  shipment_id: string;
  order_id: string;
  status: string;
  attempts: number;
  message_id?: string | null;
  last_error?: string | null;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

const PEDIDO = "ped-1";
const CARGA = "carga-1";
const ORG = "org-1";

/**
 * Banco em memória do que o caminho toca. `from(tabela)` devolve um builder
 * "thenable": os filtros são acumulados e a resolução decide pelo estado da
 * fila. É pequeno de propósito — só as operações que `aviso-de-carga` usa.
 */
function fakeAdmin(pedidos = [{ id: PEDIDO, numero: 19432, contact_id: "contato-1" }]) {
  const fila: Aviso[] = [];
  let seq = 0;

  function novoAviso(row: { organization_id: string; shipment_id: string; order_id: string }): Aviso {
    seq += 1;
    const agora = new Date().toISOString();
    return {
      id: `aviso-${seq}`,
      ...row,
      status: "pendente",
      attempts: 0,
      created_at: agora,
      updated_at: agora,
    };
  }

  const admin = {
    from(tabela: string) {
      const filtros: Array<[string, unknown]> = [];
      let op: "select" | "upsert" | "update" = "select";
      let payload: unknown = null;

      const tem = (coluna: string, valor: unknown) =>
        filtros.some(([c, v]) => c === coluna && v === valor);

      const aplicarUpdate = () => {
        const patch = (payload ?? {}) as Partial<Aviso>;
        if (tem("status", "enviando")) {
          // reciclagem de claim órfão: todos os `enviando` voltam para a fila.
          for (const a of fila) {
            if (a.status === "enviando") Object.assign(a, patch, { status: "pendente" });
          }
          return { data: null, error: null };
        }
        const id = filtros.find(([c]) => c === "id")?.[1] as string | undefined;
        if (id) {
          const alvo = fila.find((a) => a.id === id);
          if (alvo) Object.assign(alvo, patch);
        }
        return { data: null, error: null };
      };

      const resolveMany = () => {
        if (tabela === "commercial_orders") return { data: pedidos, error: null };
        if (tabela === "organizations") {
          return { data: { timezone: "America/Sao_Paulo" }, error: null };
        }
        if (tabela === "shipment_notices") {
          if (op === "upsert") {
            const rows = (payload as { rows: Array<{ organization_id: string; shipment_id: string; order_id: string }> }).rows;
            for (const row of rows) {
              const existe = fila.some(
                (a) => a.shipment_id === row.shipment_id && a.order_id === row.order_id,
              );
              if (!existe) fila.push(novoAviso(row));
            }
            return { data: null, error: null };
          }
          if (op === "update") return aplicarUpdate();
          return { data: fila.filter((a) => a.status === "pendente"), error: null };
        }
        return { data: null, error: null };
      };

      const api = {
        select: () => api,
        order: () => api,
        limit: () => api,
        not: () => api,
        eq: (coluna: string, valor: unknown) => {
          filtros.push([coluna, valor]);
          return api;
        },
        in: (coluna: string, valor: unknown[]) => {
          filtros.push([coluna, valor]);
          return api;
        },
        is: (coluna: string, valor: unknown) => {
          filtros.push([coluna, valor]);
          return api;
        },
        lt: (coluna: string, valor: unknown) => {
          filtros.push([coluna, valor]);
          return api;
        },
        upsert: (
          rows: Array<{ organization_id: string; shipment_id: string; order_id: string }>,
          _opts?: unknown,
        ) => {
          op = "upsert";
          payload = { rows };
          return api;
        },
        update: (patch: Partial<Aviso>) => {
          op = "update";
          payload = patch;
          return api;
        },
        maybeSingle: () => {
          if (tabela === "organizations") {
            return Promise.resolve({ data: { timezone: "America/Sao_Paulo" }, error: null });
          }
          if (tabela === "shipment_notices" && op === "update") {
            const id = filtros.find(([c]) => c === "id")?.[1] as string | undefined;
            const alvo = fila.find((a) => a.id === id);
            // Claim atômico: só vence quem ainda encontra `pendente`.
            if (!alvo || !tem("status", "pendente") || alvo.status !== "pendente") {
              return Promise.resolve({ data: null, error: null });
            }
            Object.assign(alvo, payload);
            return Promise.resolve({ data: { id: alvo.id }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
          Promise.resolve(resolveMany()).then(onOk, onErr),
      };
      return api;
    },
  };

  return { admin: admin as never, fila };
}

beforeEach(() => {
  mocks.sessao.mockReset();
  mocks.ensure.mockReset();
  mocks.send.mockReset();
  mocks.ensure.mockResolvedValue("conversa-1");
});

describe("avisarClientesDaCarga — número de expedição fora do ar", () => {
  it("sessão parada: NÃO envia pelo comercial e deixa o aviso pendente", async () => {
    const { admin, fila } = fakeAdmin();
    mocks.sessao.mockResolvedValue({ id: "exp", status: "STOPPED", dedicado: true });

    const r = await avisarClientesDaCarga(admin, {
      organizationId: ORG,
      shipmentId: CARGA,
      orderIds: [PEDIDO],
    });

    expect(r.avisados).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({ status: "pendente", order_id: PEDIDO });
  });

  it("sem número de expedição marcado: NÃO envia por ninguém e enfileira", async () => {
    const { admin, fila } = fakeAdmin();
    mocks.sessao.mockResolvedValue(null);

    await avisarClientesDaCarga(admin, {
      organizationId: ORG,
      shipmentId: CARGA,
      orderIds: [PEDIDO],
    });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(fila).toHaveLength(1);
    expect(fila[0]?.status).toBe("pendente");
  });

  it("enfileirar duas vezes o mesmo pedido não duplica o aviso", async () => {
    const { admin, fila } = fakeAdmin();
    mocks.sessao.mockResolvedValue({ id: "exp", status: "STOPPED", dedicado: true });

    await avisarClientesDaCarga(admin, {
      organizationId: ORG,
      shipmentId: CARGA,
      orderIds: [PEDIDO],
    });
    await avisarClientesDaCarga(admin, {
      organizationId: ORG,
      shipmentId: CARGA,
      orderIds: [PEDIDO],
    });

    expect(fila).toHaveLength(1);
  });

  it("sessão WORKING: envia pelo número de expedição e marca enviado", async () => {
    const { admin, fila } = fakeAdmin();
    mocks.sessao.mockResolvedValue({ id: "exp", status: "WORKING", dedicado: true });
    mocks.send.mockResolvedValue({ id: "msg-1", status: "sent" });

    const r = await avisarClientesDaCarga(admin, {
      organizationId: ORG,
      shipmentId: CARGA,
      orderIds: [PEDIDO],
    });

    expect(r.avisados).toBe(1);
    expect(mocks.ensure).toHaveBeenCalledWith(admin, ORG, "contato-1", "exp");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(fila[0]).toMatchObject({
      status: "enviado",
      message_id: "msg-1",
      attempts: 1,
    });
  });

  it("envio que ficou `queued` volta para a fila em vez de virar enviado", async () => {
    const { admin, fila } = fakeAdmin();
    mocks.sessao.mockResolvedValue({ id: "exp", status: "WORKING", dedicado: true });
    mocks.send.mockResolvedValue({ id: "msg-2", status: "queued" });

    await avisarClientesDaCarga(admin, {
      organizationId: ORG,
      shipmentId: CARGA,
      orderIds: [PEDIDO],
    });

    expect(fila[0]).toMatchObject({
      status: "pendente",
      last_error: "channel_session_not_working",
    });
  });
});

describe("entregarAvisosPendentes — o cron quando o número volta", () => {
  it("entrega a fila pendente assim que a sessão fica WORKING", async () => {
    const { admin, fila } = fakeAdmin();
    mocks.sessao.mockResolvedValue({ id: "exp", status: "STOPPED", dedicado: true });

    await avisarClientesDaCarga(admin, {
      organizationId: ORG,
      shipmentId: CARGA,
      orderIds: [PEDIDO],
    });
    expect(fila[0]?.status).toBe("pendente");

    // O número voltou.
    mocks.sessao.mockResolvedValue({ id: "exp", status: "WORKING", dedicado: true });
    mocks.send.mockResolvedValue({ id: "msg-3", status: "delivered" });

    const resumo = await entregarAvisosPendentes(admin, { organizationId: ORG });

    expect(resumo).toMatchObject({ enviados: 1, falharam: 0, naFila: 0 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(fila[0]).toMatchObject({ status: "enviado", message_id: "msg-3" });
  });

  it("sem sessão, a fila continua pendente na próxima rodada", async () => {
    const { admin, fila } = fakeAdmin();
    mocks.sessao.mockResolvedValue(null);

    await avisarClientesDaCarga(admin, {
      organizationId: ORG,
      shipmentId: CARGA,
      orderIds: [PEDIDO],
    });

    const resumo = await entregarAvisosPendentes(admin, { organizationId: ORG });

    expect(resumo).toMatchObject({ enviados: 0, naFila: 1 });
    expect(fila[0]?.status).toBe("pendente");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
