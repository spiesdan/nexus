import { describe, expect, it } from "vitest";

import {
  campanhaCreateSchema,
  campanhaDeRecuperacaoSchema,
  campanhaPorRegiaoSchema,
} from "./prospeccao";

describe("nome_manual nas schemas de campanha (D-02)", () => {
  it("criação aceita a flag e o default é ausente (rota grava false)", () => {
    const comFlag = campanhaCreateSchema.parse({
      nome: "Campanha Bituruna",
      nome_manual: true,
      categorias: ["oficina"],
      cidades: [{ cidade: "Bituruna" }],
    });
    expect(comFlag.nome_manual).toBe(true);

    const semFlag = campanhaCreateSchema.parse({
      nome: "Campanha Bituruna",
      categorias: ["oficina"],
      cidades: [{ cidade: "Bituruna" }],
    });
    expect(semFlag.nome_manual).toBeUndefined();
  });

  it("recuperação e região aceitam a flag", () => {
    const rec = campanhaDeRecuperacaoSchema.parse({
      nome: "Recuperação 90 dias",
      contato_ids: ["11111111-1111-4111-8111-111111111111"],
      mensagens: ["Olá"],
      nome_manual: true,
    });
    expect(rec.nome_manual).toBe(true);

    const regiao = campanhaPorRegiaoSchema.parse({
      nome: "Campanha Bituruna",
      nome_manual: false,
      cidades: [{ cidade: "Bituruna" }],
      session_id: "22222222-2222-4222-8222-222222222222",
      mensagens: ["Olá"],
    });
    expect(regiao.nome_manual).toBe(false);
  });
});
