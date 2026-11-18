/**
 * DUAS MIGRATIONS NÃO PODEM TER O MESMO NÚMERO.
 *
 * O `manifest-x-migrations` casa MANIFEST ↔ arquivo pela chave `NNNN_slug`. Ele
 * pega registro fantasma e arquivo sem registro, mas **não** pega o caso que
 * apareceu no PR #439 (18/11/2026): a migration nova se chamava
 * `0312_telefone_fixo_e164` e a `main` já tinha `0312_trilha_do_run_de_ia`. As
 * duas chaves são diferentes, então as duas linhas eram "válidas" e o conjunto
 * mentia sobre a ordem do schema.
 *
 * O defeito só não entrou porque o PR estava em conflito com o `baseline.sql` e
 * o rebase foi feito à mão. Numa semana em que o conflito caísse em outro
 * arquivo, o merge passaria com duas 0312 — e quem reconstruísse o schema pela
 * cadeia aplicaria uma na frente da outra sem saber qual é qual.
 *
 * A catraca é sobre o **número** e sobre o **timestamp**, porque os dois são
 * versionamento: número repetido torna a ordem ambígua para quem lê o MANIFEST;
 * timestamp repetido torna a ordem ambígua para quem aplica em ordem alfabética.
 *
 * Medido em `232c5fbf`: 300 arquivos, zero colisões. Ou seja, este teste nasce
 * verde e o que ele guarda é o futuro, não conserta passado.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "supabase", "migrations");

/**
 * `20261122150000_0320_telefone_fixo_e164.sql` → timestamp + número.
 * O arquivo herdado `00001_initial_schema.sql` não tem timestamp; ele entra na
 * checagem de NÚMERO (é o `00001`) e fica de fora só da de timestamp, porque
 * não tem um.
 */
const COM_TIMESTAMP = /^(\d{14})_(\d{4,5})_.+\.sql$/;
const SEM_TIMESTAMP = /^(\d{4,5})_.+\.sql$/;

interface Migracao {
  arquivo: string;
  timestamp: string | null;
  numero: string;
}

const migracoes: Migracao[] = readdirSync(DIR)
  .filter((arquivo) => arquivo.endsWith(".sql"))
  .map((arquivo) => {
    const comData = COM_TIMESTAMP.exec(arquivo);
    if (comData) return { arquivo, timestamp: comData[1]!, numero: comData[2]! };
    const semData = SEM_TIMESTAMP.exec(arquivo);
    if (semData) return { arquivo, timestamp: null, numero: semData[1]! };
    throw new Error(
      `nome de migration fora do padrão \`<timestamp>_<numero>_<slug>.sql\`: ${arquivo}`,
    );
  });

function colisoes(campo: "numero" | "timestamp"): string[] {
  const porValor = new Map<string, string[]>();
  for (const m of migracoes) {
    const valor = m[campo];
    if (valor === null) continue;
    const lista = porValor.get(valor) ?? [];
    lista.push(m.arquivo);
    porValor.set(valor, lista);
  }
  return [...porValor.entries()]
    .filter(([, arquivos]) => arquivos.length > 1)
    .map(([valor, arquivos]) => `${valor}: ${arquivos.join(", ")}`);
}

describe("numeração das migrations", () => {
  it("todo arquivo segue `<timestamp>_<numero>_<slug>.sql`", () => {
    // O map acima já lança no malformado; este caso existe para que a falha
    // apareça como teste, com nome, e não como erro de importação.
    expect(migracoes.length).toBeGreaterThan(0);
  });

  it("nenhum número (`NNNN`) aparece em dois arquivos", () => {
    expect(colisoes("numero")).toEqual([]);
  });

  it("nenhum timestamp aparece em dois arquivos", () => {
    expect(colisoes("timestamp")).toEqual([]);
  });
});
