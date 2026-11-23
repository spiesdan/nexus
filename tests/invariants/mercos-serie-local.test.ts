import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql } from "./gov-helpers";

const ORG_A = "0344aaaa-0000-4000-8000-000000000001";
const ORG_B = "0344bbbb-0000-4000-8000-000000000002";
const USER_A = "0344cccc-0000-4000-8000-000000000003";

function pedido(numero: number, cliente: string): string {
  return `jsonb_build_object(
    'numero', ${numero}, 'cliente_nome', '${cliente}', 'status', 'aprovado',
    'total_cents', 1000, 'subtotal_cents', 1000,
    'itens', jsonb_build_array(jsonb_build_object(
      'codigo', 'ITEM-${numero}', 'descricao', 'item', 'quantidade', 1,
      'subtotal_cents', 1000
    ))
  )`;
}

function importar(org: string, numero: number, cliente: string): string {
  return sql(
    `select public.fn_importar_pedido_mercos('${org}', ${pedido(numero, cliente)})::text`,
  );
}

beforeAll(() => {
  sql(`
    -- O harness pg15 não tem auth.jwt() do Supabase; o alocador o usa para
    -- separar service_role. Stub explícito só neste arquivo.
    create schema if not exists auth;
    create or replace function auth.jwt() returns jsonb language sql stable
      as $$ select '{"role":"service_role"}'::jsonb $$;
    insert into auth.users (id, email) values ('${USER_A}', 'mercos-a@nexus.test')
    on conflict (id) do nothing;
    insert into public.organizations (id, slug, display_name, legal_name)
    values ('${ORG_A}', 'mercos-a', 'Mercos A', 'Mercos A'),
           ('${ORG_B}', 'mercos-b', 'Mercos B', 'Mercos B')
    on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
    values ('${USER_A}', '${ORG_A}', 'admin', now())
    on conflict do nothing;
    -- Pedido LOCAL antigo, com número na faixa do Mercos. NÃO pode mudar.
    insert into public.commercial_orders (organization_id, numero, cliente_nome, status, origem)
    values ('${ORG_A}', 19669, 'Cliente Local 19669', 'faturado', 'vendedor');
  `);
});

describe("0344 — série local separada e colisões visíveis", () => {
  it("org nova começa em 900000; contador antigo (19722) é empurrado para 900000", () => {
    expect(sql(`select public.fn_proximo_numero_pedido('${ORG_B}')`)).toBe("900000");
    sql(`insert into public.commercial_order_counters (organization_id, ultimo_numero)
         values ('${ORG_A}', 19722)
         on conflict (organization_id) do update set ultimo_numero = 19722`);
    expect(sql(`select public.fn_proximo_numero_pedido('${ORG_A}')`)).toBe("900000");
  });

  it("a migração de dados empurra contadores antigos para 900000 (chamada direta na org B)", () => {
    expect(sql(`select public.fn_proximo_numero_pedido('${ORG_B}')`)).toBe("900001");
    expect(sql(`select public.fn_proximo_numero_pedido('${ORG_B}')`)).toBe("900002");
  });

  it("pedido local 19669 NÃO é renumerado", () => {
    expect(
      sql(`select cliente_nome from public.commercial_orders where organization_id='${ORG_A}' and numero=19669`),
    ).toBe("Cliente Local 19669");
  });

  it("colisão: Mercos entra com número da série local, mantém numero_mercos e registra os dois lados", () => {
    const r = JSON.parse(importar(ORG_A, 19669, "Cliente Mercos 19669"));
    expect(r.status).toBe("inserted");
    expect(r.numero_mercos).toBe(19669);
    expect(r.numero).toBeGreaterThanOrEqual(900000);
    expect(r.colisao).toBe(true);

    const colisao = sql(`
      select numero_mercos || '|' || cliente_mercos_nome || '|' ||
             coalesce(cliente_local_nome,'') || '|' ||
             coalesce(pedido_importado_id::text,'')
        from public.mercos_colisoes
       where organization_id='${ORG_A}' and numero_mercos=19669
    `);
    expect(colisao).toContain("Cliente Mercos 19669");
    expect(colisao).toContain("Cliente Local 19669");
    expect(colisao).not.toContain("||"); // pedido_importado_id preenchido
  });

  it("reimportar o MESMO pedido do Mercos não cria outro", () => {
    const antes = sql(`select count(*) from public.commercial_orders where organization_id='${ORG_A}'`);
    const r = JSON.parse(importar(ORG_A, 19669, "Cliente Mercos 19669"));
    expect(r.status).toBe("skipped");
    expect(r.motivo).toBe("ja_importado");
    expect(r.cliente_mercos_nome).toBe("Cliente Mercos 19669");
    expect(sql(`select count(*) from public.commercial_orders where organization_id='${ORG_A}'`)).toBe(antes);
  });

  it("número livre mantém comportamento anterior (numero =Mercos) e não abre colisão", () => {
    const r = JSON.parse(importar(ORG_A, 19670, "Cliente Mercos 19670"));
    expect(r.status).toBe("inserted");
    expect(r.numero).toBe(19670);
    expect(r.colisao).toBe(false);
    expect(
      sql(`select count(*) from public.mercos_colisoes where organization_id='${ORG_A}' and numero_mercos=19670`),
    ).toBe("0");
  });

  it("mercos_colisoes é isolada por tenant", () => {
    expect(countAs(USER_A, "select count(*) from public.mercos_colisoes")).toBe(1);
  });
});
