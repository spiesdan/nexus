/**
 * A LISTA DE INATIVOS — a mesma para o Radar e para a campanha.
 *
 * O que este teste prende:
 *   1. o veto de contato (STOP, opt-out, LGPD/merge) vale ANTES de a lista
 *      existir — não é a tela que filtra depois;
 *   2. a janela de dias compara com a ÚLTIMA compra;
 *   3. o recorte devolve `varridos`/`completa`, para a tela poder dizer
 *      "limitado" em vez de "todos".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { contatoPodeReceber, listarInativos } from "./inativos";

const AGORA = new Date("2026-10-26T12:00:00.000Z");

function fakeSupabase(linhas: {
  pedidos: Array<{
    contact_id: string;
    organization_id: string;
    total_cents: number;
    created_at: string;
  }>;
  contatos: Array<Record<string, unknown>>;
}): SupabaseClient {
  function consulta(tabela: string) {
    const filtros: unknown[] = [];
    const q: Record<string, unknown> = {};
    const volta = () => q;
    q.select = vi.fn(volta);
    q.eq = vi.fn((col: string, val: unknown) => {
      filtros.push([col, val]);
      return q;
    });
    q.neq = vi.fn(volta);
    q.not = vi.fn(volta);
    q.order = vi.fn(volta);
    q.limit = vi.fn(volta);
    q.in = vi.fn((col: string, val: unknown[]) => {
      filtros.push([col, "__in__", val]);
      return q;
    });
    q.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      const base = tabela === "commercial_orders" ? linhas.pedidos : linhas.contatos;
      const dados = base.filter((l) =>
        filtros.every((f) => {
          const arr = f as unknown[];
          if (arr[1] === "__in__") return (arr[2] as unknown[]).includes(l[arr[0] as string]);
          return l[arr[0] as string] === arr[1];
        }),
      );
      return Promise.resolve({ data: dados, error: null }).then(onF, onR);
    };
    return q;
  }
  return { from: (tabela: string) => consulta(tabela) } as unknown as SupabaseClient;
}

const contato = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  organization_id: "org-1",
  display_name: id,
  name: null,
  phone_number: "+5549999998888",
  is_blocked: false,
  is_anonymized: false,
  is_merged_into: null,
  consent: null,
  ...extra,
});

describe("contatoPodeReceber", () => {
  it("recusa STOP, opt-out de marketing, anonimizado e mesclado", () => {
    expect(contatoPodeReceber({ is_blocked: true })).toBe(false);
    expect(
      contatoPodeReceber({ consent: { marketing: { declined_at: "2026-01-01T00:00:00Z" } } }),
    ).toBe(false);
    expect(contatoPodeReceber({ is_anonymized: true })).toBe(false);
    expect(contatoPodeReceber({ is_merged_into: "outro-id" })).toBe(false);
  });

  it("aceita o contato limpo — e o que só tem consent nulo", () => {
    expect(contatoPodeReceber({})).toBe(true);
    expect(contatoPodeReceber({ consent: null })).toBe(true);
    expect(contatoPodeReceber({ is_blocked: false, is_anonymized: false })).toBe(true);
  });
});

describe("listarInativos", () => {
  it("só devolve quem parou de comprar e não está vetado", async () => {
    const admin = fakeSupabase({
      pedidos: [
        // Antiga (fora da janela de 90 dias) e limpa.
        { contact_id: "c-1", organization_id: "org-1", total_cents: 250000, created_at: "2026-01-01T00:00:00.000Z" },
        // Antiga, mas bloqueada por STOP.
        { contact_id: "c-2", organization_id: "org-1", total_cents: 90000, created_at: "2026-02-01T00:00:00.000Z" },
        // Comprou ontem: NÃO é inativa.
        { contact_id: "c-3", organization_id: "org-1", total_cents: 10000, created_at: "2026-10-25T00:00:00.000Z" },
      ],
      contatos: [
        contato("c-1"),
        contato("c-2", { is_blocked: true }),
        contato("c-3"),
      ],
    });

    const resultado = await listarInativos(admin, {
      organizationId: "org-1",
      dias: 90,
      agora: AGORA,
    });

    expect(resultado.lista.map((c) => c.contact_id)).toEqual(["c-1"]);
    expect(resultado.varridos).toBe(3);
    expect(resultado.completa).toBe(true);
    expect(resultado.lista[0]!.dias_sem_compra).toBeGreaterThan(90);
  });

  it("respeita o teto e marca a lista como incompleta", async () => {
    const pedidos = Array.from({ length: 3 }, (_, i) => ({
      contact_id: `c-${i}`,
      organization_id: "org-1",
      total_cents: 1000,
      created_at: "2026-01-01T00:00:00.000Z",
    }));
    const admin = fakeSupabase({
      pedidos,
      contatos: pedidos.map((p) => contato(p.contact_id)),
    });

    const resultado = await listarInativos(admin, {
      organizationId: "org-1",
      dias: 90,
      limite: 2,
      agora: AGORA,
    });

    expect(resultado.lista).toHaveLength(2);
    expect(resultado.completa).toBe(false);
  });

  it("lista vazia não consulta contatos e é completa", async () => {
    const admin = fakeSupabase({ pedidos: [], contatos: [] });
    const resultado = await listarInativos(admin, {
      organizationId: "org-1",
      dias: 30,
      agora: AGORA,
    });
    expect(resultado).toEqual({ lista: [], varridos: 0, completa: true });
  });
});
