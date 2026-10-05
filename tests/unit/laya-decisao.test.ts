import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O motor de decisão do radar (0258) — fail-soft, alinhamento e orçamento.
 *
 * O que se prova aqui é o que a tela NÃO consegue provar: que uma resposta
 * malformada vira "sem sugestão" e não vira sugestão de outro lead (o defeito
 * silencioso de um `filter` antes de um `map` posicional), que o teto por
 * passada vale, e que o motor fora não derruba nada.
 */
const { envMock } = vi.hoisted(() => ({
  envMock: {
    LAYA_URL: "http://laya:8000",
    LAYA_API_KEY: "chave-do-motor",
    LAYA_DECISAO_POR_TICK: 32,
    LAYA_TIMEOUT_MS: 45_000,
  },
}));
vi.mock("@/lib/env", () => ({ env: envMock }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { decideAcoesDoRadar, motorDeDecisaoLigado, novoOrcamento } = await import(
  "@/lib/leads/laya-decisao"
);

interface MensagemFake {
  contact_id: string;
  body: string | null;
  direction: string;
  sent_at: string;
}

interface OpcoesFake {
  mensagens?: MensagemFake[];
  titulos?: Array<{ id: string; title: string }>;
  decisoesJaGravadas?: Array<{ lead_id: string }>;
  erroEm?: "crm_leads" | "messages" | "decisoes";
}

function adminFake(opcoes: OpcoesFake = {}) {
  const gravadas: Array<Record<string, unknown>> = [];
  const mensagens = opcoes.mensagens ?? [];
  const titulos = opcoes.titulos ?? [];
  const decididas = opcoes.decisoesJaGravadas ?? [];

  function resposta(tabela: string, foiUpsert: boolean) {
    if (foiUpsert) return { data: null, error: null };
    if (opcoes.erroEm === tabela) return { data: null, error: { message: "falhou" } };
    if (tabela === "crm_leads") return { data: titulos, error: null };
    if (tabela === "messages") return { data: mensagens, error: null };
    if (tabela === "crm_lead_risk_decisions") return { data: decididas, error: null };
    return { data: [], error: null };
  }

  class Builder {
    private upsertou = false;
    constructor(private readonly tabela: string) {}
    select() {
      return this;
    }
    eq() {
      return this;
    }
    in() {
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    upsert(linhas: Array<Record<string, unknown>>) {
      this.upsertou = true;
      gravadas.push(...linhas);
      return this;
    }
    then(
      resolve: (v: ReturnType<typeof resposta>) => void,
      reject?: (e: unknown) => void,
    ) {
      try {
        resolve(resposta(this.tabela, this.upsertou));
      } catch (e) {
        reject?.(e);
      }
    }
  }

  return {
    cliente: { from: (tabela: string) => new Builder(tabela) },
    gravadas,
  };
}

function candidato(leadId: string) {
  return {
    leadId,
    contactId: `contato-${leadId}`,
    bucket: "em_risco" as const,
    esfriouEm: new Date("2026-10-01T08:00:00Z"),
  };
}

function respostaMotor(escolhas: Array<string | undefined>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      results: escolhas.map((choice) => ({
        model: "multilingual",
        answers:
          choice === undefined
            ? {}
            : {
                acao: {
                  type: "choice",
                  choice,
                  confidence: 0.77,
                  probabilities: { [choice]: 0.77 },
                },
              },
        usage: { input_tokens: 10, output_tokens: 1 },
      })),
      total_usage: { input_tokens: 10, output_tokens: 1 },
    }),
  };
}

const agora = new Date("2026-10-04T12:00:00Z");

beforeEach(() => {
  envMock.LAYA_URL = "http://laya:8000";
  envMock.LAYA_API_KEY = "chave-do-motor";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(respostaMotor(["reativar"])),
  );
});

