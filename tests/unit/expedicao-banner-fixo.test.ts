/**
 * O banner da ficha da carga não flutua sobre a lista.
 *
 * ═══ O DEFEITO ═══════════════════════════════════════════════════════════
 *
 * O banner (totais + ações) é `sticky` dentro do `main` — e a TopBar é IRMÃ
 * do `main`, fora da área rolável (AppShell). O `sticky top-14` foi escrito
 * como se a TopBar rolasse junto ("gruda logo abaixo da TopBar (h-14)"), e o
 * resultado, medido em 14/10/2026: banner flutuando 80px abaixo do topo
 * visível, por cima das linhas da lista, com o texto delas vazando por trás
 * (fundo translúcido).
 *
 * O conserto: `sticky -top-6` (compensa o `p-6` do `main`, encosta flush) +
 * fundo sólido. Este teste trava as duas classes.
 *
 * ═══ POR QUE O LEITOR TIRA COMENTÁRIO ═════════════════════════════════════
 *
 * O próprio `_client.tsx` CITA `top-14` no comentário que explica o conserto.
 * Ler o arquivo cru faria o `not.toContain("top-14")` reprovar pela PRÓPRIA
 * explicação — obrigando a apagar a documentação para o teste passar. O mesmo
 * defeito do leitor da primeira versão do teste do Leaflet, e a mesma cura.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const ARQUIVO = join(RAIZ, "app/app/expedicao/[id]/_client.tsx");
const BRUTO = readFileSync(ARQUIVO, "utf8");

/** Código sem `{/* ... *\/}` nem `// ...` (fora de strings). */
function semComentario(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const CODIGO = semComentario(BRUTO);

/** A className do div do banner: o que contém `sticky`. */
function classeDoBanner(): string {
  const m = CODIGO.match(/className="([^"]*\bsticky\b[^"]*)"/);
  return m?.[1] ?? "";
}

function tokens(classe: string): string[] {
  return classe.split(/\s+/).filter(Boolean);
}

describe("banner da ficha da carga — fixo sem flutuar", () => {
  it("guarda de honestidade: o arquivo CITA top-14 (no comentário do conserto)", () => {
    // Se esta linha um dia falhar, o comentário explicativo sumiu — e sem ele
    // o próximo leitor não sabe por que `-top-6` está ali. O teste abaixo
    // precisa do leitor sem-comentário exatamente por causa desta linha.
    expect(BRUTO).toContain("top-14");
  });

  it("o banner gruda com `-top-6`, não `top-14`", () => {
    const toks = tokens(classeDoBanner());
    expect(toks).not.toHaveLength(0);
    expect(toks).toContain("-top-6");
    expect(toks).not.toContain("top-14");
  });

  it("MUTAÇÃO: voltar a `top-14` flutua o banner 80px sobre a lista", () => {
    // Medido no repro de 14/10/2026 (Playwright, scroll de 900px no main):
    // `top-14` = gap de 80px; `-top-6` = gap 0. Este teste é o que impede o
    // número antigo de voltar numa "limpeza" de classes.
    const toks = tokens(classeDoBanner());
    expect(toks).not.toContain("top-14");
  });

  it("fundo sólido — translúcido vaza as linhas por trás ao rolar", () => {
    const toks = tokens(classeDoBanner());
    expect(toks).toContain("bg-background");
    expect(toks.some((t) => t.startsWith("bg-background/"))).toBe(false);
  });

  it("z-10: acima do mapa (z-0), abaixo da TopBar (z-20) e dos modais (z-50)", () => {
    expect(tokens(classeDoBanner())).toContain("z-10");
  });
});
