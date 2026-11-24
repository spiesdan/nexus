import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql, writeCountAs } from "./gov-helpers";

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

    -- Prova comportamental de RLS das três tabelas de reconciliação (0347).
    insert into public.mercos_colisoes (organization_id, numero_mercos, cliente_mercos_nome)
    values ('${ORG_A}', 99991, 'A'), ('${ORG_B}', 99992, 'B');
    insert into public.mercos_reconciliacoes (organization_id, run_id, numero_mercos, situacao)
    values ('${ORG_A}', 'prova-a', 99991, 'ausente'), ('${ORG_B}', 'prova-b', 99992, 'ausente');
    insert into public.mercos_reconciliacoes_runs (organization_id, run_id, censo_lido)
    values ('${ORG_A}', 'prova-a', 1), ('${ORG_B}', 'prova-b', 1);
  `);
});

describe("0344 — série local separada e colisões visíveis", () => {
  it("org nova começa em 70000; contador antigo (19722) é empurrado para 70000", () => {
    expect(sql(`select public.fn_proximo_numero_pedido('${ORG_B}')`)).toBe("70000");
    sql(`insert into public.commercial_order_counters (organization_id, ultimo_numero)
         values ('${ORG_A}', 19722)
         on conflict (organization_id) do update set ultimo_numero = 19722`);
    expect(sql(`select public.fn_proximo_numero_pedido('${ORG_A}')`)).toBe("70000");
  });

  it("série local segue 70001, 70002 ... (chamada direta na org B)", () => {
    expect(sql(`select public.fn_proximo_numero_pedido('${ORG_B}')`)).toBe("70001");
    expect(sql(`select public.fn_proximo_numero_pedido('${ORG_B}')`)).toBe("70002");
    sql(`insert into public.commercial_order_counters (organization_id, ultimo_numero)
         values ('${ORG_B}', 70006)
         on conflict (organization_id) do update set ultimo_numero = 70006`);
    expect(sql(`select public.fn_proximo_numero_pedido('${ORG_B}')`)).toBe("70007");
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
    expect(r.numero).toBeGreaterThanOrEqual(70000);
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

  it("0348: prova ponta a ponta — contato vazio passa a ter rua, e não sobrescreve o operador", () => {
    const doc = "04490046000197";
    const contato = "0344eeee-0000-4000-8000-000000000010";
    const pedido = 19732;
    sql(`
      insert into public.contacts (id, organization_id, name, cnpj, source_metadata)
      values ('${contato}', '${ORG_A}', 'ABBASPEL', '${doc}',
              jsonb_build_object('mercos', jsonb_build_object('documento', '04.490.046/0001-97')));
      insert into public.commercial_orders (organization_id, numero, contact_id, cliente_nome, status, origem)
      values ('${ORG_A}', ${pedido}, '${contato}', 'ABBASPEL', 'aprovado', 'mercos');
    `);
    const antes = sql(`select coalesce(logradouro, '<null>') from public.contacts where id='${contato}'`);
    const endereco = `jsonb_build_object(
      'logradouro', 'Rua das Palmeiras', 'numero_end', '123', 'bairro', 'Centro',
      'cep', '89300-000', 'cidade', 'Mafra', 'uf', 'SC'
    )`;
    expect(sql(`select public.fn_mercos_enriquecer_endereco('${ORG_A}', '${doc}', ${endereco})::text`))
      .toContain('"status": "atualizado"');
    const depois = sql(`select coalesce(logradouro, '<null>') || '|' || coalesce(bairro, '<null>') from public.contacts where id='${contato}'`);
    console.info(
      `[0348] contato ${contato} (pedido Mercos ${pedido}): ` +
      `antes logradouro=${antes} → depois logradouro=${depois}`,
    );
    expect(antes).toBe("<null>");
    expect(depois).toBe("Rua das Palmeiras|Centro");

    // O operador corrigiu e o ERP não pode desfazer.
    sql(`update public.contacts set logradouro = 'Rua Corrigida Pelo Operador' where cnpj='${doc}'`);
    const outro = `jsonb_build_object('logradouro', 'Rua Errada Do Erp', 'bairro', 'Outro')`;
    sql(`select public.fn_mercos_enriquecer_endereco('${ORG_A}', '${doc}', ${outro})`);
    expect(sql(`select logradouro from public.contacts where cnpj='${doc}'`))
      .toBe("Rua Corrigida Pelo Operador");
  });

  it("as três tabelas de reconciliação são isoladas por tenant e negam escrita a authenticated", () => {
    const inserts: Record<string, string> = {
      mercos_colisoes: `insert into public.mercos_colisoes (organization_id, numero_mercos) values ('${ORG_A}', 99999)`,
      mercos_reconciliacoes: `insert into public.mercos_reconciliacoes (organization_id, run_id, numero_mercos) values ('${ORG_A}', 'x', 99999)`,
      mercos_reconciliacoes_runs: `insert into public.mercos_reconciliacoes_runs (organization_id, run_id) values ('${ORG_A}', 'x')`,
    };
    for (const [tabela, insert] of Object.entries(inserts)) {
      expect(countAs(USER_A, `select count(*) from public.${tabela} where organization_id='${ORG_A}'`))
        .toBeGreaterThan(0);
      expect(countAs(USER_A, `select count(*) from public.${tabela} where organization_id='${ORG_B}'`))
        .toBe(0);
      expect(writeCountAs(USER_A, insert)).toBe(0);
    }
  });
});
