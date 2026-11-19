/**
 * E.1 — EAN/GTIN NÃO EXISTE NO CATÁLOGO (prova da ausência, não suporte falso).
 *
 * O pedido do dono lista "busca por código/EAN/SKU". Código e SKU são a mesma
 * coluna (`codigo`); EAN/GTIN **não tem coluna** no schema de produtos. Em vez
 * de inventar suporte, o teste fixa a ausência: quem adicionar a coluna vai
 * ver este arquivo e decidir o contrato (validação de dígito, unicidade, busca).
 *
 * A prova no banco (information_schema) está em
 * `tests/invariants/catalogo-sem-ean.test.ts`, que roda no `pnpm test:db`.
 */
import { describe, expect, it } from "vitest";

import { COLUNAS_DO_PRODUTO, produtoCreateSchema } from "@/lib/schemas/produtos";

describe("catálogo não tem EAN/GTIN", () => {
  it("as colunas lidas pela tela/rota não incluem EAN, GTIN ou barcode", () => {
    expect(COLUNAS_DO_PRODUTO).not.toMatch(/\b(ean|gtin|barcode|codigo_barras)\b/i);
  });

  it("o schema de criação não aceita EAN/GTIN (campo desconhecido não entra)", () => {
    const campos = Object.keys(produtoCreateSchema.shape);
    expect(campos.some((c) => /ean|gtin|barcode|codigo_barras/i.test(c))).toBe(false);
  });

  it("o código é o identificador de busca — e aceita o que o vendedor digita", () => {
    expect(COLUNAS_DO_PRODUTO).toContain("codigo");
    expect(produtoCreateSchema.shape).toHaveProperty("codigo");
  });
});
