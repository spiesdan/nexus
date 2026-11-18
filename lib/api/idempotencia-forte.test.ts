import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { hashDaRequisicao, reservarIdempotencia } from "./idempotencia";

/**
 * D-03 — a chave de idempotência tem UM efeito, inclusive sob concorrência.
 *
 * O teste usa um client falso em memória que reproduz o que importa da tabela
 * `idempotency_keys`: unique (org, endpoint, key), status 0 como reivindicação,
 * update/delete filtrados. A concorrência real é do Postgres; aqui se prova o
 * protocolo — reivindicar antes, esperar o vencedor, devolver replay.
 */

type Linha = {
  id: string;
  organization_id: string;
  endpoint: string;
  key: string;
  request_hash: string;
  status_code: number;
  response_body: unknown;
  expires_at: string;
};

function adminFalso(): { client: SupabaseClient; linhas: Linha[] } {
  const linhas: Linha[] = [];
  let seq = 0;

  class Consulta {
    filtros: Array<[string, unknown]> = [];
    constructor(
      private op: "select" | "update" | "delete",
      private patch?: Record<string, unknown>,
    ) {}

    eq(coluna: string, valor: unknown): this {
      this.filtros.push([coluna, valor]);
      return this;
    }

    select(): this {
      return this;
    }

    match(): Linha[] {
      return linhas.filter((l) => this.filtros.every(([c, v]) => (l as never)[c] === v));
    }

    async maybeSingle(): Promise<{ data: Linha | null; error: null }> {
      return { data: this.match()[0] ?? null, error: null };
    }

    then<R>(onfulfilled: (value: { error: null }) => R): Promise<R> {
      const alvo = this.match();
      if (this.op === "update" && this.patch) {
        for (const l of alvo) Object.assign(l, this.patch);
      }
      if (this.op === "delete") {
        for (const l of alvo) {
          const i = linhas.indexOf(l);
          if (i >= 0) linhas.splice(i, 1);
        }
      }
      return Promise.resolve({ error: null }).then(onfulfilled);
    }
  }

  const client = {
    from: (tabela: string) => {
      if (tabela !== "idempotency_keys") throw new Error(`tabela inesperada: ${tabela}`);
      return {
        select: () => new Consulta("select"),
        update: (patch: Record<string, unknown>) => new Consulta("update", patch),
        delete: () => new Consulta("delete"),
        insert: async (row: Record<string, unknown>) => {
          const org = row.organization_id as string;
          const endpoint = row.endpoint as string;
          const key = row.key as string;
          if (linhas.some((l) => l.organization_id === org && l.endpoint === endpoint && l.key === key)) {
            return { error: { code: "23505", message: "duplicate key" } };
          }
          linhas.push({
            id: `linha-${++seq}`,
            organization_id: org,
            endpoint,
            key,
            request_hash: row.request_hash as string,
            status_code: row.status_code as number,
            response_body: row.response_body,
            expires_at: row.expires_at as string,
          });
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, linhas };
}

const BASE = {
  orgId: "org-1",
  endpoint: "POST /api/v1/invoices",
  chave: "chave-1",
  requestHash: hashDaRequisicao({ order_id: "pedido-1" }),
};

describe("reservarIdempotencia", () => {
  it("chave nova fica livre; finalizar grava a resposta; retry devolve replay", async () => {
    const { client, linhas } = adminFalso();

    const primeira = await reservarIdempotencia(client, BASE);
    expect(primeira.estado).toBe("livre");
    expect(linhas[0]?.status_code).toBe(0);

    if (primeira.estado !== "livre") throw new Error("esperava livre");
    await primeira.finalizar({ status: 201, body: { id: "nota-1" } });

    const segunda = await reservarIdempotencia(client, BASE);
    expect(segunda).toEqual({
      estado: "replay",
      resposta: { status: 201, body: { id: "nota-1" } },
    });
  });

  it("mesma chave com payload diferente é conflito", async () => {
    const { client } = adminFalso();
    const primeira = await reservarIdempotencia(client, BASE);
    if (primeira.estado !== "livre") throw new Error("esperava livre");
    await primeira.finalizar({ status: 201, body: { id: "nota-1" } });

    const outra = await reservarIdempotencia(client, {
      ...BASE,
      requestHash: hashDaRequisicao({ order_id: "pedido-2" }),
    });
    expect(outra.estado).toBe("conflito");
  });

  it("concorrência da MESMA chave tem um vencedor e o perdedor recebe replay", async () => {
    const { client } = adminFalso();

    const vencedor = await reservarIdempotencia(client, BASE);
    if (vencedor.estado !== "livre") throw new Error("esperava livre");

    // A segunda chega enquanto a primeira está em andamento (status 0).
    const perdedorPromessa = reservarIdempotencia(client, BASE);
    setTimeout(() => {
      void vencedor.finalizar({ status: 201, body: { id: "nota-unica" } });
    }, 60);

    const perdedor = await perdedorPromessa;
    expect(perdedor).toEqual({
      estado: "replay",
      resposta: { status: 201, body: { id: "nota-unica" } },
    });
  });

  it("abortar libera a chave para uma nova tentativa", async () => {
    const { client } = adminFalso();
    const primeira = await reservarIdempotencia(client, BASE);
    if (primeira.estado !== "livre") throw new Error("esperava livre");
    await primeira.abortar();

    const segunda = await reservarIdempotencia(client, BASE);
    expect(segunda.estado).toBe("livre");
  });

  it("a chave é escopada por organização, rota e chave", async () => {
    const { client } = adminFalso();
    const primeira = await reservarIdempotencia(client, BASE);
    if (primeira.estado !== "livre") throw new Error("esperava livre");
    await primeira.finalizar({ status: 201, body: { id: "nota-1" } });

    const outraRota = await reservarIdempotencia(client, {
      ...BASE,
      endpoint: "POST /api/v1/fiscal-inutilizacoes",
    });
    expect(outraRota.estado).toBe("livre");
  });
});
