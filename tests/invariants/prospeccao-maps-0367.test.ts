import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * 0367 — a conclusão de termo Maps deriva os contadores dos vínculos.
 *
 * Duas chamadas com o MESMO progresso e os MESMOS vínculos têm de devolver os
 * mesmos números: a retomada não dobra `novas` nem perde o que já entrou.
 * A prova é no banco real, com a função que o motor chama.
 */
const ORG = "eeeeeeee-0000-4000-8000-0000000000a1";
const SEARCH = "eeeeeeee-0000-4000-8000-0000000000b1";
const P1 = "eeeeeeee-0000-4000-8000-0000000000c1";
const P2 = "eeeeeeee-0000-4000-8000-0000000000c2";

const PROGRESSO = {
  termos_total: 1,
  termos_concluidos: ["oficina"],
  termos_falhos: [],
  termo_atual: null,
  tentativas: 0,
  bloqueio: null,
  termos_encontradas: { oficina: 2 },
};

function chamar(): string {
  return sql(`
    set role service_role;
    select set_config('request.jwt.claims', '{"role":"service_role"}', false);
    select public.fn_concluir_termo_maps(
      '${ORG}', '${SEARCH}', '${JSON.stringify(PROGRESSO)}'::jsonb, 2, null
    )::text;
  `).split("\n").pop() ?? "";
}

describe("0367 — fn_concluir_termo_maps", () => {
  it("duas execuções devolvem os mesmos contadores e não criam linha", () => {
    sql(`
      insert into public.organizations (id, slug, legal_name, display_name)
        values ('${ORG}', 'maps-0367', 'Maps 0367', 'Maps 0367')
        on conflict (id) do nothing;

      insert into public.prospecting_searches
        (id, organization_id, categorias, cidade, estado, provider, status, progresso)
        values ('${SEARCH}', '${ORG}', array['oficina'], 'Canoinhas', 'SC', 'maps_browser', 'running',
                '${JSON.stringify(PROGRESSO)}'::jsonb)
        on conflict (id) do nothing;

      insert into public.business_prospects
        (id, organization_id, nome, nome_normalizado, provider, external_id, telefone_normalizado)
        values
          ('${P1}', '${ORG}', 'Oficina Um', 'oficina um', 'maps_browser', 'maps:ChIJ1', '+5547999991111'),
          ('${P2}', '${ORG}', 'Oficina Dois', 'oficina dois', 'maps_browser', 'maps:ChIJ2', '+5547999992222')
        on conflict (id) do nothing;

      insert into public.prospect_search_results
        (search_id, prospect_id, organization_id, primeira_vez)
        values
          ('${SEARCH}', '${P1}', '${ORG}', true),
          ('${SEARCH}', '${P2}', '${ORG}', false)
        on conflict do nothing;
    `);

    const primeira = JSON.parse(chamar()) as {
      status: string;
      novas: number;
      duplicadas: number;
      completa: boolean;
    };
    expect(primeira).toMatchObject({
      status: "completed",
      novas: 1,
      duplicadas: 1,
      completa: true,
    });

    const segunda = JSON.parse(chamar()) as {
      status: string;
      novas: number;
      duplicadas: number;
    };
    expect(segunda).toMatchObject({ status: "completed", novas: 1, duplicadas: 1 });

    const contagens = sql(`
      select
        (select count(*) from public.business_prospects where organization_id = '${ORG}') || '|' ||
        (select count(*) from public.prospect_search_results where search_id = '${SEARCH}');
    `);
    expect(contagens).toBe("2|2");
  });
});