describe("motor de decisão do radar", () => {
  it("sem LAYA_URL o recurso fica desligado e nada é chamado", async () => {
    envMock.LAYA_URL = "";
    const { cliente } = adminFake();
    const r = await decideAcoesDoRadar(cliente as never, "org", [candidato("l1")], agora, novoOrcamento());
    expect(r.desligada).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(motorDeDecisaoLigado()).toBe(false);
  });

  it("grava a decisão no lead CERTO, com confiança e no orçamento", async () => {
    const { cliente, gravadas } = adminFake({
      titulos: [{ id: "l1", title: "Orçamento - Obra X" }],
      mensagens: [
        {
          contact_id: "contato-l1",
          body: "Oi, ainda quero o orçamento",
          direction: "inbound",
          sent_at: "2026-10-01T07:00:00Z",
        },
      ],
    });
    const orcamento = novoOrcamento();
    const r = await decideAcoesDoRadar(cliente as never, "org", [candidato("l1")], agora, orcamento);

    expect(r.decididas).toBe(1);
    expect(r.falhou).toBe(false);
    expect(orcamento.restante).toBe(envMock.LAYA_DECISAO_POR_TICK - 1);
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]).toMatchObject({
      lead_id: "l1",
      organization_id: "org",
      acao: "reativar",
      confianca: 0.77,
      modelo: "multilingual",
    });
    // Bearer no header do motor, nunca na query string.
    const chamada = vi.mocked(fetch).mock.calls[0]!;
    expect(chamada[0]).toBe("http://laya:8000/v1/systemone/batch");
    expect((chamada[1] as RequestInit).headers).toMatchObject({
      authorization: "Bearer chave-do-motor",
    });
  });

  it("motor fora (HTTP 500) não lança: fail-soft, contado como falhou", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { cliente, gravadas } = adminFake({
      mensagens: [
        {
          contact_id: "contato-l1",
          body: "olá",
          direction: "inbound",
          sent_at: "2026-10-01T07:00:00Z",
        },
      ],
    });
    const r = await decideAcoesDoRadar(cliente as never, "org", [candidato("l1")], agora, novoOrcamento());
    expect(r.falhou).toBe(true);
    expect(r.decididas).toBe(0);
    expect(gravadas).toHaveLength(0);
  });

  it("resposta fora do vocabulário não vira linha (nem quebra o lote)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaMotor(["vender_ahora"])));
    const { cliente, gravadas } = adminFake({
      mensagens: [
        {
          contact_id: "contato-l1",
          body: "olá",
          direction: "inbound",
          sent_at: "2026-10-01T07:00:00Z",
        },
      ],
    });
    const r = await decideAcoesDoRadar(cliente as never, "org", [candidato("l1")], agora, novoOrcamento());
    expect(r.falhou).toBe(false);
    expect(r.decididas).toBe(0);
    expect(gravadas).toHaveLength(0);
  });

  it("lead sem histórico não é decidido no escuro — e o motor nem é chamado", async () => {
    const { cliente } = adminFake({ mensagens: [] });
    const r = await decideAcoesDoRadar(cliente as never, "org", [candidato("l1")], agora, novoOrcamento());
    expect(r.semEvidencia).toBe(1);
    expect(r.decididas).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("orçamento corta ANTES de coletar: só o que cabe entra", async () => {
    const mensagens = ["l1", "l2", "l3"].map((id) => ({
      contact_id: `contato-${id}`,
      body: "oi",
      direction: "inbound",
      sent_at: "2026-10-01T07:00:00Z",
    }));
    const { cliente, gravadas } = adminFake({ mensagens });
    const orcamento = { restante: 1 };
    const r = await decideAcoesDoRadar(
      cliente as never,
      "org",
      [candidato("l1"), candidato("l2"), candidato("l3")],
      agora,
      orcamento,
    );
    expect(r.decididas).toBe(1);
    expect(r.adiadas).toBe(2);
    expect(gravadas).toHaveLength(1);
    expect(orcamento.restante).toBe(0);
    // UMA chamada só: o que não cabe nem chega ao servidor.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("acima de 64 states corta em lotes do tamanho do servidor", async () => {
    const candidatos = Array.from({ length: 70 }, (_, i) => candidato(`l${i}`));
    const mensagens = candidatos.map((c) => ({
      contact_id: c.contactId,
      body: "oi",
      direction: "inbound",
      sent_at: "2026-10-01T07:00:00Z",
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        const corpo = JSON.parse(String(init?.body)) as { states: string[] };
        return respostaMotor(corpo.states.map(() => "aguardar"));
      }),
    );
    const { cliente, gravadas } = adminFake({ mensagens });
    const r = await decideAcoesDoRadar(cliente as never, "org", candidatos, agora, {
      restante: 200,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    const corpos = vi
      .mocked(fetch)
      .mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)) as { states: string[] });
    expect(corpos[0]!.states).toHaveLength(64);
    expect(corpos[1]!.states).toHaveLength(6);
    expect(r.decididas).toBe(70);
    expect(gravadas).toHaveLength(70);
    // E cada decisão continua no SEU lead: o índice é o do lote, não o da lista.
    expect(gravadas[64]).toMatchObject({ lead_id: "l64" });
    expect(gravadas[69]).toMatchObject({ lead_id: "l69" });
  });
});
