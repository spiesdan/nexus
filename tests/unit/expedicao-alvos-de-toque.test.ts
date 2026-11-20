import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O piso de 44 px da expedição vive num contêiner (variantes `[&_a]`, etc.).
 * Remover a constante não quebra typecheck nem teste de componente; o número
 * volta a subir só na próxima captura. Esta guarda é o lembrete barato.
 */
describe("expedição — alvos de toque", () => {
  const arquivos = [
    "app/app/expedicao/_client.tsx",
    "app/app/expedicao/[id]/_client.tsx",
  ];

  it("as duas telas aplicam min-h-11/min-w-11 a a e button no conteúdo", () => {
    for (const arquivo of arquivos) {
      const fonte = readFileSync(path.join(process.cwd(), arquivo), "utf8");
      expect(fonte, arquivo).toContain("[&_a]:min-h-11 [&_button]:min-h-11");
      expect(fonte, arquivo).toContain("[&_a]:min-w-11 [&_button]:min-w-11");
      expect(fonte, arquivo).toContain("ALVOS_DE_TOQUE");
    }
  });
});
