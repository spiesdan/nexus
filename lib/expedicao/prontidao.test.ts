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
