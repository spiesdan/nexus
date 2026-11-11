import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * 0302 · O PEDIDO CONCLUÍDO NO ERP ENTRA NA EXPEDIÇÃO.
 *
 * A regra é do banco, não da tela: `fn_aplicar_status_mercos` é quem decide se
 * a leitura do ERP pode reescrever o status de um pedido que já existe. Um
 * dublê aceitaria qualquer coisa, então a prova é contra Postgres real.
 *
 * O que este arquivo prende:
 *
 *   1. o CHECK de `commercial_orders` aceita `concluido`;
 *   2. o importador aceita pedido novo com status `concluido` — sem isso o
 *      pedido "Concluído" do Mercos deixaria de entrar;
 *   3. `faturado` sem nota + ERP "Concluído" vira `concluido` (a correção que
 *      devolve ao vocabulário o significado de NF-e gerada);
 *   4. nota emitida bloqueia (`nota_emitida`) — `faturado` com nota está certo;
 *   5. `concluido` + ERP "Faturado" vira `faturado` — é a nota que chegou;
 *   6. rascunho/em análise não regridem; cancelado/expedido do ERP não se
 *      aplicam; `expedido`/`entregue`/`cancelado` do CRM não são tocados;
 *   7. pedido em carga bloqueia (`pedido_em_carga`);
 *   8. pedido local (origem ≠ mercos) nunca é tocado (`nao_encontrado`);
 *   9. segunda passada é `sem_mudanca` — a revisão roda todo dia.
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

const ORG = "0302aaaa-0000-4000-8000-000000000001";
const CARGA = "0302aaaa-3333-4000-8000-000000000001";

const SEM_NOTA = "0302aaaa-2222-4000-8000-000000000001";
const COM_NOTA = "0302aaaa-2222-4000-8000-000000000002";
const CONCLUIDO = "0302aaaa-2222-4000-8000-000000000003";
const APROVADO = "0302aaaa-2222-4000-8000-000000000004";
const REGRIDE = "0302aaaa-2222-4000-8000-000000000005";
const EXPEDIDO = "0302aaaa-2222-4000-8000-000000000006";
const ENTREGUE = "0302aaaa-2222-4000-8000-000000000007";
const CANCELADO = "0302aaaa-2222-4000-8000-000000000008";
const EM_CARGA = "0302aaaa-2222-4000-8000-000000000009";
const LOCAL = "0302aaaa-2222-4000-8000-00000000000a";

interface Resultado {
  status: string;
  numero: number;
  order_id?: string;
  motivo?: string;
  mudancas?: { campo: string; de: unknown; para: unknown }[];
}

function aplicarStatus(numero: number, status: string): Resultado {
  const bruto = sql(`
    select public.fn_aplicar_status_mercos(
      '${ORG}',
      jsonb_build_object('numero', ${numero}, 'status', '${status}')
    );
  `);
  return JSON.parse(bruto) as Resultado;
}

