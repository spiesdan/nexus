import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

/**
 * O CARGO `vendedor` EXISTE NAS DUAS PORTAS — e o lugar errado faz um usuário
 * "entrar na empresa" e não ver nada.
 *
 * ═══ POR QUE ISTO SÓ SE PEGA CONTRA O BANCO ══════════════════════════════
 *
 * O vocabulário de cargos tem duas portas independentes:
 *
 * 1. `user_organizations_role_check` — o CHECK que recusa gravar papel que o
 *    código não conhece. Sem ele, o convite aceita "vendedor" e o INSERT morre.
 * 2. `fn_role_at_least` — a escada de níveis que **toda política de RLS**
 *    consulta. Sem o vendedor aqui, `fn_user_role_in_org` devolve o papel, o
 *    `join levels` não acha a linha, o `coalesce` cai em `false` — e o
 *    vendedor é aceito no convite e **não enxerga nada**. Nenhum erro, nenhuma
 *    tela de erro: só um usuário que "não funciona".
 *
 * ─── A ARMADILHA DO `ai_operator` ═════════════════════════════════════════
 *
 * O TypeScript tem `ai_operator` com rank 3 e o banco não tem. Lido rápido,
 * parece divergência — e é a leitura ERRADA: `ai_operator` é o papel do
 * AGENTE publicado e nunca é gravado em `user_organizations`. Este teste
 * afirma que ele fica de fora, para que a próxima pessoa não "conserte" a
 * escada acrescentando um papel que não pertence a ela.
 */
const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`");
const containerName: string = container;

function linhas(q: string): string[] {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", q],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * A definição da função, INTEIRA e em UMA linha.
 *
 * `linhas()` quebra por `\n`, e `pg_get_functiondef` devolve um texto de
 * várias linhas — o CORPO, que é onde a escada mora, vem nas linhas depois da
 * primeira. Ler só a linha 0 é ler o `CREATE OR REPLACE` e concluir que a
 * escada não tem `vendedor`. Foi o que aconteceu na primeira rodada deste
 * arquivo: o banco estava certo e o teste é que não media.
 */
function definicaoDaFuncao(): string {
  return (
    linhas(`
      select replace(pg_get_functiondef(p.oid), chr(10), ' ')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'fn_role_at_least'
    `)[0] ?? ""
  );
}

/** O nível de um papel na escada, lido do texto da definição. */
function nivelNaEscada(def: string, papel: string): number | null {
  const m = new RegExp(`'${papel}',\\s*(\\d+)`).exec(def);
  return m?.[1] ? Number(m[1]) : null;
}

function defDoCheck(): string {
  return (
    linhas(`
      select pg_get_constraintdef(oid)
        from pg_constraint
       where conrelid = 'public.user_organizations'::regclass
         and conname = 'user_organizations_role_check'
    `)[0] ?? ""
  );
}

/** O que o TypeScript diz — importado, nunca copiado. */
async function tipos() {
  const { PAPEIS_HUMANOS } = await import("@/lib/auth/types");
  return { PAPEIS_HUMANOS };
}

describe("o cargo vendedor existe nas duas portas", () => {
  it("o CHECK de role aceita 'vendedor'", () => {
    expect(defDoCheck()).toContain("vendedor");
  });

  it("fn_role_at_least conhece 'vendedor' no nível 2", () => {
    // Comportamento, não texto: a função é o que a RLS chama, e uma menção
    // numa linha comentada passaria sem fazer nada.
    expect(nivelNaEscada(definicaoDaFuncao(), "vendedor")).toBe(2);
  });

  it("a função responde sem explodir quando a org não existe", () => {
    const r = linhas(`select public.fn_role_at_least(gen_random_uuid(), 'agent')`);
    expect(r[0]).toBe("f");
  });

  it("'vendedor' tem o MESMO nível que 'agent' — e abaixo do gerente", () => {
    const def = definicaoDaFuncao();
    expect(nivelNaEscada(def, "vendedor")).toBe(nivelNaEscada(def, "agent"));
    // É o que impede o vendedor virar gerente só por mudar de nome.
    expect(nivelNaEscada(def, "vendedor")!).toBeLessThan(nivelNaEscada(def, "manager")!);
  });

  it("ai_operator NAO entra na escada — é papel do agente, não de uma pessoa", () => {
    // Se alguém acrescentar, o invite passaria a aceitar um papel que nenhuma
    // pessoa deveria ter.
    expect(definicaoDaFuncao()).not.toMatch(/'ai_operator'/);
  });

  it("os papeis humanos do codigo sao EXATAMENTE os que o CHECK aceita", async () => {
    const { PAPEIS_HUMANOS } = await tipos();
    const noBanco = [...defDoCheck().matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
    expect(noBanco).toEqual([...PAPEIS_HUMANOS].sort());

    // É esta comparação que impede a 4ª cópia da lista de cargos de nascer:
    // quando alguém acrescentar um papel no TypeScript e esquecer o banco, o
    // convite passa a aceitar algo que o INSERT recusa — e o usuário só
    // descobre depois de clicar "Convidar".
  });

  it("a funcao continua travada: SECURITY DEFINER, search_path fechado, sem anon", () => {
    const def = definicaoDaFuncao();
    expect(def).toContain("SECURITY DEFINER");

    // O `search_path` vem do CATÁLOGO (`proconfig`), não do texto. Ler do texto
    // foi o que reprovou na primeira rodada: `pg_get_functiondef` normaliza
    // para `SET search_path TO 'public'`, e a asserção procurava
    // `= 'public'`. O valor que o Postgres usa é o do catálogo — e é nele que
    // uma função sequestrável se denuncia.
    const proconfig = linhas(`
      select p.proconfig::text
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'fn_role_at_least'
    `)[0] ?? "";
    expect(proconfig).toContain("search_path=public");

    const comAnon = linhas(`
      select has_function_privilege('anon', p.oid, 'EXECUTE')::text
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'fn_role_at_least'
    `);
    expect(comAnon[0]).toBe("false");
  });
});
