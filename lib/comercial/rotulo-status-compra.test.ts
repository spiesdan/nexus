import { describe, expect, it } from "vitest";
import {
  ehStatusCompra,
  prioridadeStatusCompra,
  rotuloStatusCompra,
  STATUS_COMPRA,
  tonalidadeStatusCompra,
} from "@/lib/comercial/rotulo-status-compra";

describe("rotulo-status-compra", () => {
  it("rotula os quatro status do CHECK da migration 0243", () => {
    expect(rotuloStatusCompra("rascunho")).toBe("Rascunho");
    expect(rotuloStatusCompra("enviado")).toBe("Enviado");
    expect(rotuloStatusCompra("recebido")).toBe("Recebido");
    expect(rotuloStatusCompra("cancelado")).toBe("Cancelado");
  });

  it("status desconhecido passa cru, sem explode", () => {
    expect(rotuloStatusCompra("arquivado")).toBe("arquivado");
    expect(tonalidadeStatusCompra("arquivado")).toBe("cinza");
  });

  it("mapeia tonalidade do chip de cada status", () => {
    expect(tonalidadeStatusCompra("rascunho")).toBe("cinza");
    expect(tonalidadeStatusCompra("enviado")).toBe("azul");
    expect(tonalidadeStatusCompra("recebido")).toBe("verde");
    expect(tonalidadeStatusCompra("cancelado")).toBe("vermelho");
  });

  it("ordena rascunho → enviado → recebido → cancelado", () => {
    const ordenado = [...STATUS_COMPRA].sort((a, b) => prioridadeStatusCompra(a) - prioridadeStatusCompra(b));
    expect(ordenado).toEqual(["rascunho", "enviado", "recebido", "cancelado"]);
    expect(prioridadeStatusCompra("inesperado")).toBe(STATUS_COMPRA.length);
  });

  it("ehStatusCompra guarda o tipo e recusa o resto", () => {
    expect(ehStatusCompra("recebido")).toBe(true);
    expect(ehStatusCompra("recebido_path")).toBe(false);
  });
});