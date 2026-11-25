import { describe, expect, it } from "vitest";

import { prontidaoDaCarga } from "./prontidao";

const pedidos = [
  { id: "a", endereco_entrega: "Rua A, 10 — Mafra/SC" },
  { id: "b", endereco_entrega: null },
];

describe("prontidão antes de criar carga", () => {
  it("seleção com endereço cria; sem motorista é aviso, não bloqueio", () => {
    const p = prontidaoDaCarga({ selecionados: ["a"], pedidos, placa: "", motorista: "" });
    expect(p.podeCriar).toBe(true);
    expect(p.avisos).toBe(1);
    expect(p.bloqueios).toBe(0);
  });

  it("pedido sem endereço bloqueia", () => {
    const p = prontidaoDaCarga({ selecionados: ["b"], pedidos, placa: "", motorista: "Ana" });
    expect(p.podeCriar).toBe(false);
    expect(p.itens.some((i) => i.tipo === "bloqueio" && /sem endereço/.test(i.texto))).toBe(true);
  });

  it("placa inválida bloqueia", () => {
    const p = prontidaoDaCarga({ selecionados: ["a"], pedidos, placa: "fiorino", motorista: "Ana" });
    expect(p.podeCriar).toBe(false);
  });
});

describe("prontidão lê o endereço que a entrega vai usar, não só o snapshot", () => {
  // Caso real de 25/11/2026: três pedidos com endereço no CADASTRO do cliente e
  // `endereco_entrega` vazio. A tela dizia "3 pedidos sem endereço — corrija
  // antes de incluir" e travava a carga, sem lugar para corrigir.
  const semSnapshot = [
    { id: "x", endereco_entrega: null },
    { id: "y", endereco_entrega: "" },
  ];

  it("com o endereço resolvido do cadastro, NÃO bloqueia", () => {
    const p = prontidaoDaCarga({
      selecionados: ["x", "y"],
      pedidos: semSnapshot,
      placa: "ABC1D23",
      motorista: "Bill",
      enderecoResolvido: {
        x: "Rua A, 10 — Mafra/SC",
        y: "Rua B, 20 — Canoinhas/SC",
      },
    });
    expect(p.podeCriar).toBe(true);
    expect(p.itens.some((i) => /sem endereço/.test(i.texto))).toBe(false);
  });

  it("resolvido vazio continua bloqueando — ausência de verdade não vira ok", () => {
    const p = prontidaoDaCarga({
      selecionados: ["x"],
      pedidos: semSnapshot,
      placa: "ABC1D23",
      motorista: "Bill",
      enderecoResolvido: { x: null },
    });
    expect(p.podeCriar).toBe(false);
    expect(p.itens.some((i) => /1 pedidos sem endereço/.test(i.texto))).toBe(true);
  });

  it("resolvido vence o snapshot, inclusive quando o snapshot tem texto velho", () => {
    const p = prontidaoDaCarga({
      selecionados: ["x"],
      pedidos: [{ id: "x", endereco_entrega: "Rua Velha, 1" }],
      placa: "ABC1D23",
      motorista: "Bill",
      enderecoResolvido: { x: null },
    });
    // O mapa diz que NÃO há endereço utilizável (o snapshot não tem rua):
    // o mapa vence, porque é ele que a rota vai usar.
    expect(p.podeCriar).toBe(false);
  });
});
