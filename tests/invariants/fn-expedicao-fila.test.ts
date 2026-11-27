import { describe, expect, it } from "vitest";

import { sql } from "./psql-transporte";

/**
 * 0360 — A FILA DA EXPEDIÇÃO NÃO PODE MENTIR NEM VAZAR.
 *
 * Duas falhas silenciosas cercam esta função: contar o array paginado (200 de
 * 482) não quebra tela nenhuma, e uma definer com grant amplo também não. A
 * primeira é o defeito que a auditoria 89 mediu; a segunda trocaria um número
 * subcontado por dado de outro tenant. Aqui as duas são medidas no Postgres
 * real que nasce do `baseline.sql`.
 */
const ORG_A = "00000000-0000-4000-8000-00000000a001";
const ORG_B = "00000000-0000-4000-8000-00000000a002";
const CARGA_A = "00000000-0000-4000-8000-00000000c001";

describe("0360 — fn_expedicao_fila", () => {
  it("existe, é STABLE e SECURITY INVOKER — a RLS do chamador continua valendo", () => {
    const assinatura = sql(`
      select p.provolatile::text || '|' || p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'fn_expedicao_fila';
    `);
    expect(assinatura).toMatch(/^s\|false\|/);
    expect(assinatura).toContain("pg_temp");
  });

  it("anon não executa; authenticated e service_role executam", () => {
    const anon = sql(
      `select has_function_privilege('anon', 'public.fn_expedicao_fila(uuid)', 'execute')::text;`,
    );
    const auth = sql(
      `select has_function_privilege('authenticated', 'public.fn_expedicao_fila(uuid)', 'execute')::text;`,
    );
    const service = sql(
      `select has_function_privilege('service_role', 'public.fn_expedicao_fila(uuid)', 'execute')::text;`,
    );
    expect(anon).toBe("false");
    expect(auth).toBe("true");
    expect(service).toBe("true");
  });

  it("conta embarcáveis fora de carga viva e isola a organização", () => {
    sql(`
      delete from public.organizations where id in ('${ORG_A}', '${ORG_B}');

      insert into public.organizations (id, slug, legal_name, display_name)
      values
        ('${ORG_A}', 'teste-fila-expedicao-a', 'Fila A', 'Fila A'),
        ('${ORG_B}', 'teste-fila-expedicao-b', 'Fila B', 'Fila B');

      insert into public.commercial_orders
        (organization_id, numero, cliente_nome, status, total_cents)
      values
        ('${ORG_A}', 1, 'Cliente A1', 'aprovado', 1000),
        ('${ORG_A}', 2, 'Cliente A2', 'faturado', 2000),
        ('${ORG_A}', 3, 'Cliente A3', 'aprovado', 3000),
        ('${ORG_A}', 4, 'Cliente A4', 'rascunho', 9999),
        ('${ORG_A}', 5, 'Cliente A5', 'aprovado', 4000),
        ('${ORG_A}', 6, 'Cliente A6', 'aprovado', 7000),
        -- 0302/0361: é o status com que o pedido importado do Mercos nasce e
        -- É embarcável (STATUS_EMBARCAVEIS). A 0360 não o contava.
        ('${ORG_A}', 7, 'Cliente A7', 'concluido', 5000),
        ('${ORG_B}', 1, 'Cliente B1', 'aprovado', 5000);

      insert into public.shipments (id, organization_id, numero, status)
      values ('${CARGA_A}', '${ORG_A}', 9901, 'montando');

      insert into public.shipment_orders (organization_id, shipment_id, order_id)
      select '${ORG_A}', '${CARGA_A}', id
        from public.commercial_orders
       where organization_id = '${ORG_A}' and numero in (5, 6);
    `);

    const a = sql(`select pedidos || '|' || valor_cents from public.fn_expedicao_fila('${ORG_A}');`);
    const b = sql(`select pedidos || '|' || valor_cents from public.fn_expedicao_fila('${ORG_B}');`);
    // 4 = aprovado (1, 3) + faturado (2) + concluido (7). A função da 0360
    // devolvia "3|6000" aqui — é a fixture que reprova o conserto ausente.
    expect(a).toBe("4|11000");
    expect(b).toBe("1|5000");

    // Carga cancelada devolve os pedidos para a fila — o mesmo conceito da faixa.
    sql(`update public.shipments set status = 'cancelada' where id = '${CARGA_A}';`);
    const comCancelada = sql(
      `select pedidos || '|' || valor_cents from public.fn_expedicao_fila('${ORG_A}');`,
    );
    expect(comCancelada).toBe("6|22000");

    sql(`delete from public.organizations where id in ('${ORG_A}', '${ORG_B}');`);
  });
});
