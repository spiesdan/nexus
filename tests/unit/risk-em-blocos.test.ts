import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { calculaBucketsAtuais } = await import("@/lib/leads/risk-seed");
const { carregaRadarDeRisco } = await import("@/lib/leads/radar-de-risco");

/**
 * AS DUAS CONSULTAS DO RISCO QUE NÃO TINHAM TETO.
 *
 * `risk-seed` lê TODOS os leads abertos (sem `.limit`) e derivava `stage_id` e
 * `contact_id` de todos eles; `radar-de-risco` faz o mesmo com até `SCAN_CAP`
 * leads. Em 500 UUIDs a URL do PostgREST passa de 18 kB e a resposta é 414 — o
 * risk-watcher morria a cada 15 min. Estes testes provam que a consulta fatiada
 * devolve **o mesmo resultado** que a consulta única devolveria, com 5 e com
 * 350 ids, e que 350 ids viram 4 consultas por tabela.
 */
const AGORA = new Date("2026-11-20T12:00:00Z");
const DEZ_DIAS = new Date(AGORA.getTime() - 10 * 24 * 3_600_000).toISOString();

type Linha = Record<string, unknown>;

interface Fake {
  cliente: unknown;
  contagem: Record<string, number>;
  blocos: Record<string, number[]>;
}

/**
 * Admin fake mínimo: honra `in(coluna, ids)` (é o que os dois módulos usam para
 * juntar as relações) e conta consultas e tamanho das fatias por tabela.
 */
function adminFake(tabelas: Record<string, Linha[]>): Fake {
  const contagem: Record<string, number> = {};
  const blocos: Record<string, number[]> = {};

  function builder(tabela: string) {
    let coluna: string | null = null;
    let ids: string[] | null = null;
    let limite: number | null = null;

    const b = {
      select: () => b,
      eq: () => b,
      gt: () => b,
      is: () => b,
      order: () => b,
      limit: (n: number) => {
        limite = n;
        return b;
      },
      in: (col: string, valores: string[]) => {
        coluna = col;
        ids = valores;
        return b;
      },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        try {
          let linhas = [...(tabelas[tabela] ?? [])];
          if (coluna && ids) {
            const conjunto = new Set(ids);
            linhas = linhas.filter((l) => conjunto.has(String(l[coluna!])));
          }
          if (limite !== null) linhas = linhas.slice(0, limite);
          resolve({ data: linhas, error: null });
        } catch (e) {
          reject?.(e);
        }
      },
    };
    return b;
  }

  const cliente = {
    from: (tabela: string) => {
      contagem[tabela] = (contagem[tabela] ?? 0) + 1;
      // Registra o tamanho da fatia no `in` — o builder guarda e devolve aqui.
      const b = builder(tabela);
      const original = b.in;
      b.in = (col: string, valores: string[]) => {
        (blocos[tabela] ??= []).push(valores.length);
        return original(col, valores);
      };
      return b;
    },
  };

  return { cliente, contagem, blocos };
}

function leadsDe(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `lead-${i}`,
    title: `Negócio ${i}`,
    contact_id: `contato-${i}`,
    owner_user_id: null,
    owner_kind: "user",
    owner_agent_id: `agente-${i}`,
    stage_id: `etapa-${i}`,
    last_activity_at: DEZ_DIAS,
    created_at: DEZ_DIAS,
    pipeline_id: "funil-unico",
    status: "open",
  }));
}

function tabelasDe(n: number): Record<string, Linha[]> {
  const leads = leadsDe(n);
  return {
    crm_leads: leads,
    crm_stages: leads.map((l, i) => ({
      id: l.stage_id,
      expected_duration_hours: 24 + (i % 3),
      name: `Etapa ${i}`,
    })),
    ai_agents: leads.map((l, i) => ({ id: l.owner_agent_id, name: `Agente ${i}` })),
    contacts: leads.map((l, i) => ({
      id: l.contact_id,
      name: `Contato ${i}`,
      display_name: null,
    })),
    conversations: leads.map((l, i) => ({
      id: `conversa-${i}`,
      contact_id: l.contact_id,
      assignee_kind: "user",
    })),
    // Sem follow-up agendado: todo mundo está frio, nada "em voo".
    cron_jobs: [],
    demandas: [],
    crm_lead_risk_decisions: [],
    crm_lead_risk_states: [],
  };
}

function contarConsultas(fake: Fake, tabelas: string[]) {
  return Object.fromEntries(tabelas.map((t) => [t, fake.contagem[t] ?? 0]));
}

describe("risk-seed — stage_id e contact_id sem teto", () => {
  it("350 leads: 4 consultas por relação e o resultado é o mesmo da lista curta", async () => {
    const grande = adminFake(tabelasDe(350));
    const estados350 = await calculaBucketsAtuais(grande.cliente as never, "org", AGORA);

    const pequeno = adminFake(tabelasDe(5));
    const estados5 = await calculaBucketsAtuais(pequeno.cliente as never, "org", AGORA);

    expect(estados350).toHaveLength(350);
    expect(estados350.slice(0, 5)).toEqual(estados5);

    expect(contarConsultas(pequeno, ["crm_leads", "crm_stages", "cron_jobs"])).toEqual({
      crm_leads: 1,
      crm_stages: 1,
      cron_jobs: 1,
    });
    expect(contarConsultas(grande, ["crm_stages", "cron_jobs"])).toEqual({
      crm_stages: 4,
      cron_jobs: 4,
    });
    expect(grande.blocos.crm_stages).toEqual([100, 100, 100, 50]);
    expect(grande.blocos.cron_jobs).toEqual([100, 100, 100, 50]);
    // Nenhuma fatia passou do teto que existe para não estourar a URL.
    expect((grande.blocos.crm_stages ?? []).every((n) => n <= 100)).toBe(true);
  });
});

describe("radar-de-risco — dono, etapa e contato sem teto", () => {
  async function radar(n: number, limit: number) {
    const fake = adminFake(tabelasDe(n));
    const r = await carregaRadarDeRisco(fake.cliente as never, {
      organizationId: "org",
      limit,
      minHours: 0,
      now: AGORA,
    });
    return { r, fake };
  }

  it("350 ids: 4 consultas por tabela, resultado igual ao da lista de 5", async () => {
    const grande = await radar(350, 350);
    const pequeno = await radar(5, 5);

    expect(grande.r.items).toHaveLength(350);
    expect(grande.r.items.slice(0, 5)).toEqual(pequeno.r.items);
    expect(pequeno.r.items[0]).toMatchObject({
      owner_agent_name: "Agente 0",
      contact_name: "Contato 0",
      assignee_kind: "user",
    });

    const relacoes = ["ai_agents", "crm_stages", "cron_jobs", "conversations", "contacts"];
    expect(contarConsultas(pequeno.fake, relacoes)).toEqual(
      Object.fromEntries(relacoes.map((t) => [t, 1])),
    );
    expect(contarConsultas(grande.fake, relacoes)).toEqual(
      Object.fromEntries(relacoes.map((t) => [t, 4])),
    );
    for (const tabela of relacoes) {
      expect(grande.fake.blocos[tabela]).toEqual([100, 100, 100, 50]);
    }
  });
});
