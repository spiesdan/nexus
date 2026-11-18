import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * A CREDENCIAL DO APARELHO NÃO ATRAVESSA A FRONTEIRA DA ORGANIZAÇÃO.
 *
 * ═══ Por que arquivo próprio ═══════════════════════════════════════════════
 *
 * `tests/invariants/**` é congelado: arquivo novo passa, arquivo existente
 * modificado é bloqueado. E o molde do `rls-isolation` semeia um `agent` por
 * org — aqui a policy é **admin-only** (emitir bearer que cria pedido é ato de
 * administração), então o controle positivo precisa de um admin, e o negativo,
 * de um manager que NÃO enxerga. Encaixar isso naquele molde exigiria mudar a
 * régua dele.
 *
 * ═══ O que este arquivo prova ══════════════════════════════════════════════
 *
 * 1. Controle positivo: admin de A lê o aparelho de A (senão o verde seria
 *    "feature quebrada").
 * 2. Isolamento de leitura: admin de A lê ZERO aparelho de B.
 * 3. Isolamento de escrita: revogar por id de B, como admin de A, afeta ZERO
 *    linhas — é o ataque óbvio (id adivinhado) e o filtro explícito da rota
 *    tem esta mesma rede embaixo.
 * 4. Papel: `manager` de A lê ZERO (a policy é admin, de propósito).
 * 5. `anon` não tem SELECT — `revoke all` explícito, porque a anon key é
 *    pública e a tabela guarda hash de credencial.
 * 6. O banco recusa hash/prefixo fora de formato e hash duplicado: o CHECK e o
 *    UNIQUE são a última linha depois da validação da rota.
 *
 * Conectar como `postgres` mediria nada (`rolbypassrls`). Aqui é
 * `set role authenticated` + `request.jwt.claims`, o caminho da produção.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error(
    "TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)",
  );
}
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      containerName,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-f",
      "-",
    ],
    { input: script, encoding: "utf8" },
  ).trim();
}

function countAs(userId: string, countQuery: string): number {
  const out = sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${countQuery}
  `);
  const last = out.split("\n").filter(Boolean).pop();
  if (last === undefined || !/^\d+$/.test(last)) {
    throw new Error(`saída inesperada do psql: ${out}`);
  }
  return Number(last);
}

/** Executa algo como `authenticated` e devolve o erro do Postgres (ou null). */
function erroComo(userId: string, comando: string): string | null {
  try {
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        containerName,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-tA",
        "-f",
        "-",
      ],
      {
        input: `set role authenticated;
                select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
                ${comando};`,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return null;
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    return String(err.stderr ?? err.message ?? e);
  }
}

const ORG_A = "0ff1ce00-0000-4000-8000-00000000000a";
const ORG_B = "0ff1ce00-0000-4000-8000-00000000000b";
const ADMIN_A = "0ff1ce00-1111-4000-8000-00000000000a";
const MANAGER_A = "0ff1ce00-1111-4000-8000-00000000000c";
const ADMIN_B = "0ff1ce00-1111-4000-8000-00000000000b";
const APARELHO_A = "0ff1ce00-2222-4000-8000-00000000000a";
const APARELHO_B = "0ff1ce00-2222-4000-8000-00000000000b";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${ADMIN_A}',   'aparelho-admin-a@invariant.test'),
      ('${MANAGER_A}', 'aparelho-mgr-a@invariant.test'),
      ('${ADMIN_B}',   'aparelho-admin-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'aparelho-inv-a', 'Aparelho Invariant A', 'Aparelho A'),
      ('${ORG_B}', 'aparelho-inv-b', 'Aparelho Invariant B', 'Aparelho B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${ADMIN_A}',   '${ORG_A}', 'admin',   now()),
      ('${MANAGER_A}', '${ORG_A}', 'manager', now()),
      ('${ADMIN_B}',   '${ORG_B}', 'admin',   now())
      on conflict do nothing;

    delete from public.offline_devices where organization_id in ('${ORG_A}', '${ORG_B}');

    insert into public.offline_devices
      (id, organization_id, user_id, nome, token_hash, token_prefix, expires_at)
    values
      ('${APARELHO_A}', '${ORG_A}', '${ADMIN_A}', 'Celular do admin A', '${HASH_A}', 'nod_aaaa0001', now() + interval '90 days'),
      ('${APARELHO_B}', '${ORG_B}', '${ADMIN_B}', 'Celular do admin B', '${HASH_B}', 'nod_bbbb0002', now() + interval '90 days');
  `);
});

