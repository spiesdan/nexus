import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { devolverReservaDeRecebimento, reservarRecebimento } from "./recebimento";

/**
 * O CAS do recebimento de compra — o que separa "re-tick recebe o que falta" de
 * "dois cliques somam o estoque duas vezes".
 *
 * O teste usa um cliente falso que registra o patch e os filtros: o que importa
 * é que o UPDATE carregue `recebido_qtd = valor_lido`, não que o banco devolva
 * a linha. A concorrência real é provada no CAS do Postgres (READ COMMITTED
 * reavalia o WHERE depois de esperar a trava), não aqui.
 */

interface Chamada {
  patch: Record<string, unknown>;
  filtros: Array<[string, unknown]>;
  resposta: { data: Array<{ id: string }> | null; error: { message: string } | null };
}

function clienteFalso(respostas: Chamada["resposta"][]): {
  client: SupabaseClient;
  chamadas: Chamada[];
} {
  const chamadas: Chamada[] = [];
  let indice = 0;
  const builder = {
    update(patch: Record<string, unknown>) {
      const chamada: Chamada = { patch, filtros: [], resposta: { data: [], error: null } };
      chamadas.push(chamada);
      return {
        eq(coluna: string, valor: unknown) {
          chamada.filtros.push([coluna, valor]);
          return this;
        },
        select() {
          chamada.resposta = respostas[indice++] ?? { data: [], error: null };
          return Promise.resolve(chamada.resposta);
        },
      };
    },
  };
  return {
    client: { from: () => builder } as unknown as SupabaseClient,
    chamadas,
  };
}

describe("reservarRecebimento", () => {
  it("grava recebido_qtd = lido + quantidade com CAS no valor lido", async () => {
    const { client, chamadas } = clienteFalso([{ data: [{ id: "item-1" }], error: null }]);

    const r = await reservarRecebimento(client, {
      orgId: "org-1",
      itemId: "item-1",
      recebidoAtual: 3,
      quantidade: 7,
    });

    expect(r).toEqual({ reservado: true, erro: null });
    expect(chamadas[0]?.patch).toEqual({ recebido_qtd: 10 });
    expect(chamadas[0]?.filtros).toEqual([
      ["organization_id", "org-1"],
      ["id", "item-1"],
      ["recebido_qtd", 3],
    ]);
  });

  it("0 linhas = outra requisição levou; não reserva e não movimenta estoque", async () => {
    const { client } = clienteFalso([{ data: [], error: null }]);

    const r = await reservarRecebimento(client, {
      orgId: "org-1",
      itemId: "item-1",
      recebidoAtual: 3,
      quantidade: 7,
    });

    expect(r.reservado).toBe(false);
    expect(r.erro).toBeNull();
  });

  it("erro do banco não vira 'reservado' silencioso", async () => {
    const { client } = clienteFalso([{ data: null, error: { message: "deadlock detected" } }]);

    const r = await reservarRecebimento(client, {
      orgId: "org-1",
      itemId: "item-1",
      recebidoAtual: 0,
      quantidade: 1,
    });

    expect(r.reservado).toBe(false);
    expect(r.erro).toBe("deadlock detected");
  });
});

describe("devolverReservaDeRecebimento", () => {
  it("desfaz só a NOSSA reserva (CAS no valor que gravamos)", async () => {
    const { client, chamadas } = clienteFalso([{ data: [{ id: "item-1" }], error: null }]);

    const ok = await devolverReservaDeRecebimento(client, {
      orgId: "org-1",
      itemId: "item-1",
      recebidoAtual: 3,
      quantidade: 7,
    });

    expect(ok).toBe(true);
    expect(chamadas[0]?.patch).toEqual({ recebido_qtd: 3 });
    expect(chamadas[0]?.filtros).toEqual([
      ["organization_id", "org-1"],
      ["id", "item-1"],
      ["recebido_qtd", 10],
    ]);
  });

  it("se outra requisição avançou, não toca e devolve false", async () => {
    const { client } = clienteFalso([{ data: [], error: null }]);

    const ok = await devolverReservaDeRecebimento(client, {
      orgId: "org-1",
      itemId: "item-1",
      recebidoAtual: 3,
      quantidade: 7,
    });

    expect(ok).toBe(false);
  });
});
