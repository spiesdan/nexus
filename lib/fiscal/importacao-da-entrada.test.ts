/**
 * A REIVINDICAÇÃO DA IMPORTAÇÃO DE ENTRADA — contrato do CAS.
 *
 * O defeito medido em 18/11/2026: a rota lia `estoque_processado_em`, somava
 * quantidade ao catálogo e só no fim gravava o flag. Dois POSTs concorrentes
 * liam `null` os dois e o estoque entrava duas vezes.
 *
 * O dublê abaixo aplica a regra do PostgREST: o UPDATE só vale se o flag ainda
 * for nulo. É o suficiente para provar os quatro desfechos que a rota usa.
 */
import { describe, expect, it } from "vitest";

import { reivindicarLadoDaImportacao } from "@/lib/fiscal/importacao-da-entrada";

const ORG = "22222222-2222-4222-8222-222222222222";
const ENTRADA = "11111111-1111-4111-8111-111111111111";

function banco(
  estado: { estoque_processado_em: string | null; financeiro_processado_em: string | null },
  opcoes: { erroUpdate?: boolean; erroLeitura?: boolean; sumiu?: boolean } = {},
) {
  const updates: Record<string, unknown>[] = [];
  const client = {
    from(tabela: string) {
      if (tabela !== "fiscal_entradas") throw new Error(`tabela inesperada: ${tabela}`);
      let op: "select" | "update" = "select";
      let valores: Record<string, unknown> = {};
      let filtroNulo: string | null = null;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.update = (v: Record<string, unknown>) => {
        op = "update";
        valores = v;
        updates.push(v);
        return q;
      };
      q.eq = () => q;
      q.is = (coluna: string) => {
        filtroNulo = coluna;
        return q;
      };
      q.maybeSingle = () => {
        if (opcoes.erroLeitura) return Promise.resolve({ data: null, error: { message: "leitura falhou" } });
        if (opcoes.sumiu) return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: { ...estado }, error: null });
      };
      q.then = (ok: unknown, err: unknown) => {
        if (op !== "update") return Promise.resolve({ data: null, error: null }).then(ok as never, err as never);
        if (opcoes.erroUpdate) {
          return Promise.resolve({ data: null, error: { message: "update falhou" } }).then(ok as never, err as never);
        }
        const coluna = Object.keys(valores)[0]!;
        if (filtroNulo !== coluna) throw new Error("o UPDATE precisa filtrar o flag por is(null)");
        if (estado[coluna as keyof typeof estado] !== null) {
          // CAS perdeu: outra requisição já preencheu o flag.
          return Promise.resolve({ data: [], error: null }).then(ok as never, err as never);
        }
        (estado as Record<string, string | null>)[coluna] = String(valores[coluna]);
        return Promise.resolve({ data: [{ id: ENTRADA }], error: null }).then(ok as never, err as never);
      };
      return q;
    },
  };
  return { client: client as never, estado, updates };
}

describe("reivindicarLadoDaImportacao", () => {
  it("reivindica o lado ainda nulo, gravando o flag", async () => {
    const { client, estado } = banco({
      estoque_processado_em: null,
      financeiro_processado_em: null,
    });
    const r = await reivindicarLadoDaImportacao(client, {
      orgId: ORG,
      entradaId: ENTRADA,
      lado: "estoque",
    });
    expect(r).toEqual({ estado: "reivindicado" });
    expect(estado.estoque_processado_em).not.toBeNull();
    expect(estado.financeiro_processado_em).toBeNull();
  });

  it("lado já processado não é reivindicado de novo (retry não move estoque)", async () => {
    const { client, estado } = banco({
      estoque_processado_em: "2026-11-01T00:00:00.000Z",
      financeiro_processado_em: null,
    });
    const r = await reivindicarLadoDaImportacao(client, {
      orgId: ORG,
      entradaId: ENTRADA,
      lado: "estoque",
    });
    expect(r).toEqual({ estado: "ja_processado" });
    expect(estado.estoque_processado_em).toBe("2026-11-01T00:00:00.000Z");
  });

  it("flag nulo com UPDATE de 0 linhas é corrida em andamento — nunca 'importada'", async () => {
    // Corrida real: a outra transação ainda não commitou quando o UPDATE
    // reavalia o filtro, e a releitura (nesta conexão) ainda vê nulo.
    const semGravacao = {
      from() {
        const q: Record<string, unknown> = {};
        q.update = () => q;
        q.eq = () => q;
        q.is = () => q;
        q.select = () => q;
        q.maybeSingle = () =>
          Promise.resolve({
            data: { estoque_processado_em: null, financeiro_processado_em: null },
            error: null,
          });
        q.then = (ok: unknown, err: unknown) =>
          Promise.resolve({ data: [], error: null }).then(ok as never, err as never);
        return q;
      },
    } as never;

    const r = await reivindicarLadoDaImportacao(semGravacao, {
      orgId: ORG,
      entradaId: ENTRADA,
      lado: "estoque",
    });
    expect(r).toEqual({ estado: "em_andamento" });
  });

  it("erro do banco vira discriminante, nunca exceção", async () => {
    const { client } = banco(
      { estoque_processado_em: null, financeiro_processado_em: null },
      { erroUpdate: true },
    );
    const r = await reivindicarLadoDaImportacao(client, {
      orgId: ORG,
      entradaId: ENTRADA,
      lado: "financeiro",
    });
    expect(r).toEqual({ estado: "erro", erro: "update falhou" });
  });

  it("erro de leitura depois do CAS perdido também é discriminante", async () => {
    const { client } = banco(
      { estoque_processado_em: "2026-11-01T00:00:00.000Z", financeiro_processado_em: null },
      { erroLeitura: true },
    );
    const r = await reivindicarLadoDaImportacao(client, {
      orgId: ORG,
      entradaId: ENTRADA,
      lado: "estoque",
    });
    expect(r).toEqual({ estado: "erro", erro: "leitura falhou" });
  });
});
