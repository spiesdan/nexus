import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * 0335 — A ORDA EM UMA TRANSAÇÃO SÓ.
 *
 * O teste que importa não é o do caminho feliz: é o da **falha no meio**. A
 * rota antiga gravava N sequências e só depois subia `rota_versao`; se uma
 * atualização falhasse, o motorista recebia uma sequência parcial com a
 * versão velha. Aqui a RPC valida cobertura antes de escrever e faz CAS na
 * versão; qualquer exceção desfaz versão E sequências no mesmo rollback.
 */
const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`");
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    [
      "exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-",
    ],
    { input: script, encoding: "utf8" },
  ).trim();
}

const ORG = "0335aaaa-0000-4000-8000-000000000001";
const OUTRA = "0335bbbb-0000-4000-8000-000000000002";
const CARGA = "0335cccc-0000-4000-8000-000000000003";
const P1 = "0335d111-0000-4000-8000-000000000004";
const P2 = "0335d222-0000-4000-8000-000000000005";
const ESTRANHO = "0335e999-0000-4000-8000-000000000006";
const DONO = "0335f000-0000-4000-8000-000000000007";
const FN = "public.fn_salvar_ordem_rota(uuid, uuid, jsonb, jsonb, integer, timestamptz)";

function versao(): number {
  return Number(sql(`select rota_versao from public.shipments where id = '${CARGA}'`));
}

function sequencias(): string {
  return sql(`
    select coalesce(string_agg(sequencia::text, ',' order by sequencia), '')
      from public.shipment_orders where shipment_id = '${CARGA}' and organization_id = '${ORG}'
  `);
}

function chamar(itens: string, versaoEsperada: number): string {
  const out = sql(`
    select set_config('request.jwt.claims', '{"sub":"${DONO}"}', false);
    select public.fn_salvar_ordem_rota(
      '${ORG}', '${CARGA}',
      '${itens}'::jsonb,
      '{}'::jsonb,
      ${versaoEsperada},
      now()
    )::text;
  `);
  return out.split("\n").at(-1) ?? "";
}

const BOMS = JSON.stringify([
  { id: P1, sequencia: 1 },
  { id: P2, sequencia: 2 },
]);

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values ('${DONO}', 'dono-0335@nexus.test')
    on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name)
    values ('${ORG}', 'rota-atomica', 'Rota Atômica', 'Rota Atômica'),
           ('${OUTRA}', 'rota-atomica-b', 'Rota Atômica B', 'Rota Atômica B')
    on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
    values ('${DONO}', '${ORG}', 'admin', now())
    on conflict do nothing;

    insert into public.commercial_orders
      (id, organization_id, numero, cliente_nome, status, origem,
       subtotal_cents, frete_cents, total_cents)
    values ('${P1}', '${ORG}', 3351, 'PARADA 1', 'aprovado', 'vendedor', 100, 0, 100),
           ('${P2}', '${ORG}', 3352, 'PARADA 2', 'aprovado', 'vendedor', 100, 0, 100),
           ('${ESTRANHO}', '${OUTRA}', 3353, 'ESTRANHO', 'aprovado', 'vendedor', 100, 0, 100)
    on conflict (id) do nothing;

    insert into public.shipments (id, organization_id, numero, status, rota_versao)
    values ('${CARGA}', '${ORG}', 335, 'montando', 0)
    on conflict (id) do nothing;

    insert into public.shipment_orders (id, organization_id, shipment_id, order_id, sequencia)
    values ('${P1}', '${ORG}', '${CARGA}', '${P1}', 1),
           ('${P2}', '${ORG}', '${CARGA}', '${P2}', 2),
           ('${ESTRANHO}', '${OUTRA}', '${CARGA}', '${ESTRANHO}', 1)
    on conflict (id) do nothing;
  `);
});

describe("0335 — ordem de rota transacional", () => {
  it("a RPC não é alcançável por anon", () => {
    expect(sql(`select has_function_privilege('anon', '${FN}', 'execute')::text`)).toBe("false");
    expect(sql(`select has_function_privilege('authenticated', '${FN}', 'execute')::text`)).toBe("true");
  });

  it("caminho feliz: versão sobe junto com as duas sequências", () => {
    const antes = versao();
    const r = JSON.parse(chamar(BOMS, antes));
    expect(r.rota_versao).toBe(antes + 1);
    expect(r.paradas).toBe(2);
    expect(sequencias()).toBe("1,2");
  });

  it("item de outra organização: falha antes de escrever, sem versão e sem sequência nova", () => {
    const antes = versao();
    const seqAntes = sequencias();
    const ruim = JSON.stringify([
      { id: P1, sequencia: 1 },
      { id: ESTRANHO, sequencia: 2 },
    ]);
    expect(() => chamar(ruim, antes)).toThrow();
    expect(versao()).toBe(antes);
    expect(sequencias()).toBe(seqAntes);
  });

  it("cobertura parcial: falha, nada muda", () => {
    const antes = versao();
    const seqAntes = sequencias();
    const parcial = JSON.stringify([{ id: P1, sequencia: 1 }]);
    expect(() => chamar(parcial, antes)).toThrow();
    expect(versao()).toBe(antes);
    expect(sequencias()).toBe(seqAntes);
  });

  it("sequência repetida: falha, nada muda", () => {
    const antes = versao();
    const seqAntes = sequencias();
    const repetida = JSON.stringify([
      { id: P1, sequencia: 1 },
      { id: P2, sequencia: 1 },
    ]);
    expect(() => chamar(repetida, antes)).toThrow();
    expect(versao()).toBe(antes);
    expect(sequencias()).toBe(seqAntes);
  });

  it("CAS: versão velha não grava nada (outra aba venceu)", () => {
    const atual = versao();
    const seqAntes = sequencias();
    expect(() => chamar(BOMS, atual - 1)).toThrow();
    expect(versao()).toBe(atual);
    expect(sequencias()).toBe(seqAntes);
  });

  it("o item estranho continua intacto na outra organização", () => {
    expect(
      sql(`select organization_id from public.shipment_orders where id = '${ESTRANHO}'`),
    ).toBe(OUTRA);
  });
});
