import { describe, expect, it } from "vitest";

import {
  decidirDedupMaps,
  existenteDeProspect,
  placeIdDeExternalId,
  type ProspectMapsExistente,
} from "./dedup-maps";

/**
 * Os três degraus do plano v5 (§3), com os casos que decidem:
 * - place_id é identidade (não duplica);
 * - telefone E.164 casa com e sem +55/DDD e com pontuação;
 * - nome + CEP (ou nome + cidade + logradouro, sem CEP) é PROVÁVEL: conta como
 *   "já existia" mas NÃO bloqueia a gravação.
 */

const EXISTENTE: ProspectMapsExistente = {
  id: "p1",
  placeId: "ChIJAAA",
  telefone: "+5547999999999",
  nome: "Oficina do Zé",
  cep: "89460-000",
  endereco: "Rua das Flores, 123 - Centro, Canoinhas - SC",
  cidade: "Canoinhas",
  logradouro: "Rua das Flores",
};

describe("dedup Maps — degrau 1: place_id", () => {
  it("mesmo place_id não grava de novo (idempotência)", () => {
    const d = decidirDedupMaps(
      { placeId: "ChIJAAA", telefone: null, nome: "Outro nome qualquer" },
      [EXISTENTE],
    );
    expect(d.degrau).toBe("place_id");
    expect(d.gravar).toBe(false);
    expect(d.comQuem).toBe("p1");
  });

  it("place_id diferente não é identidade", () => {
    const d = decidirDedupMaps(
      { placeId: "ChIJBBB", telefone: null, nome: "Sem relação" },
      [EXISTENTE],
    );
    expect(d.degrau).toBe("novo");
  });

  it("extrai place_id de external_id maps:", () => {
    expect(placeIdDeExternalId("maps:ChIJAAA")).toBe("ChIJAAA");
    expect(placeIdDeExternalId("ChIJAAA")).toBe("ChIJAAA");
    expect(placeIdDeExternalId(null)).toBeNull();
  });
});

describe("dedup Maps — degrau 2: telefone E.164", () => {
  it("casa com DDD e +55 em formatos diferentes", () => {
    const d = decidirDedupMaps(
      { placeId: "ChIJNOVO", telefone: "(47) 99999-9999", nome: "Nome divergente" },
      [EXISTENTE],
    );
    expect(d.degrau).toBe("telefone");
    expect(d.gravar).toBe(false);
    expect(d.comQuem).toBe("p1");
  });

  it("casa telefone sem DDI (+55) e sem máscara", () => {
    const d = decidirDedupMaps(
      { placeId: null, telefone: "47999999999", nome: "Outra grafia" },
      [EXISTENTE],
    );
    expect(d.degrau).toBe("telefone");
  });

  it("telefone fixo de 10 dígitos com DDD também normaliza", () => {
    const existente = { ...EXISTENTE, telefone: "+554733334444" };
    const d = decidirDedupMaps(
      { placeId: null, telefone: "(47) 3333-4444", nome: "Oficina" },
      [existente],
    );
    expect(d.degrau).toBe("telefone");
  });

  it("telefone diferente não decide", () => {
    const d = decidirDedupMaps(
      { placeId: "ChIJNOVO", telefone: "(47) 98888-7777", nome: "Sem relação" },
      [EXISTENTE],
    );
    expect(d.degrau).toBe("novo");
  });
});

describe("dedup Maps — degrau 3: nome + CEP/endereço (provável)", () => {
  it("mesmo nome + CEP conta como existente, mas grava", () => {
    const d = decidirDedupMaps(
      { placeId: null, telefone: null, nome: "OFICINA DO ZÉ LTDA", cep: "89460-000" },
      [EXISTENTE],
    );
    expect(d.degrau).toBe("provavel");
    expect(d.gravar).toBe(true);
    expect(d.contaComoExistente).toBe(true);
    expect(d.comQuem).toBe("p1");
  });

  it("sem CEP, cai para nome + cidade + logradouro", () => {
    const d = decidirDedupMaps(
      {
        placeId: null,
        telefone: null,
        nome: "Oficina do Zé",
        cidade: "Canoinhas",
        logradouro: "Rua das Flores",
      },
      [EXISTENTE],
    );
    expect(d.degrau).toBe("provavel");
    expect(d.gravar).toBe(true);
  });

  it("mesmo nome em cidade diferente NÃO é provável", () => {
    const d = decidirDedupMaps(
      {
        placeId: null,
        telefone: null,
        nome: "Oficina do Zé",
        cidade: "Joinville",
        logradouro: "Rua das Flores",
      },
      [EXISTENTE],
    );
    expect(d.degrau).toBe("novo");
  });

  it("nome diferente com o mesmo CEP não é provável", () => {
    const d = decidirDedupMaps(
      { placeId: null, telefone: null, nome: "Padaria Nova", cep: "89460-000" },
      [EXISTENTE],
    );
    expect(d.degrau).toBe("novo");
  });
});

describe("dedup Maps — leitura das colunas de business_prospects", () => {
  it("monta o existente a partir de external_id/telefone_normalizado", () => {
    const e = existenteDeProspect({
      id: "p9",
      external_id: "maps:ChIJ999",
      telefone_normalizado: "+5547999999999",
      nome: "Oficina do Zé",
      cep: "89460-000",
    });
    expect(e.placeId).toBe("ChIJ999");
    expect(e.telefone).toBe("+5547999999999");
  });
});
