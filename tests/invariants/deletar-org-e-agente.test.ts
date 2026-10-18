import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

/**
 * Duas entidades que não se conseguia apagar (migration 0115).
 *
 * Achados operando: ao remover as fixtures de E2E da produção, os dois erros
 * apareceram um depois do outro, cada um abortando a transação inteira.
 *
 * São da mesma família — uma escrita AUTOMÁTICA (trigger de audit, SET NULL de
 * FK) reagindo ao DELETE e violando uma regra que vale para o estado normal, mas
 * não para a remoção. Por isso vivem no mesmo arquivo: quem mexer num vai ler o
 * outro.
 *
 * Invariante de banco e não teste de unidade porque o que quebrava era
 * CONSTRAINT e TRIGGER — nenhum dos dois existe fora do Postgres, e nenhum
 * typecheck os alcança.
 */
const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 2,
});

const ORG = "de1e7e00-0000-4000-8000-000000000001";
const ORG2 = "de1e7e00-0000-4000-8000-000000000002";

async function criarOrg(id: string, slug: string): Promise<void> {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name)
     values ($1, $2, 'Org Delete LTDA', 'Org Delete') on conflict (id) do nothing`,
    [id, slug],
  );
}

beforeAll(async () => {
  await criarOrg(ORG, "org-delete-1");
  await criarOrg(ORG2, "org-delete-2");
});

afterAll(async () => {
  await pool.query("delete from organizations where id = any($1)", [
    [ORG, ORG2, "de1e7e00-0000-4000-8000-000000000003"],
  ]);
  await pool.end();
});

describe("apagar uma ORGANIZAÇÃO", () => {
  it("a tabela usada no caso abaixo DISPARA audit — sem isto o caso não mede nada", async () => {
    // Controle positivo, e não é zelo: a primeira versão deste teste usava
    // `contacts`, que NÃO tem o trigger de audit. Ele passava sem exercitar o
    // caminho — e continuou passando quando eu SABOTEI o conserto, que foi como
    // o furo apareceu. O trigger vive só nas tabelas de IA.
    const { rows } = await pool.query<{ n: string }>(
      `select count(*) as n from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal and t.tgfoid = 'fn_audit_log_row'::regproc
          and c.relname = 'ai_agents'`,
    );
    expect(Number(rows[0]!.n), "ai_agents precisa ter o trigger de audit").toBeGreaterThan(0);
  });

  it("funciona mesmo com filhos que emitem audit — era o defeito 1", async () => {
    // `ai_agents` dispara o trigger de audit ao ser apagado pelo cascade. Antes
    // da 0115, ele tentava inserir em `api_audit_log` com o organization_id de
    // uma org que já não existia → FK violation, transação inteira abortada.
    const agenteOrfao = "de1e7e00-0000-4000-8000-0000000000e1";
    await pool.query(
      `insert into ai_agents (id, organization_id, name, kind, system_prompt, model)
       values ($1, $2, 'Agente do cascade', 'mcp_agent', 'oi', 'claude-sonnet-4-6')
       on conflict (id) do nothing`,
      [agenteOrfao, ORG],
    );
    const { rows: antes } = await pool.query<{ n: string }>(
      "select count(*) as n from ai_agents where organization_id = $1",
      [ORG],
    );
    expect(Number(antes[0]!.n), "controle: o filho que audita existe antes do delete").toBeGreaterThan(0);

    // O delete DIRETO da organização — sem apagar filhos à mão antes.
    await expect(pool.query("delete from organizations where id = $1", [ORG])).resolves.toBeDefined();

    const { rows: depois } = await pool.query<{ n: string }>(
      "select count(*) as n from organizations where id = $1",
      [ORG],
    );
    expect(depois[0]!.n).toBe("0");
  });
});

describe("apagar uma organização que tem agente COM LEAD atribuido", () => {
  it("funciona — o caso que os dois testes acima deixavam de fora (0272)", async () => {
    // ═══ O BURACO QUE ESTE CASO FECHA ═══════════════════════════════════════
    //
    // O teste de cima apaga a organização com um agente ÓRFÃO — sem lead. O
    // agente é o único que dispara `fn_audit_log_row`, e por isso ele mede
    // qualquer coisa que o cascade faça com ele.
    //
    // Mas existe um segundo gatilho em `ai_agents` que SÓ dispara com lead
    // atribuído: `fn_liberar_leads_do_agente`, que zera `crm_leads.owner_*`. O
    // UPDATE no lead aciona `fn_emit_event_on_lead_change` → `emit_event` →
    // INSERT em `event_log` **com a organização já removida dentro do mesmo
    // cascade** → FK violation, transação inteira abortada.
    //
    // Medido em 2026-10-18 na instalação do usuário, limpando 13 organizações de
    // teste que o E2E tinha escrito na produção:
    //
    //   ERROR: insert or update on table "event_log" violates foreign key
    //          constraint "event_log_organization_id_fkey"
    //   CONTEXT: fn_emit_event_on_lead_change() … fn_liberar_leads_do_agente()
    //            … DELETE FROM ONLY "public"."ai_agents"
    //
    // Ou seja: **a organização era indeponível de apagar**, e nada no repo
    // vigiava — os dois testes acima passavam, e passariam para sempre, porque
    // nenhum dos dois tinha lead no caminho.
    const ORG3 = "de1e7e00-0000-4000-8000-000000000003";
    const agente = "de1e7e00-0000-4000-8000-0000000000e2";
    const pipeline = "de1e7e00-0000-4000-8000-0000000000b2";
    const stage = "de1e7e00-0000-4000-8000-0000000000c3";
    const lead = "de1e7e00-0000-4000-8000-0000000000d2";

    await criarOrg(ORG3, "org-delete-3");
    await pool.query(
      `insert into ai_agents (id, organization_id, name, kind, system_prompt, model)
       values ($1, $2, 'Agente com lead', 'mcp_agent', 'oi', 'claude-sonnet-4-6')
       on conflict (id) do nothing`,
      [agente, ORG3],
    );
    await pool.query(
      `insert into crm_pipelines (id, organization_id, name, slug) values ($1, $2, 'Funil do lead', 'funil-do-lead')
       on conflict (id) do nothing`,
      [pipeline, ORG3],
    );
    await pool.query(
      `insert into crm_stages (id, organization_id, pipeline_id, name, slug, position)
       values ($1, $2, $3, 'Etapa', 'etapa-do-lead', 1) on conflict (id) do nothing`,
      [stage, ORG3, pipeline],
    );
    // O lead ATRIBUÍDO ao agente. Sem esta linha o caso mede nada: é a
    // atribuição que faz `fn_liberar_leads_do_agente` ter linha para atualizar.
    await pool.query(
      `insert into crm_leads (id, organization_id, pipeline_id, stage_id, title, owner_kind, owner_agent_id)
       values ($1, $2, $3, $4, 'Lead que derruba o delete da org', 'ai', $5)
       on conflict (id) do nothing`,
      [lead, ORG3, pipeline, stage, agente],
    );

    const { rows: controle } = await pool.query<{ owner_agent_id: string | null }>(
      "select owner_agent_id from crm_leads where id = $1",
      [lead],
    );
    expect(controle[0]!.owner_agent_id, "controle: o lead precisa estar atribuído ao agente").toBe(agente);

    // O delete DIRETO da organização, com cascade e tudo.
    await expect(pool.query("delete from organizations where id = $1", [ORG3])).resolves.toBeDefined();

    const { rows: depois } = await pool.query<{ n: string }>(
      "select count(*) as n from organizations where id = $1",
      [ORG3],
    );
    expect(depois[0]!.n, "a organização tem de ter desaparecido").toBe("0");
  });
});

describe("apagar um AGENTE que já atendeu", () => {
  it("funciona, e o lead fica SEM dono em vez de meio-atribuído — era o defeito 2", async () => {
    const agente = "de1e7e00-0000-4000-8000-0000000000a1";
    const pipeline = "de1e7e00-0000-4000-8000-0000000000b1";
    const stage = "de1e7e00-0000-4000-8000-0000000000c2";
    const lead = "de1e7e00-0000-4000-8000-0000000000d1";

    await pool.query(
      `insert into ai_agents (id, organization_id, name, kind, system_prompt, model)
       values ($1, $2, 'Agente que atendeu', 'mcp_agent', 'oi', 'claude-sonnet-4-6')
       on conflict (id) do nothing`,
      [agente, ORG2],
    );
    await pool.query(
      `insert into crm_pipelines (id, organization_id, name, slug) values ($1, $2, 'Funil do delete', 'funil-do-delete')
       on conflict (id) do nothing`,
      [pipeline, ORG2],
    );
    await pool.query(
      `insert into crm_stages (id, organization_id, pipeline_id, name, slug, position)
       values ($1, $2, $3, 'Etapa', 'etapa-do-delete', 1) on conflict (id) do nothing`,
      [stage, ORG2, pipeline],
    );
    // O lead ATRIBUÍDO ao agente: `owner_kind='ai'` + `owner_agent_id` — o par
    // que `crm_leads_owner_kind_coherence` exige que ande junto.
    await pool.query(
      `insert into crm_leads (id, organization_id, pipeline_id, stage_id, title, owner_kind, owner_agent_id)
       values ($1, $2, $3, $4, 'Lead da IA', 'ai', $5) on conflict (id) do nothing`,
      [lead, ORG2, pipeline, stage, agente],
    );

    const { rows: antes } = await pool.query<{ owner_kind: string | null; owner_agent_id: string | null }>(
      "select owner_kind, owner_agent_id from crm_leads where id = $1",
      [lead],
    );
    expect(antes[0]!.owner_kind, "controle: o lead nasce atribuído à IA").toBe("ai");
    expect(antes[0]!.owner_agent_id).toBe(agente);

    // Antes da 0115: o SET NULL da FK zerava `owner_agent_id` e deixava
    // `owner_kind='ai'` — estado que o CHECK proíbe. O delete abortava.
    await expect(pool.query("delete from ai_agents where id = $1", [agente])).resolves.toBeDefined();

    const { rows: depois } = await pool.query<{ owner_kind: string | null; owner_agent_id: string | null }>(
      "select owner_kind, owner_agent_id from crm_leads where id = $1",
      [lead],
    );
    // O lead SOBREVIVE — apagar o agente não pode levar o negócio junto.
    expect(depois, "o lead não pode sumir com o agente").toHaveLength(1);
    // E fica coerente: sem dono nos DOIS campos, não meio-atribuído.
    expect(depois[0]!.owner_agent_id).toBeNull();
    expect(depois[0]!.owner_kind).toBeNull();
  });

  it("o CHECK continua VALENDO — o conserto não afrouxou o invariante", async () => {
    // A saída preguiçosa seria tolerar `owner_kind='ai'` sem agente. Isso
    // trocaria um erro barulhento por dado incoerente em silêncio, e este caso
    // reprova quem tentar.
    // Ids diretos, não subquery: a versão anterior deste caso caía em
    // `stage_id` nulo e "passava" pelo motivo errado — teria seguido verde se
    // alguém afrouxasse o CHECK.
    await expect(
      pool.query(
        `insert into crm_leads (organization_id, pipeline_id, stage_id, title, owner_kind, owner_agent_id)
         values ($1, $2, $3, 'Lead incoerente', 'ai', null)`,
        [ORG2, "de1e7e00-0000-4000-8000-0000000000b1", "de1e7e00-0000-4000-8000-0000000000c2"],
      ),
    ).rejects.toThrow(/owner_kind_coherence|violates check constraint/i);
  });
});
