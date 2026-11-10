import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * 0301 · O CADASTRO DO MERCOS É O CADASTRO DO CRM: UM PRA UM.
 *
 * O importador arquivado (`docs/legacy/mercos-scrape/importar-mercos.ts`) criava
 * o mesmo cliente duas vezes: a ficha nova nascia com a segunda tag
 * `mercos:pedido-sem-cadastro` (stub) e o lote vinha sem dedupe entre os próprios
 * pedidos do mesmo cliente. A correção é dupla:
 *
 *   1. a importação casa o contato por documento (CNPJ/CPF) → nome → telefone
 *      e SÓ cria ficha quando o cliente realmente não existe; e
 *   2. a fusão (`fn_mercos_fundir_duplicados`) recolhe os duplicados históricos
 *      com a regra do dono: mesmo nome normalizado + mesma cidade funde; mesmo
 *      nome com documento divergente mantém os dois.
 *
 * Prova contra Postgres real porque as regras são do banco (funções SECURITY
 * DEFINER): é a função que decide o que é o mesmo cliente.
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
      "exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-",
    ],
    { input: script, encoding: "utf8" },
  ).trim();
}

const ORG = "0301aaaa-0000-4000-8000-000000000001";
const ORG_CONFLICTO = "0301aaaa-0000-4000-8000-000000000002";

interface PedidoMercos {
  numero: number;
  status: string;
  cliente_nome: string;
  cliente_documento?: string | null;
  cliente?: { razao?: string | null; documento?: string | null; telefone?: string | null; cidade?: string | null };
  subtotal_cents?: number;
  frete_cents?: number;
  total_cents: number;
  created_at?: string;
  itens: {
    codigo: string;
    descricao: string;
    quantidade: number;
    preco_unit_cents: number;
    subtotal_cents: number;
  }[];
}

function payloadDoMercos(over: Partial<PedidoMercos> = {}): PedidoMercos {
  return {
    numero: 9201,
    status: "faturado",
    cliente_nome: "CLIENTE UNICO",
    cliente_documento: "45.678.912/0001-77",
    cliente: {
      razao: "CLIENTE UNICO",
      documento: "45.678.912/0001-77",
      telefone: null,
      cidade: "Mafra, SC",
    },
    subtotal_cents: 1_000,
    frete_cents: 0,
    total_cents: 1_000,
    created_at: "2026-11-10T15:00:00.000Z",
    itens: [
      { codigo: "P0301", descricao: "ITEM DO MERCOS", quantidade: 1, preco_unit_cents: 1_000, subtotal_cents: 1_000 },
    ],
    ...over,
  };
}

