/**
 * A FILA E O DRENO — sem SQLite de verdade.
 *
 * O fake aqui é um banco em memória que entende as 9 instruções que
 * `outbox.ts` e `sync.ts` usam. Não é um SQL genérico: cada ramo casa um
 * prefixo da instrução real. Se alguém mudar o SQL da lib sem atualizar o
 * fake, o teste quebra com "instrução não suportada" — que é o comportamento
 * certo, porque um fake que ignora a instrução mediria outra coisa.
 */
import { describe, expect, it } from "vitest";

import {
  contarAbertos,
  descartarPendente,
  enfileirarPedido,
  filaAberta,
  filaPendente,
  marcarAceito,
  marcarRejeitado,
  reabrirRejeitado,
  reservarParaEnvio,
  type Db,
} from "@/lib/offline/outbox";
import { drenarFila } from "@/lib/offline/sync";

interface Linha {
  uuid: string;
  numero_provisorio: string;
  payload: string;
  status: string;
  tentativas: number;
  ultimo_erro: string | null;
  criado_em: string;
  enviado_em: string | null;
  pedido_id: string | null;
  pedido_numero: number | null;
}

function bancoFake(): Db & { linhas: Linha[] } {
  const linhas: Linha[] = [];
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();

  const db: Db = {
    async query(sql: string, _params: unknown[] = []) {
      const q = norm(sql);
      if (q.startsWith("SELECT * FROM pedidos_pendentes WHERE status = 'pendente'")) {
        const vals = linhas
          .filter((l) => l.status === "pendente")
          .sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1));
        return { values: vals as unknown as Record<string, unknown>[] };
      }
      if (q.startsWith("SELECT * FROM pedidos_pendentes WHERE status IN")) {
        const vals = linhas
          .filter((l) => ["pendente", "enviando", "rejeitado"].includes(l.status))
          .sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1));
        return { values: vals as unknown as Record<string, unknown>[] };
      }
      if (q.startsWith("SELECT status, COUNT(*)")) {
        const mapa = new Map<string, number>();
        for (const l of linhas) {
          if (["pendente", "enviando", "rejeitado"].includes(l.status)) {
            mapa.set(l.status, (mapa.get(l.status) ?? 0) + 1);
          }
        }
        return {
          values: [...mapa].map(([status, n]) => ({ status, n })) as unknown as Record<
            string,
            unknown
          >[],
        };
      }
      throw new Error(`instrução SELECT não suportada no fake: ${q.slice(0, 80)}`);
    },
    async execute(sql: string, params: unknown[] = []) {
      const q = norm(sql);
      if (q.startsWith("INSERT INTO pedidos_pendentes")) {
        const [uuid, numero_provisorio, payload, criado_em] = params as [string, string, string, string];
        if (linhas.some((l) => l.uuid === uuid)) throw new Error("PRIMARY KEY duplicada");
        linhas.push({
          uuid,
          numero_provisorio,
          payload,
          status: "pendente",
          tentativas: 0,
          ultimo_erro: null,
          criado_em,
          enviado_em: null,
          pedido_id: null,
          pedido_numero: null,
        });
        return { changes: 1 };
      }
      if (q.startsWith("UPDATE pedidos_pendentes SET status = 'enviando'")) {
        const l = linhas.find((x) => x.uuid === params[0] && x.status === "pendente");
        if (!l) return { changes: 0 };
        l.status = "enviando";
        return { changes: 1 };
      }
      if (q.startsWith("UPDATE pedidos_pendentes SET status = 'aceito'")) {
        const l = linhas.find((x) => x.uuid === params[3]);
        if (!l) return { changes: 0 };
        l.status = "aceito";
        l.pedido_id = params[0] as string;
        l.pedido_numero = params[1] as number;
        l.enviado_em = params[2] as string;
        l.ultimo_erro = null;
        return { changes: 1 };
      }
      if (q.startsWith("UPDATE pedidos_pendentes SET status = 'rejeitado'")) {
        const l = linhas.find((x) => x.uuid === params[1]);
        if (!l) return { changes: 0 };
        l.status = "rejeitado";
        l.ultimo_erro = params[0] as string;
        l.tentativas++;
        return { changes: 1 };
      }
      if (q.startsWith("UPDATE pedidos_pendentes SET status = 'pendente', ultimo_erro = NULL")) {
        const l = linhas.find((x) => x.uuid === params[0] && x.status === "rejeitado");
        if (!l) return { changes: 0 };
        l.status = "pendente";
        l.ultimo_erro = null;
        return { changes: 1 };
      }
      if (q.startsWith("UPDATE pedidos_pendentes SET status = 'pendente'")) {
        const l = linhas.find((x) => x.uuid === params[1]);
        if (!l) return { changes: 0 };
        l.status = "pendente";
        l.ultimo_erro = params[0] as string;
        l.tentativas++;
        return { changes: 1 };
      }
      if (q.startsWith("DELETE FROM pedidos_pendentes")) {
        const i = linhas.findIndex(
          (x) => x.uuid === params[0] && ["pendente", "rejeitado"].includes(x.status),
        );
        if (i < 0) return { changes: 0 };
        linhas.splice(i, 1);
        return { changes: 1 };
      }
      throw new Error(`instrução não suportada no fake: ${q.slice(0, 80)}`);
    },
  };
  return Object.assign(db, { linhas });
}

