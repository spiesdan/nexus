/**
 * QUEM JÁ COMPROU NUMA REGIÃO — a audiência da campanha por cidade.
 *
 * O que este teste prende:
 *   1. a cidade compara SEM acento e SEM caixa ("Caçador" = "Cacador") — o
 *      PostgREST não sabe disso, e um `eq` no banco deixaria gente de fora em
 *      silêncio;
 *   2. o veto de contato é o MESMO do resto do produto (STOP, opt-out, LGPD,
 *      merge) — não é a tela que filtra depois;
 *   3. o contato entra UMA vez, somando os pedidos daquele recorte;
 *   4. pedido cancelado NÃO conta como "já atendemos" (a consulta exclui);
 *   5. telefone fora do E.164 não vira público alcançável — mas o contato
 *      continua na resposta, para a tela dizer por que ele ficou de fora.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  agruparPorCidade,
  cidadeCombina,
  listarClientesPorRegiao,
} from "./clientes-por-regiao";

interface ContatoDeTeste {
  id: string;
  name?: string | null;
  display_name?: string | null;
  phone_number?: string | null;
  cidade?: string | null;
  uf?: string | null;
  is_blocked?: boolean;
  is_anonymized?: boolean;
  is_merged_into?: string | null;
  consent?: Record<string, unknown> | null;
}

interface PedidoDeTeste {
  contact_id: string | null;
  total_cents: number;
  created_at: string;
  contacts: ContatoDeTeste | ContatoDeTeste[] | null;
}

/** O mínimo do PostgREST que a função usa, com registro das chamadas. */
function fakeSupabase(pedidos: PedidoDeTeste[]) {
  const chamadas: Array<{ metodo: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "neq", "not", "order", "range"]) {
    builder[metodo] = vi.fn((...args: unknown[]) => {
      chamadas.push({ metodo, args });
      return builder;
    });
  }
  builder.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve({ data: pedidos, error: null }).then(onF, onR);

  return {
    client: { from: vi.fn(() => builder) } as unknown as SupabaseClient,
    chamadas,
  };
}

const contato = (id: string, extra: Partial<ContatoDeTeste> = {}): ContatoDeTeste => ({
  id,
  name: null,
  display_name: id,
  phone_number: "+5549999998888",
  cidade: "Canoinhas",
  uf: "SC",
  is_blocked: false,
  is_anonymized: false,
  is_merged_into: null,
  consent: null,
  ...extra,
});

const pedido = (
  contact: ContatoDeTeste | null,
  extra: Partial<PedidoDeTeste> = {},
): PedidoDeTeste => ({
  contact_id: contact?.id ?? null,
  total_cents: 10_000,
  created_at: "2026-10-01T12:00:00.000Z",
  contacts: contact,
  ...extra,
});

describe("cidadeCombina", () => {
  it("compara sem acento e sem caixa — a grafia da planilha não decide o público", () => {
    expect(
      cidadeCombina("Caçador", "SC", [{ cidade: "Cacador", estado: "SC" }]),
    ).toBe(true);
    expect(
      cidadeCombina("SAO BENTO DO SUL", "sc", [{ cidade: "São Bento do Sul", estado: "SC" }]),
    ).toBe(true);
  });

  it("quando a campanha declarou UF, a UF do contato precisa casar", () => {
    expect(cidadeCombina("Canoinhas", "PR", [{ cidade: "Canoinhas", estado: "SC" }])).toBe(
      false,
    );
    // Campanha sem UF alcança qualquer estado — é o que o operador quis dizer
    // ao não escolher.
    expect(cidadeCombina("Canoinhas", "PR", [{ cidade: "Canoinhas" }])).toBe(true);
  });

  it("contato sem cidade nunca entra; lista vazia de critério é 'todas'", () => {
    expect(cidadeCombina(null, "SC", [{ cidade: "Canoinhas", estado: "SC" }])).toBe(false);
    expect(cidadeCombina("   ", "SC", [{ cidade: "Canoinhas", estado: "SC" }])).toBe(false);
    expect(cidadeCombina("Canoinhas", "SC", [])).toBe(true);
  });
});

describe("agruparPorCidade", () => {
  it("conta CONTATOS por cidade (não pedidos) e ordena pelo maior", () => {
    const cidades = agruparPorCidade([
      { contact_id: "a", nome: "A", telefone: null, telefone_e164: null, cidade: "Canoinhas", uf: "SC", pedidos: 4, total_cents: 1, ultimo_pedido_em: "" },
      { contact_id: "b", nome: "B", telefone: null, telefone_e164: null, cidade: "canoinhas", uf: "sc", pedidos: 1, total_cents: 1, ultimo_pedido_em: "" },
      { contact_id: "c", nome: "C", telefone: null, telefone_e164: null, cidade: "Caçador", uf: "SC", pedidos: 1, total_cents: 1, ultimo_pedido_em: "" },
    ]);

    expect(cidades).toHaveLength(2);
    expect(cidades[0]).toMatchObject({ cidade: "Canoinhas", uf: "SC", total: 2 });
    expect(cidades[1]).toMatchObject({ cidade: "Caçador", total: 1 });
  });
});

