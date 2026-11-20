import { beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

/**
 * 0332 — a sonda não entra na série dos SLOs.
 *
 * A tabela é separada; além disso, as funções de SLO já filtram as cinco rotas
 * quentes. O teste prova as duas coisas: um `__sonda__` em
 * `api_request_samples` não muda total/p95, e a sonda vive na própria tabela.
 */
const ORG = "a0350000-0000-4000-8000-000000000001";
const ROTA = "/api/v1/contacts";

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
    values ('${ORG}', 'sonda-slo', 'Sonda SLO', 'Sonda SLO')
    on conflict (id) do nothing;

    delete from public.api_request_samples where organization_id = '${ORG}';
    delete from public.api_request_probes;

    insert into public.api_request_samples
      (organization_id, route, status, duration_ms, request_id)
    values
      ('${ORG}', '${ROTA}', 200, 100, 'inv-0332-hot'),
      ('${ORG}', '__sonda__', 200, 999, 'inv-0332-sonda');

    insert into public.api_request_probes (origem, duracao_ms, ok)
    values ('manual', 12, true);
  `);
});

describe("sonda × série de SLOs (0332)", () => {
  it("__sonda__ não entra no total nem no p95 das rotas quentes", () => {
    expect(
      lastLine(
        sql(`select total || ':' || round(p95) from public.fn_slo_api_resumo(7, array['${ROTA}']::text[]);`),
      ),
    ).toBe("1:100");
  });

  it("a sonda fica na tabela própria, com origem/duração/ok", () => {
    expect(
      lastLine(sql(`select origem || ':' || round(duracao_ms) || ':' || ok from public.api_request_probes;`)),
    ).toBe("manual:12:true");
  });
});
