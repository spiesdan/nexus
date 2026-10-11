/**
 * A ASSINATURA — formato, idempotência e quando calar.
 *
 * ─── O que estes testes travam ──────────────────────────────────────────────
 *
 * 1. O formato pedido, literal: "Bill Higiene e Limpeza - Faturamento Ana".
 * 2. Retry não duplica: texto já assinado passa intacto.
 * 3. Sem setor ou sem nome, NADA é assinado — string pela metade ("Bill -
 *    Ana") confunde mais do que identifica.
 */
import { describe, expect, it } from "vitest";

import {
  aplicarAssinatura,
  montarAssinatura,
  nomeDoEmail,
  primeiroNome,
} from "@/lib/atendimento/assinatura";

describe("o formato", () => {
  it("é o pedido, literal", () => {
    expect(
      montarAssinatura({
        orgNome: "Bill Higiene e Limpeza",
        setor: "Faturamento",
        nome: "Ana",
      }),
    ).toBe("Bill Higiene e Limpeza - Faturamento Ana");
  });

  it("o outro exemplo", () => {
    expect(
      montarAssinatura({
        orgNome: "Bill Higiene e Limpeza",
        setor: "Vendedor",
        nome: "Daniel Souza",
      }),
    ).toBe("Bill Higiene e Limpeza - Vendedor Daniel");
  });

  it("vai em linha própria no fim", () => {
    const ass = montarAssinatura({ orgNome: "Org", setor: "Vendas", nome: "Ana" });
    expect(aplicarAssinatura("chegou hoje", ass)).toBe("chegou hoje\nOrg - Vendas Ana");
  });
});

describe("quando calar", () => {
  it("sem setor, null — e não meia assinatura", () => {
    expect(montarAssinatura({ orgNome: "Org", setor: null, nome: "Ana" })).toBeNull();
    expect(montarAssinatura({ orgNome: "Org", setor: "  ", nome: "Ana" })).toBeNull();
  });

  it("sem org ou sem nome, null", () => {
    expect(montarAssinatura({ orgNome: null, setor: "Vendas", nome: "Ana" })).toBeNull();
    expect(montarAssinatura({ orgNome: "Org", setor: "Vendas", nome: null })).toBeNull();
    expect(montarAssinatura({ orgNome: "Org", setor: "Vendas", nome: "   " })).toBeNull();
  });

  it("aplicar com assinatura nula não muda o texto", () => {
    expect(aplicarAssinatura("oi", null)).toBe("oi");
    expect(aplicarAssinatura(null, "Org - Vendas Ana")).toBeNull();
  });
});

describe("idempotência do retry", () => {
  it("texto já assinado passa intacto", () => {
    const ass = "Org - Vendas Ana";
    expect(aplicarAssinatura(`chegou hoje\n${ass}`, ass)).toBe(`chegou hoje\n${ass}`);
  });

  it("com espaços no fim, ainda reconhece", () => {
    const ass = "Org - Vendas Ana";
    expect(aplicarAssinatura(`chegou hoje\n${ass}   `, ass)).toBe(`chegou hoje\n${ass}   `);
  });

  it("assinatura DIFERENTE anexa — troca de atendente no meio", () => {
    // A Ana assinou, o Daniel assumiu e mandou de novo: a linha da Ana fica
    // (histórico) e a do Daniel entra. Apagar a anterior reescreveria quem
    // disse o quê.
    expect(aplicarAssinatura("oi\nOrg - Vendas Ana", "Org - Suporte Daniel")).toBe(
      "oi\nOrg - Vendas Ana\nOrg - Suporte Daniel",
    );
  });
});

describe("nomes", () => {
  it("primeiro nome", () => {
    expect(primeiroNome("Ana Paula")).toBe("Ana");
    expect(primeiroNome("  Daniel  ")).toBe("Daniel");
    expect(primeiroNome("")).toBeNull();
    expect(primeiroNome(null)).toBeNull();
  });

  it("do e-mail quando não há nome", () => {
    expect(nomeDoEmail("ana@bill.com")).toBe("ana");
    expect(nomeDoEmail(null)).toBeNull();
    expect(nomeDoEmail("sem-arroba")).toBe("sem-arroba");
  });
});