function statusDe(id: string): string {
  return sql(`select status from public.commercial_orders where id = '${id}'`);
}

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
    values ('${ORG}', 'pedido-concluido', 'Pedido Concluído', 'Pedido Concluído')
    on conflict (id) do nothing;

    insert into public.commercial_orders
      (id, organization_id, numero, cliente_nome, status, origem,
       subtotal_cents, frete_cents, total_cents)
    values
      ('${SEM_NOTA}', '${ORG}', 9101, 'SEM NOTA', 'faturado', 'mercos', 1000, 0, 1000),
      ('${COM_NOTA}', '${ORG}', 9102, 'COM NOTA', 'faturado', 'mercos', 1000, 0, 1000),
      ('${CONCLUIDO}', '${ORG}', 9103, 'CONCLUIDO', 'concluido', 'mercos', 1000, 0, 1000),
      ('${APROVADO}', '${ORG}', 9104, 'APROVADO', 'aprovado', 'mercos', 1000, 0, 1000),
      ('${REGRIDE}', '${ORG}', 9105, 'NAO REGRIDE', 'aprovado', 'mercos', 1000, 0, 1000),
      ('${EXPEDIDO}', '${ORG}', 9106, 'EXPEDIDO', 'expedido', 'mercos', 1000, 0, 1000),
      ('${ENTREGUE}', '${ORG}', 9107, 'ENTREGUE', 'entregue', 'mercos', 1000, 0, 1000),
      ('${CANCELADO}', '${ORG}', 9108, 'CANCELADO', 'cancelado', 'mercos', 1000, 0, 1000),
      ('${EM_CARGA}', '${ORG}', 9109, 'EM CARGA', 'aprovado', 'mercos', 1000, 0, 1000),
      ('${LOCAL}', '${ORG}', 9110, 'PEDIDO LOCAL', 'aprovado', 'vendedor', 1000, 0, 1000)
    on conflict (id) do nothing;

    insert into public.invoices (id, organization_id, order_id, serie, total_cents, status)
    values ('0302aaaa-4444-4000-8000-000000000001', '${ORG}', '${COM_NOTA}', '2', 1000, 'autorizada')
    on conflict (id) do nothing;

    insert into public.shipments (id, organization_id, numero, status)
    values ('${CARGA}', '${ORG}', 302, 'montando')
    on conflict (id) do nothing;

    insert into public.shipment_orders (organization_id, shipment_id, order_id, sequencia)
    values ('${ORG}', '${CARGA}', '${EM_CARGA}', 1)
    on conflict do nothing;
  `);
});

describe("0302 · pedido concluído no Mercos", () => {
  it("o CHECK aceita `concluido`", () => {
    // Prova direta do vocabulário: sem isto, o importador não grava e a
    // revisão não corrige — o status existe só no TypeScript.
    sql(`
      insert into public.commercial_orders
        (id, organization_id, numero, cliente_nome, status, origem,
         subtotal_cents, frete_cents, total_cents)
      values ('0302aaaa-9999-4000-8000-000000000001', '${ORG}', 9199, 'CHECK', 'concluido',
              'vendedor', 100, 0, 100);
    `);
    expect(sql(`select status from public.commercial_orders where numero = 9199 and organization_id = '${ORG}'`)).toBe(
      "concluido",
    );
  });

  it("o importador aceita pedido novo com status concluido", () => {
    const bruto = sql(`
      select public.fn_importar_pedido_mercos('${ORG}', $json$${JSON.stringify({
        numero: 9111,
        status: "concluido",
        cliente_nome: "CLIENTE IMPORTADO",
        cliente_documento: null,
        total_cents: 5000,
        subtotal_cents: 5000,
        frete_cents: 0,
        itens: [
          {
            codigo: "IMP",
            descricao: "ITEM IMPORTADO",
            quantidade: 1,
            preco_unit_cents: 5000,
            subtotal_cents: 5000,
          },
        ],
      })}$json$::jsonb);
    `);
    const r = JSON.parse(bruto) as Resultado;
    expect(r.status).toBe("inserted");
    expect(
      sql(`select status from public.commercial_orders
            where organization_id = '${ORG}' and numero = 9111`),
    ).toBe("concluido");
  });

  it("faturado sem nota + Concluído no ERP vira concluido", () => {
    const r = aplicarStatus(9101, "concluido");
    expect(r.status).toBe("atualizado");
    expect(r.mudancas).toEqual([{ campo: "status", de: "faturado", para: "concluido" }]);
    expect(statusDe(SEM_NOTA)).toBe("concluido");
    // A mudança aparece na ficha (0301 grava as mudanças da sincronização;
    // esta soma em vez de sobrescrever).
    expect(
      sql(`select (mercos_sincronizado_em is not null) || '|' || (mercos_ultima_mudanca->'campos'->0->>'campo')
             from public.commercial_orders where id = '${SEM_NOTA}'`),
    ).toBe("true|status");
  });

  it("nota emitida bloqueia — faturado com NF-e está certo", () => {
    const r = aplicarStatus(9102, "concluido");
    expect(r.status).toBe("bloqueado");
    expect(r.motivo).toBe("nota_emitida");
    expect(statusDe(COM_NOTA)).toBe("faturado");
  });

  it("concluido + Faturado no ERP vira faturado — a nota chegou", () => {
    const r = aplicarStatus(9103, "faturado");
    expect(r.status).toBe("atualizado");
    expect(statusDe(CONCLUIDO)).toBe("faturado");
  });

  it("aprovado + Concluído no ERP vira concluido", () => {
    const r = aplicarStatus(9104, "concluido");
    expect(r.status).toBe("atualizado");
    expect(statusDe(APROVADO)).toBe("concluido");
  });

  it("rascunho/em análise do ERP não regridem pedido aprovado", () => {
    const r = aplicarStatus(9105, "em_analise");
    expect(r.status).toBe("ignorado");
    expect(r.motivo).toBe("erp_sem_estado_de_venda");
    expect(statusDe(REGRIDE)).toBe("aprovado");
  });

  it("o nosso caminho de carga não é reescrito pelo ERP", () => {
    expect(aplicarStatus(9106, "concluido")).toMatchObject({
      status: "ignorado",
      motivo: "status_do_crm_fora_do_alcance",
    });
    expect(aplicarStatus(9107, "concluido")).toMatchObject({ status: "ignorado" });
    expect(aplicarStatus(9108, "faturado")).toMatchObject({ status: "ignorado" });
    expect(statusDe(EXPEDIDO)).toBe("expedido");
    expect(statusDe(ENTREGUE)).toBe("entregue");
    expect(statusDe(CANCELADO)).toBe("cancelado");
  });

  it("pedido em carga bloqueia", () => {
    const r = aplicarStatus(9109, "concluido");
    expect(r.status).toBe("bloqueado");
    expect(r.motivo).toBe("pedido_em_carga");
    expect(statusDe(EM_CARGA)).toBe("aprovado");
  });

  it("pedido LOCAL com o mesmo número nunca é tocado", () => {
    const r = aplicarStatus(9110, "concluido");
    expect(r.status).toBe("nao_encontrado");
    expect(statusDe(LOCAL)).toBe("aprovado");
  });

  it("segunda passada é sem_mudanca — a revisão roda todo dia", () => {
    const r = aplicarStatus(9101, "concluido");
    expect(r.status).toBe("sem_mudanca");
    expect(statusDe(SEM_NOTA)).toBe("concluido");
  });
});
