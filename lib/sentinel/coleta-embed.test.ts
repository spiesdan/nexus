import { describe, expect, it, vi } from "vitest";

/**
 * A COLETA QUE FICOU CEGA NA 1.62.0 — provada de ponta a ponta, com um fake que
 * reproduz o PostgREST ambíguo.
 *
 * O fake devolve o erro real de produção quando o select de `crm_leads` pede
 * `crm_stages(` sem hint (`more than one relationship was found`). Antes do fix
 * isso virava `falhas: ["leads_abertos: …"]` e o motor pulava
 * `operacao.lead_duplicado`. Com o hint, a mesma coleta devolve a linha e a
 * etapa chega na evidência.
 */
const SELECTS: string[] = [];

const adminFake = {
  from(tabela: string) {
    let selecao = "";
    const q = {
      select: (arg: string) => {
        selecao = arg;
        if (tabela === "crm_leads") SELECTS.push(arg);
        return q;
      },
      eq: () => q,
      neq: () => q,
      gt: () => q,
      gte: () => q,
      lt: () => q,
      is: () => q,
      in: () => q,
      or: () => q,
      not: () => q,
      order: () => q,
      limit: () => q,
      then: (resolve: (v: unknown) => void) => {
        if (tabela === "crm_leads" && !selecao.includes("!crm_leads_stage_id_fkey")) {
          resolve({
            data: null,
            error: {
              message:
                "Could not embed because more than one relationship was found for 'crm_leads' and 'crm_stages'",
            },
          });
          return;
        }
        if (tabela === "crm_leads") {
          resolve({
            data: [
              {
                id: "lead-1",
                pipeline_id: "funil-1",
                stage_id: "etapa-1",
                contact_id: "contato-1",
                created_at: "2026-11-01T10:00:00.000Z",
                crm_stages: { name: "Qualificação" },
                contatos: {
                  name: "Ana",
                  display_name: null,
                  phone_number: "+5511999998888",
                  email_normalized: null,
                },
              },
            ],
            error: null,
          });
          return;
        }
        resolve({ data: [], error: null });
      },
    };
    return q;
  },
  rpc: () => Promise.resolve({ data: [], error: null }),
};

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminFake }));

const { coletarSnapshot } = await import("@/lib/sentinel/coleta");

describe("coleta do Sentinel — leads abertos com etapa", () => {
  it("não falha, não trunca e a evidência traz a etapa e o contato", async () => {
    const r = await coletarSnapshot("org-1", Date.parse("2026-11-20T12:00:00.000Z"));

    expect(r.falhas.filter((f) => f.startsWith("leads_abertos"))).toEqual([]);
    expect(r.truncados).not.toContain("leads_abertos");
    expect(r.snapshot.leadsAbertos).toHaveLength(1);
    expect(r.snapshot.leadsAbertos[0]!.crm_stages).toEqual({ name: "Qualificação" });
    // O alias `contatos:` é o que faz o tipo e a regra de duplicidade lerem o
    // contato — sem ele o PostgREST devolve `contacts` e a evidência cai no id.
    expect(r.snapshot.leadsAbertos[0]!.contatos?.name).toBe("Ana");
  });

  it("o select enviado tem os dois hints (etapa e contato)", () => {
    expect(SELECTS.at(-1)).toContain("crm_stages!crm_leads_stage_id_fkey(name)");
    expect(SELECTS.at(-1)).toContain("contatos:contacts!crm_leads_contact_id_fkey(");
  });
});