const AGORA = "2026-10-10T12:00:00.000Z";
const UUID1 = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

function pedidoFake(nome = "Cliente") {
  return {
    cliente_nome: nome,
    status: "rascunho",
    itens: [{ product_id: null, quantidade: 1, preco_unit_cents: 1000, desconto_pct: 0 }],
  };
}

describe("a fila", () => {
  it("enfileira e lista em FIFO", async () => {
    const db = bancoFake();
    await enfileirarPedido(db, {
      uuid: UUID2,
      numero_provisorio: "OFF-0002",
      payload: pedidoFake("B"),
      agora: "2026-10-10T12:01:00.000Z",
    });
    await enfileirarPedido(db, {
      uuid: UUID1,
      numero_provisorio: "OFF-0001",
      payload: pedidoFake("A"),
      agora: "2026-10-10T12:00:00.000Z",
    });
    const fila = await filaPendente(db);
    expect(fila.map((f) => f.numero_provisorio)).toEqual(["OFF-0001", "OFF-0002"]);
  });

  it("o mesmo UUID duas vezes é erro — não fila duplicada", async () => {
    // Dois toques no "salvar" não podem enfileirar duas vezes. O PRIMARY KEY
    // barra, e a tela precisa tratar o erro mostrando "já está na fila".
    const db = bancoFake();
    await enfileirarPedido(db, {
      uuid: UUID1,
      numero_provisorio: "OFF-0001",
      payload: pedidoFake(),
      agora: AGORA,
    });
    await expect(
      enfileirarPedido(db, {
        uuid: UUID1,
        numero_provisorio: "OFF-0002",
        payload: pedidoFake(),
        agora: AGORA,
      }),
    ).rejects.toThrow();
    expect(db.linhas).toHaveLength(1);
  });

  it("reserva trava contra dois drenos", async () => {
    const db = bancoFake();
    await enfileirarPedido(db, {
      uuid: UUID1,
      numero_provisorio: "OFF-0001",
      payload: pedidoFake(),
      agora: AGORA,
    });
    expect(await reservarParaEnvio(db, UUID1)).toBe(true);
    expect(await reservarParaEnvio(db, UUID1)).toBe(false);
  });

  it("aceito some da fila aberta e guarda o definitivo", async () => {
    const db = bancoFake();
    await enfileirarPedido(db, {
      uuid: UUID1,
      numero_provisorio: "OFF-0001",
      payload: pedidoFake(),
      agora: AGORA,
    });
    await reservarParaEnvio(db, UUID1);
    await marcarAceito(db, { uuid: UUID1, pedido_id: "ped-1", pedido_numero: 101, agora: AGORA });
    expect(await filaAberta(db)).toHaveLength(0);
    expect(db.linhas[0]?.pedido_numero).toBe(101);
  });

  it("rejeitado fica com o motivo e NÃO tenta sozinho", async () => {
    const db = bancoFake();
    await enfileirarPedido(db, {
      uuid: UUID1,
      numero_provisorio: "OFF-0001",
      payload: pedidoFake(),
      agora: AGORA,
    });
    await reservarParaEnvio(db, UUID1);
    await marcarRejeitado(db, {
      uuid: UUID1,
      motivo: "Cliente acima do limite de crédito.",
      agora: AGORA,
    });
    // O dreno só pega `pendente` — o rejeitado não sai daqui sem `reabrir`.
    expect(await filaPendente(db)).toHaveLength(0);
    const aberta = await filaAberta(db);
    expect(aberta).toHaveLength(1);
    expect(aberta[0]?.ultimo_erro).toMatch(/crédito/);
  });

  it("só rejeitado reabre; aceito é final", async () => {
    const db = bancoFake();
    await enfileirarPedido(db, {
      uuid: UUID1,
      numero_provisorio: "OFF-0001",
      payload: pedidoFake(),
      agora: AGORA,
    });
    await reservarParaEnvio(db, UUID1);
    await marcarRejeitado(db, { uuid: UUID1, motivo: "x", agora: AGORA });
    expect(await reabrirRejeitado(db, UUID1)).toBe(true);
    expect(await filaPendente(db)).toHaveLength(1);

    await reservarParaEnvio(db, UUID1);
    await marcarAceito(db, { uuid: UUID1, pedido_id: "p", pedido_numero: 5, agora: AGORA });
    expect(await reabrirRejeitado(db, UUID1)).toBe(false);
    expect(await descartarPendente(db, UUID1)).toBe(false);
  });

  it("a contagem separa o que espera do que precisa de decisão", async () => {
    const db = bancoFake();
    await enfileirarPedido(db, {
      uuid: UUID1,
      numero_provisorio: "OFF-0001",
      payload: pedidoFake(),
      agora: AGORA,
    });
    await enfileirarPedido(db, {
      uuid: UUID2,
      numero_provisorio: "OFF-0002",
      payload: pedidoFake(),
      agora: AGORA,
    });
    await reservarParaEnvio(db, UUID2);
    await marcarRejeitado(db, { uuid: UUID2, motivo: "x", agora: AGORA });
    expect(await contarAbertos(db)).toEqual({ pendentes: 1, rejeitados: 1 });
  });
});

