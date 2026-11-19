import { beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

/**
 * Encerramento por REGRA AVALIADA (v1.5).
 *
 * A rodada truncada por tempo não pode mais deixar ocorrência de regra que
 * rodou aberta para sempre — mas a regra que NÃO rodou tem de ficar intocada.
 * A função já recebe a lista de regras; aqui o banco prova o contrato:
 *
 *  - regra na lista e sem achado → encerrada com motivo + evento;
 *  - regra fora da lista → aberta, mesmo vencida;
 *  - segunda chamada não gera evento extra;
 *  - outra organização não é alcançada.
 */

const ORG_A = "a0330000-0000-4000-8000-000000000001";
const ORG_B = "b0330000-0000-4000-8000-000000000002";

const RUN_OLD_A = "a0330000-2222-4000-8000-000000000001";
const RUN_NEW_A = "a0330000-2222-4000-8000-000000000002";
const RUN_B = "b0330000-2222-4000-8000-000000000003";

const REGRA_A = "operacao.estoque_negativo";
const REGRA_B = "operacao.pedido_preso";

function registrar(org: string, run: string, regra: string, chave: string): string {
  return lastLine(
    sql(`
      select ocorrencia_id::text
        from public.fn_sentinel_registrar_ocorrencia(
          '${org}', '${run}', '${regra}|catalog_products|${chave}', '${regra}', 'operacao',
          'catalog_products', '${chave}', 'Título', 'Resumo.', 'Causa.', 'alta',
          '/app/estoque', '{"quantidade":-1}'::jsonb,
          '{"resumo":"Contar e ajustar","passos":["Conte fisicamente"],"campos_pendentes":["contagem"],"risco":"medio","reversibilidade":"reversivel","exige_aprovacao":true,"fonte":["catalog_products"],"limitacao":null,"confianca":"alta"}'::jsonb
        );
    `),
  );
}

function estado(id: string): string {
  return lastLine(
    sql(`select estado || ':' || coalesce(motivo_encerramento, 'null') from public.sentinel_occurrences where id = '${id}';`),
  );
}

function eventos(id: string): number {
  return Number(
    lastLine(sql(`select count(*) from public.sentinel_occurrence_events where occurrence_id = '${id}';`)),
  );
}

function encerrar(org: string, run: string, regras: string[]): number {
  return Number(
    lastLine(
      sql(
        `select public.fn_sentinel_encerrar_ausentes('${org}', '${run}', array[${regras
          .map((r) => `'${r}'`)
          .join(",")}]::text[]);`,
      ),
    ),
  );
}

let occA = "";
let occB = "";
let occOutraOrg = "";

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'encerra-regra-a', 'Encerra A', 'Encerra A'),
      ('${ORG_B}', 'encerra-regra-b', 'Encerra B', 'Encerra B')
      on conflict (id) do nothing;

    insert into public.sentinel_runs (id, organization_id, origem, status, finalizado_em) values
      ('${RUN_OLD_A}', '${ORG_A}', 'cron', 'sucesso', now() - interval '1 day'),
      ('${RUN_NEW_A}', '${ORG_A}', 'cron', 'parcial', now()),
      ('${RUN_B}', '${ORG_B}', 'cron', 'sucesso', now())
      on conflict (id) do nothing;
  `);

  occA = registrar(ORG_A, RUN_OLD_A, REGRA_A, "a");
  occB = registrar(ORG_A, RUN_OLD_A, REGRA_B, "b");
  occOutraOrg = registrar(ORG_B, RUN_B, REGRA_A, "outra");
});

describe("Sentinel — encerrar só a regra avaliada (0330 não precisou existir)", () => {
  it("regra avaliada e sem achado encerra; a regra que não rodou fica intocada", () => {
    expect(encerrar(ORG_A, RUN_NEW_A, [REGRA_A])).toBe(1);

    expect(estado(occA)).toBe("encerrada:nao_detectada_na_execucao");
    expect(estado(occB)).toBe("nova:null");
    expect(
      lastLine(
        sql(`select tipo || ':' || (detalhe->>'motivo') from public.sentinel_occurrence_events where occurrence_id = '${occA}' order by created_at desc limit 1;`),
      ),
    ).toBe("auto_encerrada:nao_detectada_na_execucao");
  });

  it("reexecução não gera evento extra e não toca a regra não avaliada", () => {
    const antes = eventos(occA);
    expect(encerrar(ORG_A, RUN_NEW_A, [REGRA_A])).toBe(0);
    expect(estado(occA)).toBe("encerrada:nao_detectada_na_execucao");
    expect(eventos(occA)).toBe(antes);
    expect(estado(occB)).toBe("nova:null");
  });

  it("depois a regra B é avaliada e encerra; a outra organização não é alcançada", () => {
    expect(encerrar(ORG_A, RUN_NEW_A, [REGRA_B])).toBe(1);
    expect(estado(occB)).toBe("encerrada:nao_detectada_na_execucao");
    expect(estado(occOutraOrg)).toBe("nova:null");

    expect(encerrar(ORG_A, RUN_NEW_A, [REGRA_A])).toBe(0);
    expect(estado(occOutraOrg)).toBe("nova:null");
  });
});
