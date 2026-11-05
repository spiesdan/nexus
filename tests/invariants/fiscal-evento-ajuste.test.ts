import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { TIPOS_DE_EVENTO } from "@/lib/fiscal/fila";

/**
 * O VOCABULÁRIO DE `fiscal_events.tipo` É O MESMO NO BANCO E NO TYPESCRIPT.
 *
 * ─── Por que este arquivo existe ────────────────────────────────────────────
 *
 * A tela de correção da nota grava `tipo = 'ajuste'` (0295). Se o CHECK do
 * banco não conhecesse esse valor, o INSERT do evento voltaria 23514 — e o
 * código trata isso como "correção gravada, evento não", que é o pior modo de
 * falha: a nota é corrigida, a timeline não conta, e quem audita a nota não
 * vê que ela foi editada à mão.
 *
 * O inverso também machuca: valor no banco e fora do TypeScript nunca é
 * emitido, e `TIPOS_DE_EVENTO` é a lista que o resto do código usa para
 * raciocinar sobre o ciclo da nota.
 *
 * ─── Por que comparar a CONSTRAINT, e não inserir uma linha ─────────────────
 *
 * Inserir exigiria organização + nota, ou seja, fixture de FK para medir uma
 * lista de strings. A constraint é a lei, e `pg_get_constraintdef` a devolve
 * literalmente — a comparação é entre o vocabulário de execução e o de compilação.
 *
 * Vive em arquivo novo (não no `vocabulario-banco-x-typescript.test.ts`) porque
 * `tests/invariants/**` é congelado por `loop/hooks/freeze-invariants.sh`:
 * arquivo novo passa, arquivo modificado é bloqueado — e afrouxar a lista
 * canônica em silêncio é exatamente o que o congelamento impede.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error(
    "TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)",
  );
}
const containerName: string = container;

function sql(query: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"],
    { input: query, encoding: "utf8" },
  ).trim();
}

describe("fiscal_events.tipo — banco x TypeScript", () => {
  const definicao = sql(`
    select pg_get_constraintdef(c.oid)
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'fiscal_events'
       and c.conname = 'fiscal_events_tipo_check';
  `);

  const doBanco = [...definicao.matchAll(/'([^']+)'/g)].map((m) => m[1]!).sort();

  it("a constraint existe e tem vocabulário legível (o instrumento não mede vazio)", () => {
    expect(definicao).toContain("CHECK");
    expect(doBanco.length).toBeGreaterThanOrEqual(2);
  });

  it("o banco aceita o evento 'ajuste' que a correção da nota grava", () => {
    expect(doBanco).toContain("ajuste");
  });

  it("as duas listas são idênticas", () => {
    expect(doBanco).toEqual([...TIPOS_DE_EVENTO].sort());
  });
});