describe("o dreno", () => {
  it("manda em FIFO e marca aceito com o definitivo", async () => {
    const db = bancoFake();
    await enfileirarPedido(db, {
      uuid: UUID1,
      numero_provisorio: "OFF-0001",
      payload: pedidoFake(),
      agora: AGORA,
    });
    const vistos: string[] = [];
    const r = await drenarFila(db, async (_url, init) => {
      vistos.push((JSON.parse(init.body) as { chave_sincronizacao: string }).chave_sincronizacao);
      return { status: 201, corpo: async () => ({ data: { id: "ped-9", numero: 200 } }) };
    });
    expect(r.aceitos).toBe(1);
    expect(vistos).toEqual([UUID1]);
    expect(db.linhas[0]?.pedido_numero).toBe(200);
  });

  it("a chave que sai é o UUID da fila", async () => {
    // Sem isto o servidor não reconhece o retry — e o arquivo inteiro vira
    // uma máquina de pedidos dobrados. É a asserção mais importante daqui.
    const db = bancoFake();
    await enfileirarPedido(db, {
      uuid: UUID1,
      numero_provisorio: "OFF-0001",
      payload: pedidoFake(),
      agora: AGORA,
    });
    let corpo: Record<string, unknown> = {};
    await drenarFila(db, async (_url, init) => {
      corpo = JSON.parse(init.body) as Record<string, unknown>;
      return { status: 201, corpo: async () => ({ data: { id: "p", numero: 1 } }) };
    });
    expect(corpo.chave_sincronizacao).toBe(UUID1);
  });

  it("timeout volta para a fila com a tentativa contada", async () => {
    const db = bancoFake();
    await enfileirarPedido(db, {
      uuid: UUID1,
      numero_provisorio: "OFF-0001",
      payload: pedidoFake(),
      agora: AGORA,
    });
    const r = await drenarFila(db, async () => {
      throw new Error("fetch failed");
    });
    expect(r.adiados).toBe(1);
    expect((await filaPendente(db)).map((f) => f.uuid)).toEqual([UUID1]);
    expect(db.linhas[0]?.tentativas).toBe(1);
  });

  it("422 vira rejeitado com a mensagem do servidor", async () => {
    const db = bancoFake();
    await enfileirarPedido(db, {
      uuid: UUID1,
      numero_provisorio: "OFF-0001",
      payload: pedidoFake(),
      agora: AGORA,
    });
    const r = await drenarFila(db, async () => ({
      status: 422,
      corpo: async () => ({ error: { message: "Cliente acima do limite de crédito." } }),
    }));
    expect(r.rejeitados).toBe(1);
    expect(r.itens[0]?.motivo).toMatch(/crédito/);
    expect(db.linhas[0]?.status).toBe("rejeitado");
  });

  it("401 para o dreno — os próximos não gastam tentativa à toa", async () => {
    const db = bancoFake();
    await enfileirarPedido(db, {
      uuid: UUID1,
      numero_provisorio: "OFF-0001",
      payload: pedidoFake(),
      agora: AGORA,
    });
    await enfileirarPedido(db, {
      uuid: UUID2,
      numero_provisorio: "OFF-0002",
      payload: pedidoFake(),
      agora: AGORA,
    });
    const r = await drenarFila(db, async () => ({ status: 401, corpo: async () => ({}) }));
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]?.resultado).toBe("parado_sem_sessao");
    // O segundo nem foi tocado: continua pendente com zero tentativas.
    expect(db.linhas.find((l) => l.uuid === UUID2)?.tentativas).toBe(0);
  });

  it("500 não é rejeição — volta para a fila", async () => {
    const db = bancoFake();
    await enfileirarPedido(db, {
      uuid: UUID1,
      numero_provisorio: "OFF-0001",
      payload: pedidoFake(),
      agora: AGORA,
    });
    const r = await drenarFila(db, async () => ({ status: 500, corpo: async () => ({}) }));
    expect(r.adiados).toBe(1);
    expect(db.linhas[0]?.status).toBe("pendente");
  });

  it("200 sem id/número não é confirmação", async () => {
    // Confirmar sem entender a resposta é dizer "foi" para um pedido que
    // talvez não foi — e o vendedor segue viagem achando que entregou.
    const db = bancoFake();
    await enfileirarPedido(db, {
      uuid: UUID1,
      numero_provisorio: "OFF-0001",
      payload: pedidoFake(),
      agora: AGORA,
    });
    const r = await drenarFila(db, async () => ({
      status: 200,
      corpo: async () => ({ data: {} }),
    }));
    expect(r.adiados).toBe(1);
    expect(db.linhas[0]?.status).toBe("pendente");
  });
});
