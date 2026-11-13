import { describe, expect, it } from "vitest";

import {
  chaveDoDestino,
  enderecoEfetivo,
  nomeAvulsoNormalizado,
  snapshotDoDestino,
  type ContatoParaDestino,
} from "./destinos";

/**
 * O DESTINO É O ENDEREÇO, NÃO O CLIENTE (prompt §2).
 *
 * Estes testes travam o defeito que existia: a parada já era agrupada por
 * endereço, mas a coordenada vinha do `contact_id` — dois endereços do mesmo
 * cliente dividiam o mesmo pino, e corrigir um movia o outro.
 */

const contato: ContatoParaDestino = {
  id: "c1",
  logradouro: "Rua A",
  numero_end: "100",
  complemento: null,
  bairro: "Centro",
  cidade: "Canoinhas",
  uf: "SC",
  cep: "89460-000",
  latitude: -26.17,
  longitude: -50.39,
};

describe("chave do destino", () => {
  it("mesmo cliente e mesmo endereço são o mesmo destino", () => {
    const a = chaveDoDestino("c1", "Mercado Central", "Rua A, 100");
    const b = chaveDoDestino("c1", "Mercado Central", "Rua A, 100");
    expect(a).toBe(b);
  });

  it("mesmo cliente com endereços diferentes são destinos diferentes (teste 1)", () => {
    const a = chaveDoDestino("c1", "Mercado Central", "Rua A, 100");
    const b = chaveDoDestino("c1", "Mercado Central", "Rua B, 500");
    expect(a).not.toBe(b);
  });

  it("endereço alterado muda a chave — o histórico não é reescrito (teste 3)", () => {
    const antes = chaveDoDestino("c1", "Mercado Central", "Rua A, 100");
    const depois = chaveDoDestino("c1", "Mercado Central", "Rua A, 120");
    expect(antes).not.toBe(depois);
  });

  it("avulso normaliza o nome igual ao agrupamento de paradas", () => {
    expect(nomeAvulsoNormalizado("João  SILVA")).toBe("joao silva");
    expect(chaveDoDestino(null, "João  Silva", "Rua A, 100")).toBe("avulso:joao silva::Rua A, 100");
  });

  it("sem endereço a chave cai no cliente — não inventa destino", () => {
    expect(chaveDoDestino("c1", "Mercado Central", null)).toBe("c1");
    expect(chaveDoDestino("c1", "Mercado Central", "   ")).toBe("c1");
  });
});

describe("endereço efetivo e snapshot", () => {
  it("o endereço do pedido com rua vence o cadastro", () => {
    expect(enderecoEfetivo("Rua B, 500", contato)).toBe("Rua B, 500");
  });

  it("endereço do pedido sem rua cede lugar ao cadastro", () => {
    const semRua = snapshotDoDestino(contato, "Mercado Central", "500");
    expect(semRua.endereco).toBe("Rua A, 100 — Centro, Canoinhas/SC, 89460-000");
    expect(semRua.chave).toContain("Rua A");
  });

  it("o snapshot guarda as partes do endereço e a coordenada vigente", () => {
    const s = snapshotDoDestino(contato, "Mercado Central", "Rua A, 100");
    expect(s).toMatchObject({
      contact_id: "c1",
      numero: "100",
      bairro: "Centro",
      cidade: "Canoinhas",
      uf: "SC",
      latitude: -26.17,
      longitude: -50.39,
      geo_status: "ok",
    });
  });

  it("sem endereço nasce como não encontrado, não como pendente para sempre", () => {
    const s = snapshotDoDestino(null, "Avulso", null);
    expect(s.geo_status).toBe("nao_encontrado");
    expect(s.latitude).toBeNull();
  });

  it("cadastro sem coordenada nasce pendente e sem fonte", () => {
    const s = snapshotDoDestino({ ...contato, latitude: null, longitude: null }, "Mercado Central", "Rua A, 100");
    expect(s.geo_status).toBe("pendente");
    expect(s.geo_fonte).toBeNull();
  });

  it("pino manual do cadastro não é herdado como fonte do destino sem coordenada", () => {
    const s = snapshotDoDestino({ ...contato, latitude: null, longitude: null, geo_fonte: "manual" }, "X", "Rua A, 100");
    expect(s.geo_fonte).toBeNull();
  });
});
