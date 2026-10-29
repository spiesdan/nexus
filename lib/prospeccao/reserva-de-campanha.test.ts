/**
 * A RESERVA DE CAMPANHA — a resposta ÚTIL antes da trava do banco.
 *
 * O trigger da 0277 é a lei, mas ele fala "23505". Esta suíte prova que a
 * checagem que roda antes dele sabe dizer QUEM já está em QUAL campanha, quem
 * está com categoria duvidosa e quem simplesmente não é da organização.
 */
import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  conflitosDeReserva,
  idsReservadosPorOutras,
  resumoDosConflitos,
} from "@/lib/prospeccao/reserva-de-campanha";

type Row = Record<string, unknown>;

/**
 * Supabase falso suficiente para as quatro leituras da reserva: select, eq, in
 * e o `await` no builder. Não pagina: os testes usam listas menores que LOTE.
 */
function clienteFalso(tabelas: Record<string, Row[]>) {
  function builder(tabela: string) {
    const filtros: Array<{ col: string; val: unknown }> = [];
    const b = {
      select() {
        return b;
      },
      eq(col: string, val: unknown) {
        filtros.push({ col, val });
        return b;
      },
      in(col: string, val: unknown[]) {
        filtros.push({ col, val });
        return b;
      },
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        const linhas = (tabelas[tabela] ?? []).filter((l) =>
          filtros.every((f) =>
            Array.isArray(f.val)
              ? f.val.some((x) => String(x) === String(l[f.col]))
              : l[f.col] === f.val,
          ),
        );
        return Promise.resolve({ data: linhas, error: null }).then(onF, onR);
      },
    };
    return b;
  }

  return {
    from(tabela: string) {
      return builder(tabela);
    },
  } as unknown as SupabaseClient;
}

const ORG = "org-1";

function prospect(over: Row = {}): Row {
  return {
    id: "p-1",
    organization_id: ORG,
    nome: "Mecânica Aliança",
    categoria: "Auto repair shop",
    categorias: [],
    website: null,
    categoria_canonica: null,
    categoria_revisar: false,
    ...over,
  };
}

describe("idsReservadosPorOutras — o que a próxima campanha NÃO pode ver", () => {
  it("reúne listas fechadas e envios, e ignora a própria campanha", async () => {
    const admin = clienteFalso({
      prospecting_campaigns: [
        {
          id: "camp-1",
          organization_id: ORG,
          nome: "Oficinas",
          prospect_ids: ["p-1"],
          contato_ids: ["c-1"],
        },
        {
          id: "camp-2",
          organization_id: ORG,
          nome: "Postos",
          prospect_ids: ["p-2"],
          contato_ids: null,
        },
      ],
      prospecting_sends: [
        { organization_id: ORG, prospect_id: "p-3", campaign_id: "camp-1" },
        { organization_id: ORG, prospect_id: "p-4", campaign_id: "camp-2" },
      ],
    });

    const vistos = await idsReservadosPorOutras(admin, ORG, "camp-1");
    // A própria campanha não aparece — senão o público da campanha se
    // autoexcluiria inteiro na tela de "quem ela alcança".
    expect(vistos.has("p-1")).toBe(false);
    expect(vistos.has("c-1")).toBe(false);
    expect(vistos.has("p-3")).toBe(false);
    // O que é da outra campanha aparece, por lista e por envio.
    expect(vistos.has("p-2")).toBe(true);
    expect(vistos.has("p-4")).toBe(true);
  });

  it("sem campanha dona, tudo é reserva — criação nova não herda lista", async () => {
    const admin = clienteFalso({
      prospecting_campaigns: [
        { id: "camp-1", organization_id: ORG, nome: "Oficinas", prospect_ids: ["p-1"], contato_ids: ["c-1"] },
      ],
      prospecting_sends: [{ organization_id: ORG, prospect_id: "p-2", campaign_id: "camp-1" }],
    });
    const vistos = await idsReservadosPorOutras(admin, ORG, null);
    expect([...vistos].sort()).toEqual(["c-1", "p-1", "p-2"]);
  });
});

