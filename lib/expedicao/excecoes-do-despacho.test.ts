import { describe, expect, it } from "vitest";

import {
  calcularExcecoesDoDespacho,
  diasDeMontagemParada,
  HORAS_DE_MONTAGEM_PARADA,
} from "./excecoes-do-despacho";

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
      "montagem_parada",
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

describe("sem localização por coordenada (P0-2)", () => {
  it("endereço presente e pino ausente também entra — é o caso que o Resolver atende", () => {
    const comPinoPendente = calcularExcecoesDoDespacho({
      cargas: [
        {
          id: "carga",
          status: "montando",
          placa: "ABC1D23",
          motorista_nome: "Ana",
          rota_em: null,
          created_at: "2026-11-24T10:00:00Z",
        },
      ],
      itens: [
        {
          shipment_id: "carga",
          order_id: "pedido",
          status: "na_carga",
          separado_em: "2026-11-24T09:00:00Z",
        },
      ],
      enderecosPorPedido: new Map([["pedido", "Rua A, 10 — Mafra/SC"]]),
      semCoordenadaPorCarga: new Map([["carga", 2]]),
      agora,
    });
    const semLocalizacao = comPinoPendente.find((e) => e.chave === "sem_localizacao")!;
    expect(semLocalizacao.cargaIds).toEqual(["carga"]);
    // Sem pino não é "pronta para sair": o mapa ainda não foi desenhado.
    expect(comPinoPendente.find((e) => e.chave === "prontas_para_sair")!.cargaIds).toEqual([]);
  });

  it("sem o mapa de coordenadas, o comportamento antigo (endereço) continua", () => {
    const semMapa = calcularExcecoesDoDespacho({
      cargas: [
        {
          id: "carga",
          status: "montando",
          placa: "ABC1D23",
          motorista_nome: "Ana",
          rota_em: null,
          created_at: "2026-11-24T10:00:00Z",
        },
      ],
      itens: [
        {
          shipment_id: "carga",
          order_id: "pedido",
          status: "na_carga",
          separado_em: "2026-11-24T09:00:00Z",
        },
      ],
      enderecosPorPedido: new Map([["pedido", "Rua A, 10 — Mafra/SC"]]),
      agora,
    });
    expect(semMapa.find((e) => e.chave === "sem_localizacao")!.cargaIds).toEqual([]);
  });
});

describe("montagem parada (P0-3)", () => {
  const base = {
    status: "montando",
    placa: "ABC1D23",
    motorista_nome: "Ana",
    rota_em: null,
  };
  const item = {
    shipment_id: "carga",
    order_id: "pedido",
    status: "na_carga",
    separado_em: null,
  };

  function calcular(createdAt: string, status = "montando") {
    return calcularExcecoesDoDespacho({
      cargas: [{ id: "carga", ...base, status, created_at: createdAt }],
      itens: [item],
      enderecosPorPedido: new Map([["pedido", "Rua A, 10"]]),
      agora: new Date("2026-11-24T12:00:00Z"),
    }).find((e) => e.chave === "montagem_parada")!;
  }

  it("23 h não entra; 25 h entra", () => {
    expect(calcular("2026-11-23T13:00:00Z").cargaIds).toEqual([]); // 23 h
    expect(calcular("2026-11-23T11:00:00Z").cargaIds).toEqual(["carga"]); // 25 h
  });

  it("carga em rota nunca entra nessa família", () => {
    expect(calcular("2026-11-01T12:00:00Z", "em_rota").cargaIds).toEqual([]);
  });

  it("a idade mostrada é em dias inteiros e só acima do limiar", () => {
    const agora = new Date("2026-11-24T12:00:00Z");
    expect(
      diasDeMontagemParada({ status: "montando", created_at: "2026-11-23T13:00:00Z" }, agora),
    ).toBeNull();
    expect(
      diasDeMontagemParada({ status: "montando", created_at: "2026-11-23T11:00:00Z" }, agora),
    ).toBe(1);
    expect(
      diasDeMontagemParada({ status: "montando", created_at: "2026-11-08T12:00:00Z" }, agora),
    ).toBe(16);
    expect(
      diasDeMontagemParada({ status: "em_rota", created_at: "2026-11-08T12:00:00Z" }, agora),
    ).toBeNull();
    expect(HORAS_DE_MONTAGEM_PARADA).toBe(24);
  });

  it("o rótulo diz o limiar que a linha cobra", () => {
    expect(calcular("2026-11-08T12:00:00Z").rotulo).toBe("Montagem parada há mais de 24h");
  });
});
