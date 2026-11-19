import { beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

/**
 * Retenção/LGPD do Sentinel — o que só o banco pode provar.
 *
 * A promessa de `fn_sentinel_expurgar` é estreita de propósito: apaga SOMENTE
 * ocorrências em estado terminal (`corrigida`, `ignorada`, `encerrada`) acima
 * da janela. As abertas (`nova`, `investigando`, `acao_necessaria`, `aprovada`,
 * `recorrente`) nunca são tocadas — nem quando `encerrada_em` é antigo, porque
 * o filtro é de ESTADO, não de data. A purga é idempotente e o cascade do
 * histórico não deixa evento órfão; e `organization_id` delimita o alcance.
 *
 * O piso de 30 dias e o cascade de uma única ocorrência já são medidos em
 * `sentinel-idempotencia.test.ts`. A lacuna coberta aqui é a MATRIZ dos oito
 * estados, a segunda execução e o isolamento entre organizações.
 *
 * As ocorrências nascem pela própria `fn_sentinel_registrar_ocorrencia` — não
 * são linhas fabricadas à mão — para que o cascade seja medido no histórico
 * que o produto grava.
 */

const ORG_A = "a0200000-0000-4000-8000-000000000001";
const ORG_B = "b0200000-0000-4000-8000-000000000002";

const RUN_A = "a0200000-2222-4000-8000-000000000001";
const RUN_B = "b0200000-2222-4000-8000-000000000002";

const REGRA = "operacao.estoque_negativo";

/** Estados terminais são os únicos que a retenção pode alcançar. */
const TERMINAIS = ["corrigida", "ignorada", "encerrada"] as const;
/** Estados abertos — a retenção não pode tocar em nenhum deles. */
const ABERTOS = ["nova", "investigando", "acao_necessaria", "aprovada", "recorrente"] as const;

function registrar(org: string, run: string, chave: string): string {
  return lastLine(
    sql(`
      select ocorrencia_id::text
        from public.fn_sentinel_registrar_ocorrencia(
          '${org}', '${run}', '${REGRA}|catalog_products|${chave}', '${REGRA}', 'operacao',
          'catalog_products', '${chave}', 'Produto com saldo negativo',
          'O saldo ficou abaixo de zero.', 'Saída sem entrada.', 'alta',
          '/app/estoque', '{"quantidade":-1}'::jsonb,
          '{"resumo":"Contar e ajustar","passos":["Conte fisicamente"],"campos_pendentes":["contagem"],"risco":"medio","reversibilidade":"reversivel","exige_aprovacao":true,"fonte":["catalog_products"],"limitacao":null,"confianca":"alta"}'::jsonb
        );
    `),
  );
}

function envelhecer(id: string, estado: string, dias: number): void {
  sql(`
    update public.sentinel_occurrences
       set estado = '${estado}',
           encerrada_em = now() - make_interval(days => ${dias}),
           updated_at = now() - make_interval(days => ${dias})
     where id = '${id}';
  `);
}

function expurgar(org: string, dias: number): number {
  return Number(lastLine(sql(`select public.fn_sentinel_expurgar('${org}', ${dias});`)));
}

function existe(id: string): boolean {
  return (
    Number(lastLine(sql(`select count(*) from public.sentinel_occurrences where id = '${id}';`))) === 1
  );
}

function eventos(id: string): number {
  return Number(
    lastLine(sql(`select count(*) from public.sentinel_occurrence_events where occurrence_id = '${id}';`)),
  );
}

/** Ocorrências criadas uma vez e reusadas entre os casos (a ordem importa). */
const porEstado = new Map<string, string>();
let outraOrg = "";

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'retencao-a', 'Retenção A', 'Retenção A'),
      ('${ORG_B}', 'retencao-b', 'Retenção B', 'Retenção B')
      on conflict (id) do nothing;

    insert into public.sentinel_runs
      (id, organization_id, origem, status, iniciado_em, finalizado_em)
    values
      ('${RUN_A}', '${ORG_A}', 'manual', 'sucesso', now(), now()),
      ('${RUN_B}', '${ORG_B}', 'manual', 'sucesso', now(), now())
      on conflict (id) do nothing;
  `);

  for (const estado of [...TERMINAIS, ...ABERTOS]) {
    porEstado.set(estado, registrar(ORG_A, RUN_A, `retencao-${estado}`));
  }
  outraOrg = registrar(ORG_B, RUN_B, "retencao-outra-org");
});

describe("Sentinel — retenção/LGPD por estado e por organização", () => {
  it("apaga os três terminais vencidos e preserva os cinco abertos, mesmo com `encerrada_em` antigo", () => {
    // Todos nascem `nova`; a idade é a mesma (60 dias) para todos. Só o ESTADO
    // pode explicar a diferença entre apagar e preservar.
    for (const estado of [...TERMINAIS, ...ABERTOS]) {
      envelhecer(porEstado.get(estado)!, estado, 60);
    }
    envelhecer(outraOrg, "encerrada", 60);

    // Sanidade: cada ocorrência tem histórico real para o cascade medir.
    for (const estado of [...TERMINAIS, ...ABERTOS]) {
      expect(eventos(porEstado.get(estado)!)).toBeGreaterThan(0);
    }

    expect(expurgar(ORG_A, 30)).toBe(TERMINAIS.length);

    for (const estado of TERMINAIS) {
      const id = porEstado.get(estado)!;
      expect(existe(id), `terminal ${estado} deveria ter sido apagada`).toBe(false);
      expect(eventos(id), `histórico de ${estado} deveria cair em cascata`).toBe(0);
    }
    for (const estado of ABERTOS) {
      const id = porEstado.get(estado)!;
      expect(existe(id), `aberta ${estado} NÃO pode ser apagada`).toBe(true);
      expect(eventos(id), `histórico de ${estado} deve continuar`).toBeGreaterThan(0);
    }
  });

  it("rodar duas vezes não muda o resultado e não deixa evento órfão (FK/cascade)", () => {
    const idempotente = registrar(ORG_A, RUN_A, "retencao-idempotente");
    envelhecer(idempotente, "corrigida", 60);

    const antes = Number(
      lastLine(sql(`select count(*) from public.sentinel_occurrences where organization_id = '${ORG_A}';`)),
    );

    // Primeira execução: apaga exatamente a nova terminal vencida.
    expect(expurgar(ORG_A, 30)).toBe(1);
    expect(existe(idempotente)).toBe(false);
    expect(eventos(idempotente)).toBe(0);

    const depoisDaPrimeira = Number(
      lastLine(sql(`select count(*) from public.sentinel_occurrences where organization_id = '${ORG_A}';`)),
    );
    expect(depoisDaPrimeira).toBe(antes - 1);

    // Segunda execução: zero linhas, mesmo estado. Não "apaga de novo" nem
    // quebra FK — a função completa e o total não muda.
    expect(expurgar(ORG_A, 30)).toBe(0);
    expect(
      Number(
        lastLine(sql(`select count(*) from public.sentinel_occurrences where organization_id = '${ORG_A}';`)),
      ),
    ).toBe(depoisDaPrimeira);
    expect(
      Number(
        lastLine(sql(`
          select count(*)
            from public.sentinel_occurrence_events e
           where e.organization_id = '${ORG_A}'
             and not exists (
               select 1 from public.sentinel_occurrences o where o.id = e.occurrence_id
             );
        `)),
      ),
      "cascade não pode deixar evento órfão",
    ).toBe(0);
  });

  it("organização A não apaga a ocorrência terminal de B; B apaga só a sua", () => {
    // A já rodou duas vezes nos casos acima.
    expect(existe(outraOrg)).toBe(true);
    expect(eventos(outraOrg)).toBeGreaterThan(0);

    // Expurgar A de novo não alcança B.
    expect(expurgar(ORG_A, 30)).toBe(0);
    expect(existe(outraOrg)).toBe(true);

    // Expurgar B alcança só a linha de B.
    expect(expurgar(ORG_B, 30)).toBe(1);
    expect(existe(outraOrg)).toBe(false);
    expect(eventos(outraOrg)).toBe(0);

    // As abertas de A seguem intactas — o expurgo de B não olha para lá.
    for (const estado of ABERTOS) {
      expect(existe(porEstado.get(estado)!), `aberta ${estado} de A deve sobreviver`).toBe(true);
    }
  });
});
