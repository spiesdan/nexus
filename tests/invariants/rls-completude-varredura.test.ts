import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";
import { TABELAS_PROVADAS_AQUI } from "./f17-tabelas-provadas";
import { TABLES } from "./rls-isolation.test";

/**
 * VARREDURA de completude de RLS — o buraco que o próprio `rls-isolation.test.ts`
 * confessa no cabeçalho da sua lista `TABLES` (linha ~208):
 *
 *     ⚠️ LISTA FIXA — tabela tenant-aware nova que NÃO entrar aqui passa verde
 *     sem RLS. Não existe varredura genérica do tipo "toda tabela com
 *     organization_id tem relrowsecurity = true".
 *
 * ## Por que NÃO basta olhar só o catálogo (`relrowsecurity` + "tem policy")
 *
 * Porque uma policy pode estar sabotada e ainda assim passar em qualquer
 * checagem de catálogo. Medido de verdade neste repo: `org_guardrail_layers`
 * tinha `relrowsecurity = true` e uma policy — e a policy dizia
 * `organization_id in (select fn_user_org_ids()) or true`, que devolve a
 * organização INTEIRA do vizinho. RLS ligada e policy presente não é isolamento;
 * é só a forma que o isolamento tem que ter. A prova real só existe simulando o
 * JWT de um usuário de verdade e CONTANDO linhas cross-tenant — o que
 * `rls-isolation.test.ts` já faz, por tabela, na lista `TABLES`.
 *
 * ## O que ESTA varredura fecha, então
 *
 * `TABLES` é mantida à mão. Quem cria uma tabela nova com `organization_id` e
 * esquece de acrescentar a linha ali (no MESMO commit da migration, como o
 * comentário de lá já pede) não quebra nada: o CI segue verde, e a tabela fica
 * sem NENHUMA prova de isolamento — nem de catálogo, nem de comportamento.
 * Ninguém percebe até alguém vazar dado do vizinho em produção.
 *
 * Esta varredura DERIVA a lista de tabelas tenant-aware do catálogo (não há o
 * que esquecer de acrescentar) e reprova qualquer uma que não apareça em
 * `TABLES` nem numa exceção nomeada — forçando toda tabela nova a ganhar o
 * teste comportamental de verdade antes que o gate deixe passar.
 *
 * ## As duas listas de exceção, e por que são duas coisas diferentes
 *
 * Não existe uma varredura anterior a esta, então aplicar a regra "está em
 * TABLES ou reprova" de uma vez batia em 73 tabelas que já existem hoje, têm
 * RLS ligada, mas nunca ganharam um teste `set role authenticated` + contagem
 * cross-org num arquivo dedicado — dívida herdada, não introduzida por esta
 * mudança. Fingir que elas "passam" seria mentir; fazer o gate nascer vermelho
 * em 73 tabelas de uma vez não é tratável nesta sessão (cada uma exigiria seed
 * + fixture própria). A saída honesta é DISTINGUIR as duas classes:
 *
 *   - `PROVA_PROPRIA`: tabela fora de `TABLES`, mas com teste comportamental
 *     real (JWT simulado + contagem cross-org) em outro arquivo — o mesmo
 *     padrão de `webhook_lead_captures`, que já vivia assim antes desta
 *     varredura existir. Cada entrada cita o arquivo que prova.
 *   - `DEBITO_CONHECIDO`: tabela SEM prova comportamental nenhuma, encontrada
 *     por esta varredura no dia em que ela nasceu (2026-08-27). Não é uma
 *     declaração de segurança — é a fotografia da dívida, para o gate proteger
 *     dali para frente sem fingir que o passado está resolvido. Tabela NOVA
 *     nunca entra aqui: entra em `TABLES` ou em `PROVA_PROPRIA`, com teste de
 *     verdade. Reduzir esta lista com o tempo (escrevendo o teste que falta e
 *     movendo a tabela para `TABLES`) é o caminho — não engordá-la.
 *
 * Em ambas, `relrowsecurity = true` é reconferido pela própria varredura: uma
 * exceção — de qualquer das duas listas — cuja tabela sumiu ou perdeu RLS
 * reprova, na hora, em vez de continuar "documentando" uma proteção que já não
 * existe.
 */

interface Excecao {
  readonly tabela: string;
  readonly razao: string;
}

