import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * D3 — toda capacidade classificada nos 7 estados, sem linha sem prova.
 *
 * A classificação vive em `docs/auditoria/29-capacidades.md`. O que este gate
 * impede é o modo de falha clássico de inventário: a tabela envelhece, ganha
 * linha "existente" sem evidência, ou inventa um oitavo estado ("ok", "feito",
 * "sim") que ninguém sabe ler. Também impede a tabela de encolher sem alguém
 * decidir que uma capacidade deixou de existir.
 */
const RAIZ = path.resolve(__dirname, "../..");
const DOC = path.join(RAIZ, "docs/auditoria/29-capacidades.md");

const ESTADOS = new Set([
  "existente",
  "parcial",
  "com defeito",
  "planejada",
  "ausente",
  "legado",
  "não verificada",
]);

interface Linha {
  numero: number;
  capacidade: string;
  estado: string;
  evidencia: string;
}

function linhas(): Linha[] {
  const texto = readFileSync(DOC, "utf8");
  const saida: Linha[] = [];
  for (const linha of texto.split("\n")) {
    const m = /^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|/.exec(linha);
    if (!m) continue;
    saida.push({
      numero: Number(m[1]),
      capacidade: m[2]!,
      estado: m[3]!.trim(),
      evidencia: m[4]!,
    });
  }
  return saida;
}

describe("D3 — capacidades classificadas", () => {
  it("a tabela existe e cobre o produto (≥ 25 capacidades)", () => {
    expect(linhas().length).toBeGreaterThanOrEqual(25);
  });

  it("todo estado está na escala dos 7", () => {
    const invalidos = linhas()
      .filter((l) => !ESTADOS.has(l.estado))
      .map((l) => `#${l.numero} (${l.capacidade}): ${l.estado}`);
    expect(invalidos, "estado fora da escala de 7").toEqual([]);
  });

  it("toda linha tem evidência escrita (não 'ok' nem vazio)", () => {
    const sem = linhas()
      .filter((l) => l.evidencia.replace(/\|.*/, "").trim().length < 3)
      .map((l) => `#${l.numero}: ${l.capacidade}`);
    expect(sem, "capacidade sem evidência").toEqual([]);
  });

  it("as capacidades centrais estão todas presentes", () => {
    const texto = readFileSync(DOC, "utf8").toLowerCase();
    for (const chave of [
      "crm",
      "inbox",
      "follow-up",
      "pedidos",
      "financeiro",
      "fiscal",
      "lgpd",
      "mobile",
      "administração",
      "auditoria",
    ]) {
      expect(texto, `capacidade central ausente: ${chave}`).toContain(chave);
    }
  });
});
