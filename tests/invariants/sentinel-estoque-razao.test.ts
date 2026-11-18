import { beforeAll, describe, expect, it } from "vitest";

import { countAs, lastLine, sql } from "./gov-helpers";

/**
 * A view de divergência de estoque (0321 + 0323) só é útil se:
 *
 *  1. produto SEM movimentação aparecer com `movimentos = 0`,
 *     `saldo_razao = 0` e `ultimo_movimento = null` (left join);
 *  2. produto COM movimentação somar entrada/saída certo;
 *  3. produto criado antes da 0242, sem controle de estoque ou de outra
 *     organização não vazar para a consulta.
 *
 * O item 3 é RLS de verdade: a view é `security_invoker`, então a sessão de um
 * usuário da ORG_A não enxerga o produto da ORG_B. O service role do runner
 * filtra a organização explicitamente (`coleta.ts`), e o teste confere as duas
 * camadas.
 */

const ORG_A = "a0230000-0000-4000-8000-000000000001";
const ORG_B = "b0230000-0000-4000-8000-000000000002";
const USER_A = "a0230000-1111-4000-8000-000000000001";
const USER_B = "b0230000-1111-4000-8000-000000000002";

const PRODUTO_COM = "a0230000-2222-4000-8000-000000000001";
const PRODUTO_SEM = "a0230000-2222-4000-8000-000000000002";
const PRODUTO_PEQUENO = "a0230000-2222-4000-8000-000000000003";
const PRODUTO_ANTIGO = "a0230000-2222-4000-8000-000000000004";
const PRODUTO_SEM_CONTROLE = "a0230000-2222-4000-8000-000000000005";
const PRODUTO_B = "b0230000-2222-4000-8000-000000000006";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'estoque-razao-a@invariant.test'),
      ('${USER_B}', 'estoque-razao-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'estoque-razao-a', 'Estoque A', 'Estoque A'),
      ('${ORG_B}', 'estoque-razao-b', 'Estoque B', 'Estoque B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'agent', now()),
      ('${USER_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;

    insert into public.catalog_products
      (id, organization_id, codigo, nome, preco_cents, quantidade, controla_estoque, created_at)
    values
      ('${PRODUTO_COM}', '${ORG_A}', 'A-COM', 'Com movimento', 1000, 10, true, now() - interval '2 days'),
      ('${PRODUTO_SEM}', '${ORG_A}', 'A-SEM', 'Sem movimento', 1000, 50, true, now() - interval '2 days'),
      ('${PRODUTO_PEQUENO}', '${ORG_A}', 'A-PEQ', 'Sem movimento pequeno', 1000, 5, true, now() - interval '2 days'),
      ('${PRODUTO_ANTIGO}', '${ORG_A}', 'A-ANT', 'Antes do razão', 1000, 99, true, '2026-09-24T12:00:00Z'),
      ('${PRODUTO_SEM_CONTROLE}', '${ORG_A}', 'A-NC', 'Sem controle', 1000, 77, false, now() - interval '2 days'),
      ('${PRODUTO_B}', '${ORG_B}', 'B-SEM', 'Outra org', 1000, 100, true, now() - interval '2 days')
    on conflict (id) do nothing;

    insert into public.inventory_movements
      (organization_id, product_id, tipo, quantidade, origem, created_at)
    values
      ('${ORG_A}', '${PRODUTO_COM}', 'entrada', 8, 'manual', now() - interval '1 day');
  `);
});

function linha(produto: string) {
  return sql(`
    select quantidade || '|' || saldo_razao || '|' || diferenca || '|' || movimentos || '|' ||
           coalesce(ultimo_movimento::text, 'null')
      from public.sentinel_estoque_razao
     where product_id = '${produto}';
  `);
}

describe("sentinel_estoque_razao — razão vazio também é divergência", () => {
  it("produto com movimentação soma entrada/saída e expõe a diferença", () => {
    expect(linha(PRODUTO_COM)).toMatch(/^10\|8\|2\|1\|/);
  });

  it("produto sem movimentação não desaparece: saldo_razao 0 e último movimento null", () => {
    expect(linha(PRODUTO_SEM)).toBe("50|0|50|0|null");
  });

  it("produto pequeno sem movimentação também aparece (o piso é do detector)", () => {
    expect(linha(PRODUTO_PEQUENO)).toBe("5|0|5|0|null");
  });

  it("não inclui produto anterior à 0242 nem produto sem controle de estoque", () => {
    expect(
      Number(sql(`select count(*) from public.sentinel_estoque_razao where product_id = '${PRODUTO_ANTIGO}';`)),
    ).toBe(0);
    expect(
      Number(sql(`select count(*) from public.sentinel_estoque_razao where product_id = '${PRODUTO_SEM_CONTROLE}';`)),
    ).toBe(0);
  });

  it("security_invoker: ORG_A vê 3 produtos, ORG_B vê 1, e nenhuma atravessa", () => {
    expect(countAs(USER_A, "select count(*) from public.sentinel_estoque_razao;")).toBe(3);
    expect(countAs(USER_B, "select count(*) from public.sentinel_estoque_razao;")).toBe(1);
    expect(
      countAs(
        USER_A,
        `select count(*) from public.sentinel_estoque_razao where organization_id = '${ORG_B}';`,
      ),
    ).toBe(0);
  });

  it("service role filtra a organização explicitamente (regra do runner)", () => {
    expect(
      Number(
        lastLine(
          sql(`select count(*) from public.sentinel_estoque_razao where organization_id = '${ORG_A}';`),
        ),
      ),
    ).toBe(3);
    expect(
      Number(
        lastLine(
          sql(`select count(*) from public.sentinel_estoque_razao where organization_id = '${ORG_B}';`),
        ),
      ),
    ).toBe(1);
  });
});
