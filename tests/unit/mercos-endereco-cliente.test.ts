import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  cacheValido,
  carregarCache,
  chaveCache,
  lerEnderecoDaFicha,
  salvarCache,
  selecionarParaEnriquecer,
  temEndereco,
} from "../../workers/mercos/endereco-cliente.mjs";

describe("endereço lido da ficha do cliente", () => {
  it("ficha completa: todos os campos, sem inventar nada", () => {
    const r = lerEnderecoDaFicha([
      "Dados do cliente",
      "Logradouro: Rua das Palmeiras",
      "Nº: 123",
      "Complemento: Sala 4",
      "Bairro: Centro",
      "CEP: 89300-000",
      "Cidade: Mafra",
      "UF: SC",
    ]);
    expect(r).toEqual({
      logradouro: "Rua das Palmeiras",
      numero_end: "123",
      complemento: "Sala 4",
      bairro: "Centro",
      cep: "89300-000",
      cidade: "Mafra",
      uf: "SC",
    });
    expect(temEndereco(r)).toBe(true);
  });

  it("rótulo e valor em linhas separadas", () => {
    const r = lerEnderecoDaFicha(["Logradouro", "Av. Brasil", "Bairro", "Vila Nova", "CEP", "89300-001"]);
    expect(r.logradouro).toBe("Av. Brasil");
    expect(r.bairro).toBe("Vila Nova");
    expect(r.cep).toBe("89300-001");
  });

  it("ficha sem endereço devolve null — não inventa", () => {
    const r = lerEnderecoDaFicha([
      "Cliente", "Listar todos clientes", "ABBASPEL INDUSTRIA E COMERCIO DE PAPEIS",
      "- 04.490.046/0001-97", "(42) 3521-7300", "Porto União, Santa Catarina",
    ]);
    expect(Object.values(r).every((v) => v === null)).toBe(true);
    expect(temEndereco(r)).toBe(false);
  });

  it("linha que começa com N não vira número (não é rótulo)", () => {
    expect(lerEnderecoDaFicha(["NUTRI CAMPO STILL"]).numero_end).toBeNull();
  });

  it("cidade com UF colada é separada sem inventar o resto", () => {
    const r = lerEnderecoDaFicha(["Cidade: Mafra, SC"]);
    expect(r.cidade).toBe("Mafra");
    expect(r.uf).toBe("SC");
  });
});

describe("cache por documento com validade", () => {
  const agora = Date.parse("2026-11-23T12:00:00Z");
  const endereco = lerEnderecoDaFicha(["Logradouro: Rua A", "Bairro: Centro"]);

  it("chave é o documento só com dígitos", () => {
    expect(chaveCache("04.490.046/0001-97")).toBe("04490046000197");
    expect(chaveCache(null)).toBeNull();
  });

  it("30 dias: fresco vale, velho não", () => {
    expect(cacheValido({ lido_em: "2026-11-01T12:00:00Z", endereco }, agora)).toBe(true);
    expect(cacheValido({ lido_em: "2026-10-01T12:00:00Z", endereco }, agora)).toBe(false);
  });

  it("seleciona só sem cache válido, com teto (fatiamento)", () => {
    const docs = ["11111111111111", "22222222222222", "33333333333333"];
    const cache = { "22222222222222": { lido_em: "2026-11-20T12:00:00Z", endereco } };
    expect(selecionarParaEnriquecer(docs, cache, 1)).toEqual(["11111111111111"]);
  });

  it("grave e relê; arquivo corrompido não derruba", () => {
    const dir = mkdtempSync(join(tmpdir(), "mercos-cache-"));
    const caminho = join(dir, "enderecos.json");
    const cache = { "111": { lido_em: "2026-11-23T12:00:00Z", endereco } };
    salvarCache(caminho, cache);
    expect(carregarCache(caminho, agora)["111"]).toEqual(cache["111"]);
    writeFileSync(caminho, "truncado");
    expect(carregarCache(caminho, agora)).toEqual({});
  });
});
