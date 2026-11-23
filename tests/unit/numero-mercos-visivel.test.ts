/**
 * DOIS NÚMEROS, UMA REGRA (decisão do dono, 23/11):
 * numero_mercos nulo ou igual ao interno → um número; diferente → os dois,
 * o do Mercos como referência secundária. Nada de tooltip escondendo dado.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  numeroMercosEhReferencia,
  rotuloNumeroDoPedido,
} from "@/components/pedidos/numero-do-pedido";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

describe("exibição dos dois números", () => {
  it("nulo ou igual ao interno → um número só", () => {
    for (const mercos of [null, undefined, 19680]) {
      expect(numeroMercosEhReferencia(19680, mercos)).toBe(false);
      expect(rotuloNumeroDoPedido(19680, mercos)).toBe("PED-19680");
    }
  });

  it("diferente → os dois, com rótulo e o do Mercos por último", () => {
    expect(numeroMercosEhReferencia(900123, 19669)).toBe(true);
    expect(rotuloNumeroDoPedido(900123, 19669)).toBe("PED-900123 · Mercos 19669");
  });

  it("390: a referência desce para a segunda linha em vez de empurrar o cliente", () => {
    const componente = ler("components/pedidos/numero-do-pedido.tsx");
    expect(componente).toContain("flex-wrap");
    expect(componente).toContain("text-xs text-muted-foreground");
    expect(componente).not.toContain("title="); // nada de tooltip escondendo o número
  });
});

describe("os quatro lugares", () => {
  it("lista de pedidos usa o componente e diz na busca que aceita os dois", () => {
    const lista = ler("app/app/pedidos/_client.tsx");
    expect(lista).toContain("NumeroDoPedido numero={p.numero}");
    expect(lista).toContain("número do Mercos");
  });

  it("ficha mostra a referência no cabeçalho e nos detalhes", () => {
    const ficha = ler("app/app/pedidos/[id]/_detalhe.tsx");
    expect(ficha).toContain("subtitle={");
    expect(ficha).toContain("Mercos ${pedido.numero_mercos}");
    expect(ficha).toContain("rotuloNumeroDoPedido(pedido.numero, pedido.numero_mercos)");
  });

  it("expedição cobre painel de pedidos e lista de paradas", () => {
    const painel = ler("app/app/expedicao/[id]/_painel-pedidos.tsx");
    expect(painel).toContain("NumeroDoPedido numero={p.numero}");
    expect(painel).toContain("p.numero_mercos");
    const paradas = ler("app/app/expedicao/[id]/_client.tsx");
    expect(paradas).toContain("NumeroDoPedido numero={i.pedido.numero}");
  });

  it("o campo é opcional até a migration 0344 entrar na main", () => {
    const pedidos = ler("lib/schemas/pedidos.ts");
    expect(pedidos).toContain("numero_mercos?: number | null");
  });
});