/**
 * Tabelas fora de `TABLES` com teste comportamental de verdade em outro
 * arquivo — verificado lendo cada um: `set role authenticated` (ou
 * `countAs`/`writeCountAs`, que fazem o mesmo) + JWT do usuário + contagem de
 * linhas da OUTRA organização, não uma leitura como superusuário.
 */
const PROVA_PROPRIA: readonly Excecao[] = [
  ...(
    [
      "billing_customers",
      "billing_subscriptions",
      "billing_invoices",
      "billing_checkout_sessions",
      "billing_notices",
      "billing_events",
      "billing_verifications",
      "billing_suspensions",
    ] as const
  ).map((tabela) => ({
    tabela,
    razao:
      "tests/invariants/billing-rls-isolation.test.ts (0343) prova, com `set role " +
      "authenticated` + JWT simulado, leitura da própria org e zero da vizinha, " +
      "escrita negada a authenticated e usuário sem membership sem linha. Fora de " +
      "TABLES porque a escrita é só service role (a varredura TABLES cobre casos " +
      "com policy de escrita para authenticated).",
  })),
  ...(
    ["mercos_colisoes", "mercos_reconciliacoes"] as const
  ).map((tabela) => ({
    tabela,
    razao:
      "tests/invariants/mercos-serie-local.test.ts (0344/0345) prova, com " +
      "`set role authenticated` + JWT simulado, leitura da própria org e zero " +
      "da vizinha, e escrita negada a authenticated.",
  })),
  {
    tabela: "prospecting_followups",
    razao:
      "tests/invariants/prospect-membresia-campanhas.test.ts (0339) prova, com " +
      "`set role authenticated` + JWT simulado, leitura própria, zero da vizinha, " +
      "escrita cross-org negada e anon sem linha.",
  },
  {
    tabela: "prospecting_campaign_prospects",
    razao:
      "tests/invariants/prospect-membresia-campanhas.test.ts (0338) prova, com " +
      "`set role authenticated` + JWT simulado, que membro da org A lê a própria " +
      "membrosia e zero da org B, que escrita na vizinha é negada e que anon não " +
      "lê. Fora de TABLES pelo mesmo motivo dos casos de agent: a policy de " +
      "escrita é agent, não manager.",
  },
  {
    tabela: "prospecting_campaign_spend",
    razao:
      "tests/invariants/campaign-spend-rls.test.ts (0335) prova, com `set role " +
      "authenticated` + JWT simulado, que membro da org A lê e lança gasto na " +
      "própria campanha, zero linhas da org B nos dois sentidos, e que anon/user " +
      "sem org não leem. Fora de TABLES pelo mesmo motivo do commercial_payment_methods: " +
      "a policy de escrita é agent (TABLES cobre casos de manager).",
  },
  {
    tabela: "commercial_payment_methods",
    razao:
      "tests/invariants/payment-methods-rls.test.ts (0334) prova, com " +
      "`set role authenticated` + JWT simulado, que membro da org A lê a própria " +
      "e zero da org B, que agent não insere e manager insere na própria org, " +
      "e que anon não lê. Fora de TABLES porque a policy de escrita é manager " +
      "(TABLES semeia agent), exatamente o caso do offline_devices acima.",
  },
  {
    tabela: "offline_devices",
    razao:
      "tests/invariants/offline-devices-rls.test.ts prova, com JWT simulado e " +
      "countAs real, que admin de A lê zero aparelho de B, que revogar por id " +
      "de B afeta zero linhas e que manager NÃO gerencia (a policy é admin) — " +
      "por isso fica fora de TABLES, cujo usuário semeado é `agent`.",
  },
  {
    tabela: "webhook_lead_captures",
    razao:
      "tests/invariants/historico-de-captacao-rls.test.ts prova isolamento " +
      "cross-tenant E o gate de papel (viewer não lê). Fica fora de TABLES " +
      "de propósito: o usuário semeado em rls-isolation.test.ts é `agent`, e " +
      "a policy desta tabela exige `manager` — o controle positivo falharia " +
      "por ACERTO ali.",
  },
  {
    tabela: "meta_templates",
    razao:
      "tests/invariants/meta-templates-rls.test.ts (\"membro da org B NÃO vê " +
      "o template da org A\") prova isolamento com `countAs` real.",
  },
  {
    tabela: "webhook_sources",
    razao:
      "tests/invariants/webhooks-rls.test.ts (\"manager B (org B) NÃO vê " +
      "webhook_source/automation_rule da org A\") prova isolamento com " +
      "`countAs` real.",
  },
  {
    tabela: "automation_rules",
    razao: "tests/invariants/webhooks-rls.test.ts — mesmo caso da linha acima.",
  },
  {
    tabela: "automation_rule_runs",
    razao:
      "tests/invariants/webhooks-rls.test.ts (\"service_role insere " +
      "automation_rule_runs na org A; manager B não vê, manager A vê\").",
  },
  {
    tabela: "mercos_import_runs",
    razao:
      "tests/invariants/mercos-import-runs-rls.test.ts — JWT simulado e " +
      "contagem cross-org nas duas direções (A não lê B, B não lê A).",
  },
  {
    tabela: "calendar_event_types",
    razao:
      "tests/invariants/agenda-rls.test.ts — `TABELAS_DA_AGENDA`, com " +
      "`it.each` provando 0 linhas cross-org nos dois sentidos (A→B e B→A).",
  },
  {
    tabela: "calendar_appointments",
    razao: "tests/invariants/agenda-rls.test.ts — mesmo `it.each` de TABELAS_DA_AGENDA.",
  },
  {
    tabela: "calendar_availability_exceptions",
    razao: "tests/invariants/agenda-rls.test.ts — mesmo `it.each` de TABELAS_DA_AGENDA.",
  },
  {
    tabela: "calendar_connections",
    razao:
      "tests/invariants/agenda-rls.test.ts — TABELAS_DA_AGENDA prova o " +
      "isolamento cross-org, e o describe seguinte (\"o gate de papel que as " +
      "outras cinco não têm\") ainda prova o gate de dono/role por cima.",
  },
  {
    tabela: "calendar_connection_calendars",
    razao: "tests/invariants/agenda-rls.test.ts — mesmo `it.each` de TABELAS_DA_AGENDA.",
  },
  {
    tabela: "calendar_external_events",
    razao: "tests/invariants/agenda-rls.test.ts — mesmo `it.each` de TABELAS_DA_AGENDA.",
  },
  {
    tabela: "followup_flow_versions",
    razao:
      "tests/invariants/followup-schema.test.ts — `FOLLOWUP_TABLES`, com " +
      "\"user of org A reads 0 rows of org B\" por tabela (mesmo molde de " +
      "rls-isolation.test.ts).",
  },
  {
    tabela: "followup_flow_pointers",
    razao: "tests/invariants/followup-schema.test.ts — mesmo laço de FOLLOWUP_TABLES.",
  },
  {
    tabela: "followup_enrollments",
    razao: "tests/invariants/followup-schema.test.ts — mesmo laço de FOLLOWUP_TABLES.",
  },
  {
    tabela: "followup_enrollment_events",
    razao: "tests/invariants/followup-schema.test.ts — mesmo laço de FOLLOWUP_TABLES.",
  },
  {
    tabela: "user_organizations",
    razao:
      "tests/invariants/gov-1b-team-manager-read.test.ts (\"cross-org: " +
      "manager da org A NÃO lê linhas da org B (0 rows)\") prova isolamento " +
      "com `countAs` real, além do self-read do agent.",
  },
  {
    tabela: "fiscal_certificates",
    razao:
      "tests/invariants/fiscal-entrada-modulo-0290.test.ts — `countAs` do " +
      "agent B contra a org A (0 linhas) e `writeCountAs` provando que o " +
      "agent não troca o certificado (manager troca).",
  },
  {
    tabela: "fiscal_document_items",
    razao:
      "tests/invariants/fiscal-entrada-modulo-0290.test.ts — leitura " +
      "cross-org com `countAs` (A lê 1, B lê 0) e INSERT do agent recusado " +
      "(escrita é do sync, via service_role).",
  },
  {
    tabela: "fiscal_document_events",
    razao:
      "tests/invariants/fiscal-entrada-modulo-0290.test.ts — mesmo par " +
      "`countAs`/`writeCountAs`, e o replay por (org, chave, NSU) não duplica.",
  },
  {
    tabela: "fiscal_manifestations",
    razao:
      "tests/invariants/fiscal-entrada-modulo-0290.test.ts — isolamento " +
      "cross-org e a regra de papel na policy: ciência do agent passa, " +
      "confirmação do agent não (manager passa).",
  },
  {
    tabela: "fiscal_sync_logs",
    razao:
      "tests/invariants/fiscal-entrada-modulo-0290.test.ts — `countAs` " +
      "cross-org (B lê 0 da org A) e `writeCountAs` do agent recusado: o log " +
      "é escrito pelo serviço, não pelo navegador.",
  },
  {
    tabela: "endereco_entradas",
    razao:
      "tests/invariants/entrada-do-endereco.test.ts — `countAs` do agent B " +
      "vê 0 linhas da org A, `writeCountAs` recusa escrita cross-org e " +
      "viewer não escreve nem na própria org (migration 0311).",
  },
  // F-17 — 39 tabelas que estavam em DEBITO_CONHECIDO e ganharam prova
  // comportamental real (JWT simulado + contagem cross-org + controle positivo)
  // em rls-camadas-restantes-do-debito.test.ts. A lista vive em módulo próprio
  // para os dois arquivos lerem a MESMA fonte.
  ...TABELAS_PROVADAS_AQUI.map((tabela) => ({
    tabela,
    razao:
      "tests/invariants/rls-camadas-restantes-do-debito.test.ts — admin da org D " +
      "lê 0 linhas da org E e ≥1 da própria org, por tabela (F-17).",
  })),
  {
    tabela: "agent_case_events",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "agent_cases",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "ai_agent_runs",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "ai_agent_versions",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "ai_agents",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "ai_budgets",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "ai_chunks",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "ai_faq_items",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "ai_invocations",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "ai_knowledge_sources",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "ai_knowledge_versions",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "ai_purpose_bindings",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "ai_router_members",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "api_audit_log",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "attendant_availability",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "calendar_oauth_nonces",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — a policy é " +
      "`using (false)` e o authenticated não tem SELECT: nonce de OAuth é " +
      "service role. A prova é o acesso negado, mais forte que contar org.",
  },
  {
    tabela: "channel_session_warmup",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "conversation_assignment_events",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "crm_lead_activities",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "crm_lead_links",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "crm_lead_reactivations",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "crm_lead_risk_states",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "demanda_conversas",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "demandas",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "event_log",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "idempotency_keys",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "incidents",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — policy " +
      "`platform_admin_only_incidents`: admin de tenant lê 0 nas DUAS orgs; " +
      "a leitura de plataforma é provada nos testes de admin.",
  },
  {
    tabela: "lgpd_requests",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "merge_queue",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "nuvemshop_products",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "orders",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "org_memory_pointers",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "storage_redaction_queue",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
  {
    tabela: "webhook_events_log",
    razao:
      "tests/invariants/f17-restantes-do-debito.test.ts — admin da org D lê " +
      "0 linhas da org E e ≥1 da própria org, com seed nas duas orgs.",
  },
];

/**
 * Dívida herdada — sem teste comportamental, fotografada em 2026-08-27 por
 * esta própria varredura. Ver o cabeçalho do arquivo: NÃO adicione tabela nova
 * aqui. Tabela nova entra em `TABLES` (rls-isolation.test.ts) com teste real,
 * ou em `PROVA_PROPRIA` acima, citando o arquivo que prova.
 */
const DEBITO_CONHECIDO: readonly Excecao[] = [];

interface TabelaOrg {
  readonly tabela: string;
  readonly rlsLigada: boolean;
}

/** Toda tabela BASE de `public` que tem uma coluna `organization_id`. */
function inventario(): TabelaOrg[] {
  const out = sql(`
    select c.relname || '\t' || c.relrowsecurity::text
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
                         and a.attname = 'organization_id' and a.attnum > 0
     where n.nspname = 'public' and c.relkind = 'r'
     order by 1;
  `);
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .map((linha) => {
      // `relrowsecurity::text` — CAST explícito — produz 'true'/'false', não
      // o 't'/'f' que o psql imprime para uma coluna boolean CRUA. Comparar
      // com "t" (o hábito de quem já leu boolean de psql direto) reprova toda
      // tabela em massa por instrumento cego, não por RLS desligada — foi
      // medido rodando este arquivo. `hardening-definer-varredura.test.ts` já
      // acerta isso comparando com "true"; aqui é o mesmo cast.
      const [tabela, rls] = linha.split("\t");
      return { tabela: (tabela ?? "").trim(), rlsLigada: (rls ?? "").trim() === "true" };
    });
}

describe("varredura: completude de RLS sobre toda tabela com organization_id", () => {
  it("o inventário não vem vazio (guarda de vacuidade)", () => {
    // Mesma razão de ser do caso análogo em hardening-definer-varredura.test.ts:
    // sem isto, um catálogo que deixasse de casar (coluna renomeada, schema
    // trocado) faria as asserções abaixo passarem por AUSÊNCIA de dado. O
    // número é o medido em 2026-08-27 (102 tabelas); a asserção é de ordem de
    // grandeza, não de igualdade, para não reprovar a cada tabela nova.
    expect(inventario().length).toBeGreaterThanOrEqual(90);
  });

  it("toda tabela com organization_id tem row level security LIGADA", () => {
    const sem = inventario()
      .filter((t) => !t.rlsLigada)
      .map((t) => t.tabela);
    expect(
      sem,
      "Tabela com `organization_id` e SEM RLS: alcançável pelo PostgREST com " +
        "a anon key + o JWT de qualquer usuário logado. Acrescente `alter " +
        "table ... enable row level security` na migration.",
    ).toEqual([]);
  });

  it("toda tabela tenant-aware tem prova comportamental — está em TABLES ou é exceção nomeada", () => {
    // Este é o caso que fecha o buraco de verdade: RLS ligada (caso acima) não
    // é isolamento provado — só a forma que o isolamento tem que ter. Uma
    // tabela só passa aqui se estiver em TABLES (teste comportamental de
    // verdade), em PROVA_PROPRIA (teste comportamental em outro arquivo,
    // citado) ou em DEBITO_CONHECIDO (dívida herdada, fotografada — não uma
    // aprovação).
    const conhecidas = new Set<string>([
      ...TABLES,
      ...PROVA_PROPRIA.map((e) => e.tabela),
      ...DEBITO_CONHECIDO.map((e) => e.tabela),
    ]);
    const semRegistro = inventario()
      .map((t) => t.tabela)
      .filter((tabela) => !conhecidas.has(tabela));
    expect(
      semRegistro,
      "Tabela tenant-aware NOVA sem prova comportamental nenhuma. Acrescente " +
        "a tabela em TABLES (tests/invariants/rls-isolation.test.ts) com um " +
        "teste `set role authenticated` + JWT + contagem cross-org, no MESMO " +
        "commit da migration — ou, se já existir teste assim em outro " +
        "arquivo, declare em PROVA_PROPRIA (neste arquivo) citando-o. NÃO " +
        "acrescente em DEBITO_CONHECIDO: aquela lista é só a dívida herdada " +
        "de antes desta varredura existir.",
    ).toEqual([]);
  });

  it("as exceções de PROVA_PROPRIA ainda existem e ainda têm RLS ligada", () => {
    // As duas mortes de sempre: exceção para tabela que sumiu vira ruído que
    // ninguém apaga; exceção para tabela que perdeu RLS finge segurança que já
    // não existe.
    const porTabela = new Map(inventario().map((t) => [t.tabela, t]));
    for (const { tabela } of PROVA_PROPRIA) {
      const achada = porTabela.get(tabela);
      expect(achada, `PROVA_PROPRIA cita tabela inexistente: ${tabela}`).toBeDefined();
      expect(
        achada?.rlsLigada,
        `${tabela} está em PROVA_PROPRIA mas perdeu RLS — não é mais exceção, é tabela exposta`,
      ).toBe(true);
    }
  });

  it("as exceções de DEBITO_CONHECIDO ainda existem e ainda têm RLS ligada", () => {
    const porTabela = new Map(inventario().map((t) => [t.tabela, t]));
    for (const { tabela } of DEBITO_CONHECIDO) {
      const achada = porTabela.get(tabela);
      expect(achada, `DEBITO_CONHECIDO cita tabela inexistente: ${tabela} — remova a entrada`).toBeDefined();
      expect(
        achada?.rlsLigada,
        `${tabela} está em DEBITO_CONHECIDO mas perdeu RLS — isto não é mais só falta de teste, é tabela exposta`,
      ).toBe(true);
    }
  });
});
