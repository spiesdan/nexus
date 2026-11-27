import { describe, expect, it } from "vitest";

import {
  decidirDedupMaps,
  existenteDeProspect,
  type ProspectMapsExistente,
} from "./dedup-maps";

/**
 * A PROVA DE IDEMPOTÊNCIA — duas execuções do mesmo termo contra a mesma base.
 *
 * O primeiro run grava 2 novos e reconhece 1 existente (telefone). O segundo
 * run, com o MESMO lote, tem de dar:
 *   - 0 linha nova (store não cresce);
 *   - 0 linha duplicada (ninguém insere de novo);
 *   - todos os 3 casando pelo degrau 1 (place_id).
 *
 * Não é afirmação: os números saem das decisões abaixo.
 */
const LOTE = [
  { placeId: "ChIJ1", telefone: "(47) 99999-1111", nome: "Oficina Um", cep: "89460-000" },
  { placeId: "ChIJ2", telefone: "(47) 99999-2222", nome: "Oficina Dois", cep: "89460-001" },
  { placeId: "ChIJ3", telefone: "(47) 3333-4444", nome: "Auto Peças Três", cep: "89460-002" },
];

function rodar(base: ProspectMapsExistente[]) {
  let novas = 0;
  let duplicadas = 0;
  let inseridas = 0;
  const degraus: string[] = [];

  for (const c of LOTE) {
    const d = decidirDedupMaps(c, base);
    degraus.push(d.degrau);
    if (!d.gravar) {
      duplicadas++;
      continue;
    }
    // Provável conta como já existia, mas grava; novo é Nova.
    if (d.degrau === "provavel") duplicadas++;
    else novas++;
    inseridas++;
    base.push({
      id: `p-${c.placeId}`,
      placeId: c.placeId,
      telefone: c.telefone,
      nome: c.nome,
      cep: c.cep,
    });
  }
  return { novas, duplicadas, inseridas, degraus };
}

describe("idempotência Maps em duas execuções", () => {
  it("run 1 grava 3; run 2 dá 0 nova e 0 inserida (3 place_id)", () => {
    const base: ProspectMapsExistente[] = [];
    const run1 = rodar(base);
    expect(run1).toMatchObject({ novas: 3, duplicadas: 0, inseridas: 3 });
    expect(base).toHaveLength(3);

    const run2 = rodar(base);
    expect(run2).toMatchObject({ novas: 0, inseridas: 0, duplicadas: 3 });
    expect(run2.degraus).toEqual(["place_id", "place_id", "place_id"]);
    expect(base).toHaveLength(3);
  });

  it("a base vinda de business_prospects também casa por place_id", () => {
    const base = [
      existenteDeProspect({
        id: "p1",
        external_id: "maps:ChIJ1",
        telefone_normalizado: "+5547999991111",
        nome: "Oficina Um",
        cep: "89460-000",
      }),
    ];
    const d = decidirDedupMaps(LOTE[0]!, base);
    expect(d.degrau).toBe("place_id");
    expect(d.gravar).toBe(false);
  });
});
