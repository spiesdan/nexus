/**
 * QUEM JÁ COMPROU NUMA REGIÃO — a audiência da campanha por cidade.
 *
 * O que este teste prende:
 *   1. a cidade vem do ENDEREÇO DE ENTREGA do pedido e do cadastro do contato —
 *      os dois lados, porque metade da base só tem um deles. Foi medido em
 *      produção (2026-11-12): 11.814 pedidos, 1.898 compradores, e o cadastro
 *      sozinho deixava 260 clientes de fora;
 *   2. a cidade compara SEM acento, SEM caixa e SEM o nome do estado colado
 *      ("Canoinhas" = "Canoinhas, Santa Catarina") — o PostgREST não sabe
 *      disso, e um `eq` no banco deixaria gente de fora em silêncio;
 *   3. o veto de contato é o MESMO do resto do produto (STOP, opt-out, LGPD,
 *      merge) — não é a tela que filtra depois;
 *   4. o contato entra UMA vez, somando os pedidos daquele recorte — e quem
 *      comprou em duas cidades aparece nas duas;
 *   5. pedido cancelado NÃO conta como "já atendemos" (a consulta exclui);
 *   6. telefone fora do E.164 não vira público alcançável — mas o contato
 *      continua na resposta, para a tela dizer por que ele ficou de fora.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  agruparPorCidade,
  chaveComparavel,
  cidadeCombina,
  cidadeDoEnderecoDeEntrega,
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
  endereco_entrega?: string | null;
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
  endereco_entrega: null,
  contacts: contact,
  ...extra,
});

describe("cidadeDoEnderecoDeEntrega", () => {
  it("lê a cidade do endereço em linha do Mercos", () => {
    expect(
      cidadeDoEnderecoDeEntrega(
        "RUA PAULA PEREIRA, 816, EDIFICIO, 816 — CENTRO, CANOINHAS/SC, 89460048",
      ),
    ).toEqual({ cidade: "CANOINHAS", uf: "SC" });
  });

  it("quando o estado veio colado antes da UF, a cidade é o segmento anterior", () => {
    expect(
      cidadeDoEnderecoDeEntrega(
        "RODOVIA BR 153, SN, SALA 3, SN — AREA INDUSTRIAL, GENERAL CARNEIRO, Paraná/PR, 84660000",
      ),
    ).toEqual({ cidade: "GENERAL CARNEIRO", uf: "PR" });
  });

  it("endereço sem bairro não confunde o número com a cidade", () => {
    expect(
      cidadeDoEnderecoDeEntrega("AV RIGESA, 2297, 2297 — Três Barras/SC, 89490000"),
    ).toEqual({ cidade: "Três Barras", uf: "SC" });
  });

  it("endereço sem município devolve null — quem responde é o cadastro", () => {
    expect(cidadeDoEnderecoDeEntrega("RUA DA IGREJA, 69")).toBeNull();
    expect(cidadeDoEnderecoDeEntrega("")).toBeNull();
    expect(cidadeDoEnderecoDeEntrega(null)).toBeNull();
  });
});

describe("chaveComparavel", () => {
  it("une a cidade com e sem o nome do estado colado", () => {
    expect(chaveComparavel("Canoinhas", "SC")).toBe(chaveComparavel("Canoinhas, Santa Catarina", "SC"));
    expect(chaveComparavel("Caçador", "SC")).toBe(chaveComparavel("CACADOR", "SC"));
  });

  it("reconhece o estado colado mesmo quando o cadastro veio sem UF", () => {
    expect(chaveComparavel("Canoinhas, Santa Catarina", null)).toBe(
      chaveComparavel("Canoinhas", "SC"),
    );
    expect(chaveComparavel("Lapa, Paraná", null)).toBe(chaveComparavel("LAPA", "PR"));
    // Sigla também: "Canoinhas, SC".
    expect(chaveComparavel("Canoinhas, SC", null)).toBe(chaveComparavel("Canoinhas", "SC"));
  });
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

  it("o cadastro com o estado colado casa com a cidade escolhida na tela", () => {
    expect(
      cidadeCombina("Canoinhas, Santa Catarina", "SC", [
        { cidade: "Canoinhas", estado: "SC" },
      ]),
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
  const linha = (
    contact_id: string,
    cidade: string,
    uf: string | null,
    cidades?: Array<{ cidade: string; uf: string | null }>,
  ) => ({
    contact_id,
    nome: contact_id,
    telefone: null,
    telefone_e164: null,
    cidade,
    uf,
    cidades: cidades ?? [{ cidade, uf }],
    pedidos: 1,
    total_cents: 1,
    ultimo_pedido_em: "",
  });

  it("conta CONTATOS por cidade (não pedidos) e ordena pelo maior", () => {
    const cidades = agruparPorCidade([
      linha("a", "Canoinhas", "SC"),
      linha("b", "canoinhas", "sc"),
      linha("c", "Caçador", "SC"),
    ]);

    expect(cidades).toHaveLength(2);
    expect(cidades[0]).toMatchObject({ cidade: "Canoinhas", uf: "SC", total: 2 });
    expect(cidades[1]).toMatchObject({ cidade: "Caçador", total: 1 });
  });

  it("a mesma cidade com o estado colado não vira duas linhas", () => {
    const cidades = agruparPorCidade([
      linha("a", "Canoinhas", "SC"),
      linha("b", "Canoinhas, Santa Catarina", "SC"),
    ]);

    expect(cidades).toHaveLength(1);
    expect(cidades[0]?.total).toBe(2);
  });

  it("quem comprou em duas cidades conta nas duas", () => {
    const cidades = agruparPorCidade([
      linha("a", "Canoinhas", "SC", [
        { cidade: "Canoinhas", uf: "SC" },
        { cidade: "Mafra", uf: "SC" },
      ]),
      linha("b", "Canoinhas", "SC"),
    ]);

    expect(cidades.find((c) => c.cidade === "Canoinhas")?.total).toBe(2);
    expect(cidades.find((c) => c.cidade === "Mafra")?.total).toBe(1);
  });

  it("a cidade sem UF entra na linha da cidade com UF, em vez de abrir outra", () => {
    // Medido em produção: `Canoinhas/SC` (206) + `CANOINHAS` sem UF (3) eram
    // duas linhas para a mesma cidade.
    const cidades = agruparPorCidade([
      linha("a", "Canoinhas", "SC"),
      linha("b", "CANOINHAS", null),
      linha("c", "canoinhas", null),
    ]);

    expect(cidades).toHaveLength(1);
    expect(cidades[0]).toMatchObject({ cidade: "Canoinhas", uf: "SC", total: 3 });
  });

  it("o rótulo perde o nome do estado colado, mesmo sem UF no cadastro", () => {
    const cidades = agruparPorCidade([
      linha("a", "Canoinhas, Santa Catarina", "SC"),
      linha("b", "Canoinhas, Santa Catarina", null),
    ]);

    expect(cidades).toHaveLength(1);
    expect(cidades[0]?.cidade).toBe("Canoinhas");
    expect(cidades[0]?.total).toBe(2);
  });

  it("mesmo nome em estados diferentes não se mistura", () => {
    // "Bom Sucesso" existe no PR e na PB: a UF do critério decide o público.
    const cidades = agruparPorCidade([
      linha("a", "Bom Sucesso", "PR"),
      linha("b", "Bom Sucesso", "PB"),
      linha("c", "Bom Sucesso", null),
    ]);

    expect(cidades).toHaveLength(3);
    expect(cidades.find((c) => c.uf === "PR")?.total).toBe(1);
    expect(cidades.find((c) => c.uf === "PB")?.total).toBe(1);
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

  it("a cidade do ENDEREÇO do pedido entra mesmo com o cadastro sem cidade", async () => {
    const { client } = fakeSupabase([
      pedido(contato("c-endereco", { cidade: null, uf: null }), {
        endereco_entrega: "RUA X, 10 — CENTRO, IRATI/PR, 84400000",
      }),
      pedido(contato("c-fora", { cidade: "Mafra", uf: "SC" })),
    ]);

    const resultado = await listarClientesPorRegiao(client, {
      organizationId: "org-1",
      cidades: [{ cidade: "Irati", estado: "PR" }],
    });

    expect(resultado.lista.map((c) => c.contact_id)).toEqual(["c-endereco"]);
    expect(resultado.lista[0]).toMatchObject({ cidade: "IRATI", uf: "PR" });
  });

  it("cadastro incompleto não descarta quem tem cidade no endereço", async () => {
    const { client } = fakeSupabase([
      pedido(contato("c-1", { cidade: "  ", uf: "" }), {
        endereco_entrega: "RUA Y, 20 — CENTRO, MAFRA/SC, 89300000",
      }),
    ]);

    const resultado = await listarClientesPorRegiao(client, {
      organizationId: "org-1",
      cidades: [{ cidade: "Mafra", estado: "SC" }],
    });

    expect(resultado.lista.map((c) => c.contact_id)).toEqual(["c-1"]);
  });

  it("só soma os pedidos da cidade escolhida — pedido de outra cidade não infla", async () => {
    const { client } = fakeSupabase([
      pedido(contato("c-1"), {
        total_cents: 1_000,
        created_at: "2026-10-05T12:00:00.000Z",
        endereco_entrega: "RUA A, 1 — CENTRO, CANOINHAS/SC, 89460000",
      }),
      pedido(contato("c-1"), {
        total_cents: 9_000,
        created_at: "2026-10-04T12:00:00.000Z",
        endereco_entrega: "RUA B, 2 — CENTRO, MAFRA/SC, 89300000",
      }),
    ]);

    const resultado = await listarClientesPorRegiao(client, {
      organizationId: "org-1",
      cidades: [{ cidade: "Canoinhas", estado: "SC" }],
    });

    expect(resultado.lista).toHaveLength(1);
    expect(resultado.lista[0]).toMatchObject({ pedidos: 1, total_cents: 1_000 });
    // A lista do recorte conhece só a cidade que casou: a prévia de Canoinhas
    // não pode anunciar cliente de Mafra.
    expect(resultado.lista[0]?.cidades.map((c) => c.cidade)).toEqual(["Canoinhas"]);
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
