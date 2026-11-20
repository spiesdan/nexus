import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SELECT_LEAD_ABERTO } from "./selects";

/**
 * O EMBED AMBÍGUO QUE CEGOU O SENTINEL — a regressão da 1.62.0.
 *
 * Produção devolveu:
 *
 *   Could not embed because more than one relationship was found
 *   for 'crm_leads' and 'crm_stages'
 *
 * O `crm_stages(name)` sem hint depende de existir UMA FK entre as tabelas. No
 * banco com drift existem duas, e a coleta inteira vira `falhas` — a regra
 * `operacao.lead_duplicado` deixa de ser avaliada. Estes testes falhariam antes
 * do fix: o select não teria hint e a constraint citada não estaria no baseline.
 */
describe("selects do Sentinel — embed com hint de FK", () => {
  it("todo embed de crm_leads traz hint explícito (nada de `tabela(` cru)", () => {
    // Pega `crm_stages(` e `contacts(` que NÃO estejam precedidos de `!`.
    const semHint = SELECT_LEAD_ABERTO.match(/(?<![!\w])(crm_stages|contacts)\(/g);
    expect(semHint).toBeNull();

    expect(SELECT_LEAD_ABERTO).toContain("crm_stages!crm_leads_stage_id_fkey(name)");
    expect(SELECT_LEAD_ABERTO).toContain("contacts!crm_leads_contact_id_fkey(");
  });

  it("o hint aponta para uma constraint que o baseline instala", () => {
    const baseline = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");
    expect(baseline).toContain('CONSTRAINT "crm_leads_stage_id_fkey"');
    expect(baseline).toContain('CONSTRAINT "crm_leads_contact_id_fkey"');
  });

  it("a etapa vem no select — a evidência não perde o nome", () => {
    expect(SELECT_LEAD_ABERTO).toContain("crm_stages!crm_leads_stage_id_fkey(name)");
  });
});