describe("listarClientesPorRegiao", () => {
  it("cruza pedido com cadastro: um contato por linha, pedidos somados", async () => {
    const { client } = fakeSupabase([
      pedido(contato("c-1"), { total_cents: 5_000, created_at: "2026-10-02T12:00:00.000Z" }),
      pedido(contato("c-1"), { total_cents: 7_500, created_at: "2026-09-01T12:00:00.000Z" }),
    ]);

    const resultado = await listarClientesPorRegiao(client, {
      organizationId: "org-1",
      cidades: [{ cidade: "canoinhas", estado: "sc" }],
    });

    expect(resultado.lista).toHaveLength(1);
    expect(resultado.lista[0]).toMatchObject({
      contact_id: "c-1",
      pedidos: 2,
      total_cents: 12_500,
      telefone_e164: "+5549999998888",
      cidade: "Canoinhas",
      uf: "SC",
    });
    expect(resultado.pedidos_lidos).toBe(2);
    expect(resultado.completa).toBe(true);
  });

  it("exclui cancelado, contato de fora da cidade e contato vetado", async () => {
    const { client, chamadas } = fakeSupabase([
      pedido(contato("c-1")),
      pedido(contato("c-block", { is_blocked: true })),
      pedido(contato("c-optout", { consent: { marketing: { declined_at: "2026-01-01" } } })),
      pedido(contato("c-lgpd", { is_anonymized: true })),
      pedido(contato("c-merge", { is_merged_into: "c-1" })),
      pedido(contato("c-fora", { cidade: "Mafra" })),
    ]);

    const resultado = await listarClientesPorRegiao(client, {
      organizationId: "org-1",
      cidades: [{ cidade: "Canoinhas", estado: "SC" }],
    });

    expect(resultado.lista.map((c) => c.contact_id)).toEqual(["c-1"]);
    // A régua do "já atendemos" mora na CONSULTA: pedido cancelado não conta.
    const cancelado = chamadas.find((c) => c.metodo === "neq");
    expect(cancelado?.args).toEqual(["status", "cancelado"]);
    // E o contato embutido é da MESMA organização — vínculo cross-tenant não
    // vira público.
    expect(
      chamadas.some(
        (c) =>
          c.metodo === "eq" &&
          c.args[0] === "contacts.organization_id" &&
          c.args[1] === "org-1",
      ),
    ).toBe(true);
  });

  it("pedido sem contato (contact_id nulo) não entra", async () => {
    const { client } = fakeSupabase([
      pedido(null, { contact_id: null }),
      pedido(contato("c-1")),
    ]);
    const resultado = await listarClientesPorRegiao(client, {
      organizationId: "org-1",
      cidades: [{ cidade: "Canoinhas", estado: "SC" }],
    });
    expect(resultado.lista.map((c) => c.contact_id)).toEqual(["c-1"]);
  });

  it("telefone fora do E.164 fica na lista, mas sem `telefone_e164`", async () => {
    const { client } = fakeSupabase([
      pedido(contato("c-sem", { phone_number: null })),
      pedido(contato("c-curto", { phone_number: "1234" })),
      pedido(contato("c-ok")),
    ]);
    const resultado = await listarClientesPorRegiao(client, { organizationId: "org-1" });

    const porId = new Map(resultado.lista.map((c) => [c.contact_id, c]));
    expect(porId.get("c-sem")?.telefone_e164).toBeNull();
    expect(porId.get("c-curto")?.telefone_e164).toBeNull();
    expect(porId.get("c-ok")?.telefone_e164).toBe("+5549999998888");
  });

  it("o teto corta a lista e marca `completa: false` — nunca 'todos' por engano", async () => {
    const { client } = fakeSupabase([
      pedido(contato("c-1"), { created_at: "2026-10-03T12:00:00.000Z" }),
      pedido(contato("c-2"), { created_at: "2026-10-02T12:00:00.000Z" }),
      pedido(contato("c-3"), { created_at: "2026-10-01T12:00:00.000Z" }),
    ]);
    const resultado = await listarClientesPorRegiao(client, {
      organizationId: "org-1",
      limite: 2,
    });

    expect(resultado.lista.map((c) => c.contact_id)).toEqual(["c-1", "c-2"]);
    expect(resultado.completa).toBe(false);
  });
});
