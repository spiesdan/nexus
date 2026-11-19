import { beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

/**
 * 0330 — série de API dos SLOs.
 *
 *  - retenção apaga além de 7 dias, em lote, e é idempotente;
 *  - a amostra recente não é tocada;
 *  - o agregado devolve total, 5xx e p95 da janela.
 */
const ROTA = "/api/v1/commercial-orders";
const ROTA_FORA = "/api/v1/outra";

beforeAll(() => {
  sql(`
    delete from public.api_request_samples where request_id like 'inv-0330-%';
    insert into public.api_request_samples
      (organization_id, route, status, duration_ms, code, request_id, created_at)
    values
      (null, '${ROTA}', 200, 100, null, 'inv-0330-velha', now() - interval '10 days'),
      (null, '${ROTA}', 200, 100, null, 'inv-0330-nova-1', now() - interval '1 day'),
      (null, '${ROTA}', 500, 300, 'internal_error', 'inv-0330-nova-2', now() - interval '1 day'),
      (null, '${ROTA}', 200, 500, null, 'inv-0330-nova-3', now() - interval '1 day'),
      (null, '${ROTA_FORA}', 500, 900, 'internal_error', 'inv-0330-fora', now() - interval '1 day');
  `);
});

describe("API de métricas — retenção e agregado (0330)", () => {
  it("apaga só o que passou de 7 dias e roda duas vezes sem efeito extra", () => {
    expect(
      Number(lastLine(sql(`select public.fn_api_metricas_expurgar(7, 1000);`))),
    ).toBe(1);
    expect(
      Number(
        lastLine(
          sql(`select count(*) from public.api_request_samples where request_id = 'inv-0330-velha';`),
        ),
      ),
    ).toBe(0);
    expect(
      Number(
        lastLine(
          sql(`select count(*) from public.api_request_samples where request_id like 'inv-0330-nova-%';`),
        ),
      ),
    ).toBe(3);

    expect(
      Number(lastLine(sql(`select public.fn_api_metricas_expurgar(7, 1000);`))),
    ).toBe(0);
  });

  it("SLO por rota devolve a evidência que o Sentinel usa", () => {
    expect(
      lastLine(
        sql(`select route || ':' || total || ':' || erros from public.fn_slo_api_rotas(7, array['${ROTA}']::text[]);`),
      ),
    ).toBe(`${ROTA}:3:1`);
  });

  it("consulta da tela com 1.000 amostras fica abaixo de 200 ms no local", () => {
    sql(`
      insert into public.api_request_samples
        (organization_id, route, status, duration_ms, code, request_id, created_at)
      select null, '${ROTA}', case when g % 100 = 0 then 500 else 200 end,
             (g % 800) + 10, null, 'inv-0330-carga-' || g, now() - interval '1 hour'
        from generate_series(1, 1000) g;
    `);

    const inicio = Date.now();
    const linha = lastLine(
      sql(`select total || ':' || erros from public.fn_slo_api_resumo(7, array['${ROTA}']::text[]);`),
    );
    const duracao = Date.now() - inicio;

    expect(linha).toBe("1003:11");
    expect(duracao, `consulta levou ${duracao} ms`).toBeLessThan(200);

    sql(`delete from public.api_request_samples where request_id like 'inv-0330-carga-%';`);
  });

  it("agrega total, 5xx e p95 só da rota pedida", () => {
    const linha = lastLine(
      sql(`select total || ':' || erros || ':' || round(p95) from public.fn_slo_api_resumo(7, array['${ROTA}']::text[]);`),
    );
    expect(linha).toBe("3:1:480");
  });
});
