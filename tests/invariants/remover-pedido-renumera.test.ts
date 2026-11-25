import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

const ORG = "0353aaaa-0000-4000-8000-000000000001";
const CARGA = "0353bbbb-0000-4000-8000-000000000002";
const P1 = "0353c001-0000-4000-8000-000000000001";
const P2 = "0353c002-0000-4000-8000-000000000002";
const P3 = "0353c003-0000-4000-8000-000000000003";

beforeAll(() => {
  sql(`
    create schema if not exists auth;
    create or replace function auth.jwt() returns jsonb language sql stable
      as $$ select '{"role":"service_role"}'::jsonb $$;
    insert into public.organizations (id, slug, display_name, legal_name)
    values ('${ORG}', 'renumera', 'Renumeracao', 'Renumeracao')
    on conflict (id) do nothing;
    insert into public.shipments (id, organization_id, numero, status)
    values ('${CARGA}', '${ORG}', 353, 'montando')
    on conflict (id) do nothing;
    insert into public.commercial_orders (id, organization_id, numero, cliente_nome, status, origem)
    values
      ('${P1}', '${ORG}', 353001, 'Um', 'aprovado', 'vendedor'),
      ('${P2}', '${ORG}', 353002, 'Dois', 'aprovado', 'vendedor'),
      ('${P3}', '${ORG}', 353003, 'Tres', 'aprovado', 'vendedor')
    on conflict (id) do nothing;
    insert into public.shipment_orders (organization_id, shipment_id, order_id, sequencia, status)
    values
      ('${ORG}', '${CARGA}', '${P1}', 1, 'na_carga'),
      ('${ORG}', '${CARGA}', '${P2}', 2, 'na_carga'),
      ('${ORG}', '${CARGA}', '${P3}', 3, 'na_carga');
  `);
});

describe("0353 — tirar pedido da carga sem furar a sequência", () => {
  it("três paradas, remove a do meio, sobra 1,2 (sem buraco nem duplicata)", () => {
    const r = sql(`select public.fn_remover_pedido_da_carga('${ORG}', '${CARGA}', '${P2}')::text`);
    expect(r).toContain('"status": "removido"');
    expect(
      sql(`select array_agg(sequencia order by sequencia)::text
             from public.shipment_orders
            where organization_id='${ORG}' and shipment_id='${CARGA}'`),
    ).toBe("{1,2}");
    // Não cria a mesma peça duas vezes nem reaplica a remoção.
    expect(
      sql(`select public.fn_remover_pedido_da_carga('${ORG}', '${CARGA}', '${P2}')::text`),
    ).toContain('"status": "nao_encontrado"');
  });

  it("pedido entregue não sai da carga", () => {
    sql(`update public.shipment_orders set status='entregue' where organization_id='${ORG}' and order_id='${P1}'`);
    expect(
      sql(`select public.fn_remover_pedido_da_carga('${ORG}', '${CARGA}', '${P1}')::text`),
    ).toContain('"status": "estado_invalido"');
  });
});
