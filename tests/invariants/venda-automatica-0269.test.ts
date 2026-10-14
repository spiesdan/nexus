import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * 0269 — MENSAGEM FIXA, LISTA FECHADA E COOLDOWN no banco.
 *
 * ═══ POR QUE UM INVARIANTE PARA QUATRO COLUNAS ═══════════════════════════
 *
 * Porque o modo de falha é a coluna que não chegou na VPS. A migration roda
 * no CI contra Postgres efêmero, mas quem atende a loja é o `baseline.sql`
 * aplicado pelo `update.sh` — e migration sem apêndice é código que passa no
 * teste e quebra em produção com "column not found" no primeiro envio da
 * campanha. Este arquivo roda contra o BASELINE (é o `test:db` que aplica),
 * então coluna aqui significa coluna na VPS.
 *
 * O que cada trava impede:
 * - coluna ausente → 500 no criar/enviar;
 * - `cooldown_segundos` sem default → insert antigo quebra;
 * - CHECK fora de 10..3600 → rajada de 1s (ban) ou campanha que nunca termina;
 * - RLS desligado → a tabela inteira vaza para a anon key.
 */
const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`");
const containerName: string = container;

function q(sql: string): string {
  // `execFileSync` ESTOURA quando o psql sai diferente de zero — e o ponto
  // deste arquivo é justamente provocar o CHECK. Sem o try/catch, a prova
  // comportamental viraria erro de harness em vez de asserção.
  try {
    return execFileSync(
      "docker",
      ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql],
      { encoding: "utf8" },
    ).trim();
  } catch (e) {
    const erro = e as { stdout?: unknown; stderr?: unknown; message?: string };
    return String(erro.stdout ?? "") + String(erro.stderr ?? "") + String(erro.message ?? "");
  }
}

describe("0269 — venda automática com mensagem e cooldown", () => {
  // Org própria do arquivo, com id fixo e `on conflict do nothing`: o banco
  // de invariantes nasce do baseline SEM seed, e `select id ... limit 1`
  // voltaria vazio — com vazio, o insert de prova falharia de UUID, não de
  // CHECK, e o teste passaria pelo motivo errado.
  const ORG = "0a9b8c7d-6e5f-4a3b-8c7d-6e5f4a3b8c7d";

  beforeAll(() => {
    q(
      `insert into public.organizations (id, slug, legal_name, display_name)
        values ('${ORG}', 'va-0269', 'VA 0269', 'VA 0269') on conflict (id) do nothing`,
    );
  });

  it("as quatro colunas existem, anuláveis onde devem", () => {
    const saidas = q(
      `select column_name || '|' || is_nullable || '|' || coalesce(column_default, '')
         from information_schema.columns
        where table_name = 'automatic_sales_campaigns'
          and column_name in ('mensagem_padrao', 'cooldown_segundos', 'prospect_ids', 'ultimo_envio_at')
        order by column_name`,
    );
    const linhas = saidas.split("\n").filter(Boolean);
    // mensagem, lista e carimbo nascem vazios: campanha antiga continua válida
    // sem backfill, e "sem mensagem" precisa continuar significando "gera IA".
    expect(linhas).toContain("mensagem_padrao|YES|");
    expect(linhas).toContain("prospect_ids|YES|");
    expect(linhas).toContain("ultimo_envio_at|YES|");
    // cooldown nasce 60: campanha criada sem o campo (tela antiga, API direta)
    // espera 60s, que é o pedido — nunca 0, que seria rajada.
    expect(linhas).toContain("cooldown_segundos|NO|60");
  });

  it("o CHECK prende 10..3600 — e a mensagem de erro nomeia a trava", () => {
    const def = q(
      `select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'automatic_sales_campaigns'::regclass
          and conname = 'automatic_sales_campaigns_cooldown_faixa'`,
    );
    expect(def).toContain("cooldown_segundos >= 10");
    expect(def).toContain("cooldown_segundos <= 3600");

    // Prova comportamental, não só catálogo: 5 segundos é recusado de verdade.
    // Com org de verdade — sem ela, o erro seria de FK, e o teste passaria
    // pelo motivo errado (ou, pior, falharia dizendo que o CHECK não existe).
    const org = ORG;
    const tentativa = q(
      `insert into automatic_sales_campaigns (organization_id, nome, cidade, limite_diario, janela_inicio, janela_fim, cooldown_segundos)
        values ('${org}', 'x', 'Videira', 1, '09:00', '17:30', 5)
        returning id`,
    );
    expect(tentativa).toMatch(/cooldown_faixa|check constraint/i);
  });

  it("MUTAÇÃO: CHECK com piso 1 liberaria rajada — o banco não deixa", () => {
    // Se a migration dissesse `>= 1`, este insert passaria e o teste abaixo
    // cairia: cooldown de 1 segundo contra o WAHA é ban com outro nome.
    const org = ORG;
    const tentativa = q(
      `insert into automatic_sales_campaigns (organization_id, nome, cidade, limite_diario, janela_inicio, janela_fim, cooldown_segundos)
        values ('${org}', 'x', 'Videira', 1, '09:00', '17:30', 1)
        returning id`,
    );
    expect(tentativa).toMatch(/cooldown_faixa|check constraint/i);
  });

  it("RLS continua ligado — coluna nova não reabre a tabela", () => {
    expect(q(`select relrowsecurity from pg_class where relname = 'automatic_sales_campaigns'`)).toBe(
      "t",
    );
  });
});