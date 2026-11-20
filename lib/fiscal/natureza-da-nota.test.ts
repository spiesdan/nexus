/**
 * A NATUREZA DA NOTA — o caso 19560, preso em teste.
 *
 * Duas NF-e autorizadas da mesma venda, R$ 70 cada: uma normal (finalidade
 * ausente → 1) e uma devolução (finalidade 4, com `ref_nfe`). Na tela as duas
 * liam "autorizada" e a soma dava R$ 140 — parece faturamento em dobro.
 *
 * A regra é a do BANCO: `coalesce(nullif(trim(finalidade), '')::int, 1)`.
 * Ausente, vazio ou inválido é **1 (venda)** — o default fiscal, não um
 * "desconhecido". Testar isso é o que impede alguém de "melhorar" a função
 * devolvendo `null` e a tela ficar sem selo.
 */
import { describe, expect, it } from "vitest";

import {
  finalidadeDaNota,
  naturezaDaNota,
  ROTULO_DA_NATUREZA,
} from "@/lib/fiscal/natureza-da-nota";

const CHAVE = "3".repeat(44);

describe("finalidade: a mesma regra do banco", () => {
  it("ausente vira 1 (venda) — não é 'desconhecido'", () => {
    expect(finalidadeDaNota(null)).toBe(1);
    expect(finalidadeDaNota({})).toBe(1);
    expect(finalidadeDaNota({ finalidade: null })).toBe(1);
  });

  it("string vazia vira 1, como no `nullif(...,'')`", () => {
    expect(finalidadeDaNota({ finalidade: "" })).toBe(1);
    expect(finalidadeDaNota({ finalidade: "   " })).toBe(1);
  });

  it("2, 3 e 4 são lidas como número ou como texto", () => {
    expect(finalidadeDaNota({ finalidade: 2 })).toBe(2);
    expect(finalidadeDaNota({ finalidade: "3" })).toBe(3);
    expect(finalidadeDaNota({ finalidade: " 4 " })).toBe(4);
  });

  it("inválida cai em 1 em vez de esconder a nota", () => {
    expect(finalidadeDaNota({ finalidade: "abc" })).toBe(1);
    expect(finalidadeDaNota({ finalidade: 9 })).toBe(1);
    expect(finalidadeDaNota({ finalidade: 0 })).toBe(1);
    expect(finalidadeDaNota({ finalidade: 1.5 })).toBe(1);
  });
});

describe("natureza + origem da devolução", () => {
  it("1 é venda, 4 é devolução com a chave da original", () => {
    const venda = naturezaDaNota({ finalidade: 1 });
    expect(venda).toEqual({ natureza: "venda", finalidade: 1, refNfe: null });

    const devolucao = naturezaDaNota({ finalidade: 4, ref_nfe: CHAVE });
    expect(devolucao.natureza).toBe("devolucao");
    expect(devolucao.refNfe).toBe(CHAVE);
  });

  it("devolução sem chave válida não inventa link", () => {
    expect(naturezaDaNota({ finalidade: 4 }).refNfe).toBeNull();
    expect(naturezaDaNota({ finalidade: 4, ref_nfe: "123" }).refNfe).toBeNull();
  });

  it("2 e 3 têm nome próprio", () => {
    expect(naturezaDaNota({ finalidade: 2 }).natureza).toBe("complementar");
    expect(naturezaDaNota({ finalidade: 3 }).natureza).toBe("ajuste");
    expect(ROTULO_DA_NATUREZA.devolucao).toBe("Devolução");
  });
});