function importar(p: PedidoMercos): Record<string, unknown> {
  return JSON.parse(
    sql(`select public.fn_importar_pedido_mercos('${ORG}', $json$${JSON.stringify(p)}$json$::jsonb);`),
  ) as Record<string, unknown>;
}

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
    values
      ('${ORG}', 'mercos-cadastro-1-para-1', 'Mercos cadastro 1 para 1', 'Mercos cadastro 1 para 1'),
      ('${ORG_CONFLICTO}', 'mercos-cadastro-1-para-1-b', 'Mercos cadastro 1 para 1 b', 'Mercos cadastro 1 para 1 b')
    on conflict (id) do nothing;
  `);
});

describe("0301 · a tag única é mercos", () => {
  it("a importação nasce com a tag única `mercos` (sem stub)", () => {
    const r = importar(payloadDoMercos({ numero: 9202, cliente_nome: "TAG UNICA CLIENTE", cliente_documento: "45.678.916/0001-77" }));

    expect(r.status).toBe("inserted");
    expect(r.customer_created).toBe(true);

    expect(
      sql(`
        select (tags && array['mercos:pedido-sem-cadastro']) as stub
          from public.contacts
         where organization_id = '${ORG}'
           and source = 'mercos'
         order by created_at desc
         limit 1
      `),
    ).toBe("f");

    expect(
      sql(`
        select (tags && array['mercos']) as mercos
          from public.contacts
         where organization_id = '${ORG}'
           and source = 'mercos'
         order by created_at desc
         limit 1
      `),
    ).toBe("t");
  });
});

describe("0301 · o cadastro do Mercos é 1:1", () => {
  it("mesmo CNPJ → o segundo pedido reaproveita a ficha (sem criar)", () => {
    const primeiro = importar(payloadDoMercos({ numero: 9201 })) as { status: string; customer_created: boolean };
    const segundo = importar(
      payloadDoMercos({ numero: 9203, cliente_nome: "CLIENTE UNICO", cliente_documento: "45.678.912/0001-77" }),
    ) as { status: string; customer_created: boolean };

    expect(primeiro.status).toBe("inserted");
    expect(primeiro.customer_created).toBe(true);
    expect(segundo.status).toBe("inserted");
    expect(segundo.customer_created).toBe(false);

    expect(
      sql(`
        select count(*)::text
          from public.contacts c
         where c.organization_id = '${ORG}' and c.cnpj = '45678912000177'
      `),
    ).toBe("1");
  });
});

describe("0301 · fusão dos duplicados históricos", () => {
  beforeAll(() => {
    // Isola o cenário: remove o que as fases anteriores desta mesma org criaram
    // (o import cria `CLIENTE UNICO` duas vezes e elas são duplicadas por design).
    sql(`delete from public.commercial_orders where organization_id = '${ORG}';
         delete from public.contacts where organization_id = '${ORG}';`);
    sql(`
      insert into public.contacts
        (id, organization_id, name, display_name, cidade, uf, source, tags)
      values
        ('0301aaaa-2222-4000-8000-000000000001', '${ORG}', 'BORRACHARIA JR', 'BORRACHARIA JR', null, null, 'mercos', array['mercos']),
        ('0301aaaa-2222-4000-8000-000000000002', '${ORG}', 'Borracharia  Jr', 'Borracharia  Jr', 'Canoinhas', 'SC', 'mercos', array['mercos']),
        ('0301aaaa-2222-4000-8000-000000000003', '${ORG}', 'BORRACHARIA JR LTDA', 'BORRACHARIA JR LTDA', 'Canoinhas', 'SC', 'mercos', array['mercos'])
      on conflict (id) do nothing;
    `);
  });

  it("o plano de fusão detecta o grupo e quantos perdem", () => {
    const plano = JSON.parse(
      sql(`select public.fn_mercos_fundir_duplicados('${ORG}', false);`),
    ) as { aplicado: boolean; grupos: number; contatos_a_fundir: number };

    expect(plano.aplicado).toBe(false);
    expect(plano.grupos).toBe(1);
    expect(plano.contatos_a_fundir).toBe(2);
  });

  it("aplica a fusão: perdedor vira ponteiro do vencedor, nada é apagado", () => {
    const r = JSON.parse(
      sql(`select public.fn_mercos_fundir_duplicados('${ORG}', true);`),
    ) as { aplicado: boolean; contatos_fundidos: number };

    expect(r.aplicado).toBe(true);
    expect(r.contatos_fundidos).toBe(2);

    const linhas = sql(`
      select c.id || '|' || coalesce(c.is_merged_into::text, 'null') || '|' || (c.tags && array['mercos'])::text
        from public.contacts c
       where c.organization_id = '${ORG}'
         and c.id in ('0301aaaa-2222-4000-8000-000000000001',
                      '0301aaaa-2222-4000-8000-000000000002',
                      '0301aaaa-2222-4000-8000-000000000003')
       order by c.id;
    `).trim()
      .split("\n");

    expect(linhas).toHaveLength(3);
    // A 1ª (sem cidade) é a vencedora: fica viva, com a tag única.
    expect(linhas[0]).toContain("|null|t");
    // Os perdedores (ordenados por id) apontam para o vencedor — e continuam com
    // a tag única (nada foi apagado, só o ponteiro mudou).
    expect(linhas[1]).toContain("|0301aaaa-2222-4000-8000-000000000001|");
    expect(linhas[1]).not.toContain("|null|");
    expect(linhas[2]).toContain("|0301aaaa-2222-4000-8000-000000000001|");
    expect(linhas[2]).not.toContain("|null|");
  });

  it("mesmo nome com documento divergente mantém os dois (org isolado)", () => {
    sql(`
      insert into public.contacts
        (id, organization_id, name, display_name, cidade, uf, cnpj, source, tags)
      values
        ('0301aaaa-3333-4000-8000-000000000001', '${ORG_CONFLICTO}', 'CONSULTOR RIVAL', 'CONSULTOR RIVAL', 'Canoinhas', 'SC', '55555555000155', 'mercos', array['mercos']),
        ('0301aaaa-3333-4000-8000-000000000002', '${ORG_CONFLICTO}', 'Consultor Rival Ltda', 'Consultor Rival Ltda', 'Canoinhas', 'SC', '66666666000166', 'mercos', array['mercos']);
    `);

    const plano = JSON.parse(
      sql(`select public.fn_mercos_fundir_duplicados('${ORG_CONFLICTO}', false);`),
    ) as { grupos_com_documento_conflitante: number; contatos_mantidos_por_documento: number };

    expect(plano.grupos_com_documento_conflitante).toBe(1);
    expect(plano.contatos_mantidos_por_documento).toBe(2);

    const r = JSON.parse(
      sql(`select public.fn_mercos_fundir_duplicados('${ORG_CONFLICTO}', true);`),
    ) as { aplicado: boolean };

    expect(r.aplicado).toBe(true);

    expect(
      sql(`
        select count(*)::text
          from public.contacts c
         where c.organization_id = '${ORG_CONFLICTO}'
           and c.name ilike 'consultor rival%'
           and c.is_merged_into is null
           and c.source = 'mercos';
      `),
    ).toBe("2");
  });
});
