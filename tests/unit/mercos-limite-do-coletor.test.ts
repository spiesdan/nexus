/**
 * O TIMEOUT DO COLETOR TEM QUE SABER O TAMANHO DO ALVO.
 *
 * Caso real, 25/11/2026: backfill de 311 pedidos de jan–fev. O censo (296
 * páginas) levou ~13 min, o detalhe a 4 s por pedido levava mais ~21 min, e o
 * processo morreu com `coletor excedeu 1800s` — depois de importar zero. O erro
 * não dizia nem o tamanho do alvo nem o que fazer.
 */
import { describe, expect, it } from "vitest";

import { explicarEstouro, limiteDoColetor } from "../../workers/mercos/limite-do-coletor.mjs";

describe("limite do coletor do Mercos", () => {
  it("sem alvo (fluxo normal), o limite é o configurado", () => {
    expect(limiteDoColetor({ alvo: 0, baseMs: 1_800_000 })).toBe(1_800_000);
  });

  it("311 pedidos a 4 s estouram 30 min — e o limite passa a cobrir", () => {
    const limite = limiteDoColetor({ alvo: 311, esperaMs: 4000, baseMs: 1_800_000 });
    // 15 min de censo + 311×4s×2 + 5 min de margem ≈ 61,5 min
    expect(limite).toBeGreaterThan(3_600_000);
    expect(limite).toBe(900_000 + 311 * 4000 * 2 + 300_000);
  });

  it("alvo pequeno não reduz o limite de quem configurou mais", () => {
    const limite = limiteDoColetor({ alvo: 3, esperaMs: 4000, baseMs: 5_400_000 });
    expect(limite).toBe(5_400_000);
  });

  it("espera ausente cai no padrão de 3 s (zero não é 250 ms)", () => {
    // `Number(0) || 3000` → 3000: zero significa "não configurado", não
    // "sem espera". O coletor trata assim, e o limite segue a mesma régua.
    const limite = limiteDoColetor({ alvo: 10, esperaMs: 0, baseMs: 60_000 });
    expect(limite).toBe(900_000 + 10 * 3000 * 2 + 300_000);
  });

  it("espera minúscula é elevada ao piso de 250 ms", () => {
    const limite = limiteDoColetor({ alvo: 10, esperaMs: 10, baseMs: 60_000 });
    expect(limite).toBe(900_000 + 10 * 250 * 2 + 300_000);
  });

  it("a mensagem de estouro diz o tamanho do alvo e o que fazer", () => {
    const msg = explicarEstouro({ alvo: 311, esperaMs: 4000, limiteMs: 1_800_000 });
    expect(msg).toContain("311 pedido(s)");
    expect(msg).toContain("1244s"); // 311 × 4 s
    expect(msg).toContain("MERCOS_SCRAPE_TIMEOUT_MS");
  });

  it("sem alvo, a mensagem é a antiga (não inventa pedido)", () => {
    expect(explicarEstouro({ alvo: 0, esperaMs: 4000, limiteMs: 1_800_000 })).toBe(
      "coletor excedeu 1800s",
    );
  });
});
