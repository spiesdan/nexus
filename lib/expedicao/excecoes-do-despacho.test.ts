import { describe, expect, it } from "vitest";

import { calcularExcecoesDoDespacho } from "./excecoes-do-despacho";

const agora = new Date("2026-11-24T12:00:00Z");
const cargas = [
  { id: "rota1", status: "em_rota", placa: "ABC1D23", motorista_nome: "Ana", rota_em: null, created_at: "2026-11-23T10:00:00Z" },
  { id: "mont1", status: "montando", placa: null, motorista_nome: null, rota_em: null, created_at: "2026-11-24T10:00:00Z" },
  { id: "mont2", status: "montando", placa: "ABC1234", motorista_nome: "Bia", rota_em: null, created_at: "2026-11-24T10:00:00Z" },
];
const itens = [
  { shipment_id: "rota1", order_id: "p1", status: "na_carga", separado_em: "2026-11-23T10:00:00Z" },
  { shipment_id: "mont1", order_id: "p2", status: "na_carga", separado_em: null },
  { shipment_id: "mont2", order_id: "p3", status: "na_carga", separado_em: "2026-11-24T09:00:00Z" },
];
const enderecos = new Map([["p1", "Rua A, 10 — Mafra/SC"], ["p2", null], ["p3", "Rua B, 20 — Mafra/SC"]]);

describe("exceções do despacho", () => {
  const excecoes = calcularExcecoesDoDespacho({ cargas, itens, enderecosPorPedido: enderecos, agora });
  const porChave = Object.fromEntries(excecoes.map((e) => [e.chave, e]));

  it("ordena por urgência: em rota com problema primeiro", () => {
    expect(excecoes.map((e) => e.chave)).toEqual([
      "precisa_atencao",
      "sem_localizacao",
      "sem_motorista_veiculo",
      "prontas_para_sair",
    ]);
  });

  it(" conta só o que existe, sem duplicar carga", () => {
    expect(porChave.precisa_atencao!.cargaIds).toEqual(["rota1"]);
    expect(porChave.sem_localizacao!.cargaIds).toEqual(["mont1"]);
    expect(porChave.sem_motorista_veiculo!.cargaIds).toEqual(["mont1"]);
    expect(porChave.prontas_para_sair!.cargaIds).toEqual(["mont2"]);
  });

  it("zero exceções é estado válido", () => {
    const vazias = calcularExcecoesDoDespacho({ cargas: [], itens: [], enderecosPorPedido: new Map(), agora });
    expect(vazias.every((e) => e.quantidade === 0)).toBe(true);
  });
});