describe("conflitosDeReserva — os quatro motivos, sem chutar categoria", () => {
  it("empresa de outra campanha, categoria duvidosa, categoria errada e id ausente", async () => {
    const admin = clienteFalso({
      business_prospects: [
        prospect({ id: "p-outra", nome: "Mecânica Já Escolhida" }),
        prospect({
          id: "p-revisar",
          nome: "Branca",
          categoria: "Gas station",
        }),
        prospect({ id: "p-fora", nome: "Padaria Central", categoria: "Bakery" }),
        prospect({ id: "p-ok", nome: "Mecânica Nova" }),
      ],
      contacts: [],
      prospecting_campaigns: [
        {
          id: "camp-1",
          organization_id: ORG,
          nome: "Oficinas - SC",
          prospect_ids: ["p-outra"],
          contato_ids: null,
        },
      ],
      prospecting_sends: [],
    });

    const conflitos = await conflitosDeReserva(admin, {
      organizationId: ORG,
      campaignId: null,
      prospectIds: ["p-outra", "p-revisar", "p-fora", "p-ok", "p-fantasma"],
      categorias: ["Oficina mecânica"],
    });

    const porId = new Map(conflitos.map((c) => [c.id, c]));
    expect(porId.get("p-outra")?.motivo).toBe("outra_campanha");
    expect(porId.get("p-outra")?.campanha_nome).toBe("Oficinas - SC");
    expect(porId.get("p-revisar")?.motivo).toBe("revisar");
    expect(porId.get("p-fora")?.motivo).toBe("categoria");
    expect(porId.get("p-fantasma")?.motivo).toBe("nao_encontrada");
    // A empresa classificada e da categoria pedida não gera conflito.
    expect(porId.has("p-ok")).toBe(false);
  });

  it("a própria campanha não conflita consigo mesma ao salvar de novo", async () => {
    const admin = clienteFalso({
      business_prospects: [prospect({ id: "p-1" })],
      contacts: [],
      prospecting_campaigns: [
        { id: "camp-1", organization_id: ORG, nome: "Oficinas", prospect_ids: ["p-1"], contato_ids: null },
      ],
      prospecting_sends: [],
    });

    const conflitos = await conflitosDeReserva(admin, {
      organizationId: ORG,
      campaignId: "camp-1",
      prospectIds: ["p-1"],
      categorias: ["Oficina mecânica"],
    });
    expect(conflitos).toEqual([]);
  });

  it("contato de recuperação em outra campanha também é recusado", async () => {
    const admin = clienteFalso({
      business_prospects: [],
      contacts: [
        { id: "c-1", organization_id: ORG, name: "Cliente", display_name: "Cliente" },
        { id: "c-2", organization_id: ORG, name: "Cliente Novo", display_name: "Cliente Novo" },
      ],
      prospecting_campaigns: [
        { id: "camp-1", organization_id: ORG, nome: "Recuperação", prospect_ids: null, contato_ids: ["c-1"] },
      ],
      prospecting_sends: [],
    });

    const conflitos = await conflitosDeReserva(admin, {
      organizationId: ORG,
      campaignId: null,
      contatoIds: ["c-1", "c-2"],
    });
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0]).toMatchObject({
      id: "c-1",
      motivo: "outra_campanha",
      campanha_nome: "Recuperação",
    });
  });

  it("500 empresas saem em fatias de 100 — nenhuma consulta estoura a URL", async () => {
    const ids = Array.from(
      { length: 500 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    const tamanhos: number[] = [];
    const admin = {
      from(tabela: string) {
        const b = {
          select() {
            return b;
          },
          eq() {
            return b;
          },
          in(_col: string, val: unknown[]) {
            if (tabela === "business_prospects") tamanhos.push(val.length);
            return b;
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            const data =
              tabela === "business_prospects" ? ids.map((id) => prospect({ id })) : [];
            return Promise.resolve({ data, error: null }).then(onF, onR);
          },
        };
        return b;
      },
    } as unknown as SupabaseClient;

    const conflitos = await conflitosDeReserva(admin, {
      organizationId: ORG,
      campaignId: null,
      prospectIds: ids,
      categorias: ["Oficina mecânica"],
    });

    // 400 ids eram ~15 KB e o PostgREST respondia 414 URI too long; a fatia
    // canônica de 100 fica em ~3,8 KB.
    expect(tamanhos).toEqual([100, 100, 100, 100, 100]);
    expect(conflitos).toEqual([]);
  });

  it("o resumo conta por motivo — a borda não vaza nome de empresa", () => {
    const texto = resumoDosConflitos([
      { id: "1", nome: "A", motivo: "outra_campanha" },
      { id: "2", nome: "B", motivo: "outra_campanha" },
      { id: "3", nome: "C", motivo: "revisar" },
      { id: "4", nome: "D", motivo: "categoria" },
      { id: "5", nome: "E", motivo: "nao_encontrada" },
    ]);
    expect(texto).toContain("2 já estão em outra campanha");
    expect(texto).toContain("1 com categoria a revisar");
    expect(texto).toContain("1 fora da categoria da campanha");
    expect(texto).toContain("1 não encontradas");
    expect(texto).not.toContain("A");
  });
});