describe("offline_devices — RLS e formato", () => {
  it("admin da organização lê o próprio aparelho (controle positivo)", () => {
    expect(
      countAs(
        ADMIN_A,
        `select count(*) from public.offline_devices where organization_id = '${ORG_A}'`,
      ),
    ).toBeGreaterThan(0);
  });

  it("admin de A NÃO lê o aparelho de B", () => {
    expect(
      countAs(
        ADMIN_A,
        `select count(*) from public.offline_devices where organization_id = '${ORG_B}'`,
      ),
    ).toBe(0);
  });

  it("manager não gerencia aparelho — a régua é admin", () => {
    expect(
      countAs(
        MANAGER_A,
        `select count(*) from public.offline_devices where organization_id = '${ORG_A}'`,
      ),
    ).toBe(0);
  });

  it("revogar por id de outro tenant afeta ZERO linhas", () => {
    sql(`
      -- Deixa o aparelho de B vivo antes da tentativa.
      update public.offline_devices set revoked_at = null, revoked_by = null
       where id = '${APARELHO_B}';

      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${ADMIN_A}"}', false);
      update public.offline_devices set revoked_at = now()
       where id = '${APARELHO_B}';
    `);
    const naoRevogado = sql(`
      select count(*) from public.offline_devices
       where id = '${APARELHO_B}' and revoked_at is null;
    `);
    expect(Number(naoRevogado)).toBe(1);
  });

  it("anon não lê a tabela (o hash não é público)", () => {
    let erro: string | null = null;
    try {
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          containerName,
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-tA",
          "-f",
          "-",
        ],
        {
          input: `set role anon; select count(*) from public.offline_devices;`,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
    } catch (e) {
      const err = e as { stderr?: Buffer | string; message?: string };
      erro = String(err.stderr ?? err.message ?? e);
    }
    expect(erro).toMatch(/permission denied|negado/i);
  });

  it("o banco recusa hash fora do formato sha256 hex", () => {
    const erro = (() => {
      try {
        sql(`
          insert into public.offline_devices
            (organization_id, user_id, nome, token_hash, token_prefix, expires_at)
          values
            ('${ORG_A}', '${ADMIN_A}', 'Hash torto', 'nao-e-sha256', 'nod_cccc0003', now() + interval '30 days');
        `);
        return null;
      } catch (e) {
        const err = e as { stderr?: Buffer | string; message?: string };
        return String(err.stderr ?? err.message ?? e);
      }
    })();
    expect(erro).toMatch(/offline_devices_hash_formato/);
  });

  it("o banco recusa prefixo fora do formato nod_<8 hex>", () => {
    const erro = (() => {
      try {
        sql(`
          insert into public.offline_devices
            (organization_id, user_id, nome, token_hash, token_prefix, expires_at)
          values
            ('${ORG_A}', '${ADMIN_A}', 'Prefixo torto', '${"c".repeat(64)}', 'dsk_1234', now() + interval '30 days');
        `);
        return null;
      } catch (e) {
        const err = e as { stderr?: Buffer | string; message?: string };
        return String(err.stderr ?? err.message ?? e);
      }
    })();
    expect(erro).toMatch(/offline_devices_prefixo_formato/);
  });

  it("o mesmo hash não pode existir duas vezes", () => {
    const erro = (() => {
      try {
        sql(`
          insert into public.offline_devices
            (organization_id, user_id, nome, token_hash, token_prefix, expires_at)
          values
            ('${ORG_B}', '${ADMIN_B}', 'Cópia do hash', '${HASH_A}', 'nod_dddd0004', now() + interval '30 days');
        `);
        return null;
      } catch (e) {
        const err = e as { stderr?: Buffer | string; message?: string };
        return String(err.stderr ?? err.message ?? e);
      }
    })();
    expect(erro).toMatch(/offline_devices_token_hash_key|duplicate key/i);
  });
});
