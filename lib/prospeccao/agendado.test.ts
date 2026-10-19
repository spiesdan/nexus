import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParametrosDoEnvio } from "./envio";
import { processarCampanhasAgendadas } from "./agendado";

/**
 * ADMIN FALSO — um mini-PostgREST por tabela (filtros, ordem, limite, update,
 * upsert). É o suficiente porque o motor só usa o encadeamento padrão; e é
 * falso de propósito: o teste prova as DECISÕES, não o driver.
 */
type Linha = Record<string, unknown>;

function combina(linha: Linha, filtros: unknown[]): boolean {
  for (const f of filtros) {
    const arr = f as unknown[];
    const col = arr[0] as string;
    if (arr[1] === "__not__") {
      // `.not(col, "is", null)` = "col IS NOT NULL": exclui quem é nulo.
      const op = arr[2];
      const val = arr[3];
      if (op === "is" && val === null && linha[col] === null) return false;
      continue;
    }
    if (arr[1] === "__in__") {
      if (!(arr[2] as unknown[]).includes(linha[col])) return false;
      continue;
    }
    if (linha[col] !== arr[1]) return false;
  }
  return true;
}

/**
 * Quando ligado, o insert em `prospecting_sends` devolve "nada inserido" — o que
 * outro tick overlapado teria causado. Resetado em `beforeEach`.
 */
let reservaRecusada = false;

class Query {
  private filtros: unknown[] = [];
  private ordem: { col: string; asc: boolean } | null = null;
  private limite: number | null = null;
  private acao: "select" | "update" | "upsert" = "select";
  private payload: Linha | null = null;
  private conflito: string[] | null = null;
  private ignorarDuplicados = false;

  constructor(
    private dados: Record<string, Linha[]>,
    private tabela: string,
  ) {}

  select(): this {
    return this;
  }
  update(payload: Linha): this {
    this.acao = "update";
    this.payload = payload;
    return this;
  }
  insert(payload: Linha): this {
    this.acao = "upsert";
    this.payload = payload;
    return this;
  }
  upsert(payload: Linha, opts?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this.acao = "upsert";
    this.payload = payload;
    this.conflito = opts?.onConflict?.split(",") ?? null;
    this.ignorarDuplicados = opts?.ignoreDuplicates ?? false;
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filtros.push([col, val]);
    return this;
  }
  is(col: string, val: unknown): this {
    this.filtros.push([col, val]);
    return this;
  }
  not(col: string, op: string, val: unknown): this {
    this.filtros.push([col, "__not__", op, val]);
    return this;
  }
  in(col: string, val: unknown[]): this {
    this.filtros.push([col, "__in__", val]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.ordem = { col, asc: opts?.ascending ?? true };
    return this;
  }
  limit(n: number): this {
    this.limite = n;
    return this;
  }

  private executar(): { data: Linha[] | null; error: null } {
    const linhas = this.dados[this.tabela] ?? (this.dados[this.tabela] = []);
    // Simula o tick OVERLAPADO: outro processo reservou o prospect entre a
    // leitura do ledger e o insert, então o `ON CONFLICT DO NOTHING` não devolve
    // linha. É o caso que o `ignoreDuplicates` existe para cobrir.
    if (this.acao === "upsert" && this.tabela === "prospecting_sends" && reservaRecusada) {
      return { data: null, error: null };
    }
    if (this.acao === "select") {
      let saida = linhas.filter((l) => combina(l, this.filtros));
      if (this.ordem) {
        const { col, asc } = this.ordem;
        saida = [...saida].sort((a, b) =>
          (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1),
        );
      }
      if (this.limite !== null) saida = saida.slice(0, this.limite);
      return { data: saida, error: null };
    }
    if (this.acao === "update") {
      for (const l of linhas) if (combina(l, this.filtros)) Object.assign(l, this.payload);
      return { data: null, error: null };
    }
    const p = { ...(this.payload ?? {}) };
    const existente = this.conflito
      ? linhas.find((l) => this.conflito!.every((c) => l[c] === p[c]))
      : linhas.find((l) => l.id === p.id);
    if (existente && this.ignorarDuplicados) return { data: null, error: null };
    linhas.push(p);
    return { data: [p], error: null };
  }

  maybeSingle(): Promise<{ data: Linha | null; error: null }> {
    const r = this.executar();
    return Promise.resolve({ data: r.data?.[0] ?? null, error: null });
  }

  // O cliente do Supabase é "thenable": `await admin.from(x).select(...).eq(...)`.
  then<T>(onFulfilled: (r: { data: Linha[] | null; error: null }) => T): Promise<T> {
    return Promise.resolve(this.executar()).then(onFulfilled);
  }
}

function criarAdmin(dados: Record<string, Linha[]>): SupabaseClient {
  const admin = {
    from: (tabela: string) => new Query(dados, tabela),
    rpc: () => Promise.resolve({ data: "contact-1", error: null }),
  };
  return admin as unknown as SupabaseClient;
}

/** Um prospect que PASSA na elegibilidade. */
function prospect(id: string, nome: string): Linha {
  return {
    id,
    organization_id: "org-1",
    nome,
    telefone_normalizado: `+5511999${id.slice(-3)}0000`,
    do_not_contact: false,
    bloqueado: false,
    status_comercial: "novo",
  };
}

function campanha(extra: Linha = {}): Linha {
  return {
    id: "camp-1",
    organization_id: "org-1",
    nome: "Campanha",
    prospect_ids: ["p-001", "p-002"],
    mensagens: ["A"],
    espaco_ms: 60_000,
    limite_diario: 50,
    data_inicio: "2026-10-19",
    data_fim: "2026-10-23",
    janelas: [
      { inicio: "07:00", fim: "12:00" },
      { inicio: "13:00", fim: "19:00" },
    ],
    ultimo_envio_at: null,
    status: "ativa",
    agendada_em: "2026-10-19T10:00:00.000Z",
    created_at: "2026-10-19T10:00:00.000Z",
    ...extra,
  };
}

function base(tabelas: Record<string, Linha[]>): Record<string, Linha[]> {
  return {
    organizations: [{ id: "org-1", timezone: "America/Sao_Paulo" }],
    channel_sessions: [
      { id: "sess-1", organization_id: "org-1", status: "WORKING", archived_at: null },
    ],
    pacing_ledger: [],
    prospecting_sends: [],
    business_prospects: [prospect("p-001", "Primeira"), prospect("p-002", "Segunda")],
    ...tabelas,
  };
}

/** 14:00 de São Paulo (UTC-3) — dentro da janela da tarde. */
const DENTRO = "2026-10-19T17:00:00.000Z";
/** 12:30 de São Paulo — no buraco entre as janelas. */
const FORA = "2026-10-19T15:30:00.000Z";

function senderFalso() {
  return vi.fn(
    async (_admin: SupabaseClient, _p: ParametrosDoEnvio) =>
      ({ ok: true, messageId: "m-1", status: "sent" }) as const,
  );
}

describe("processarCampanhasAgendadas", () => {
  beforeEach(() => {
    reservaRecusada = false;
  });

  it("(a) fora da janela não envia", async () => {
    const dados = base({ prospecting_campaigns: [campanha()] });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), FORA, enviar);

    expect(resumo.enviados).toBe(0);
    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.pulados).toEqual([{ campanha: "camp-1", motivo: "fora_da_janela" }]);
  });

  it("(b) dentro da janela envia UM e grava prospecting_sends", async () => {
    const dados = base({ prospecting_campaigns: [campanha()] });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(resumo.pulados).toEqual([]);
    expect(resumo.enviados).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
    const p = enviar.mock.calls[0]![1];
    expect(p.prospect.id).toBe("p-001");
    expect(p.mensagem).toBe("A");

    const sends = dados.prospecting_sends!;
    expect(sends).toHaveLength(1);
    expect(sends[0]).toMatchObject({
      campaign_id: "camp-1",
      prospect_id: "p-001",
      mensagem_indice: 0,
      enviado_em: DENTRO,
    });
  });

  it("(c) prospect já enviado não é reenviado", async () => {
    const dados = base({
      prospecting_campaigns: [campanha()],
      prospecting_sends: [
        { organization_id: "org-1", campaign_id: "camp-1", prospect_id: "p-001", enviado_em: DENTRO },
      ],
    });
    const enviar = senderFalso();
    await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0]![1].prospect.id).toBe("p-002");
    expect(dados.prospecting_sends).toHaveLength(2);
  });

  it("(d) a mensagem rotaciona de onde parou", async () => {
    const dados = base({
      prospecting_campaigns: [campanha({ mensagens: ["A", "B"] })],
      prospecting_sends: [
        { organization_id: "org-1", campaign_id: "camp-1", prospect_id: "p-001", enviado_em: DENTRO },
      ],
    });
    const enviar = senderFalso();
    await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    // 1 envio já saiu → o segundo leva a variação de índice 1.
    expect(enviar.mock.calls[0]![1].mensagem).toBe("B");
    expect(dados.prospecting_sends![1]).toMatchObject({ mensagem_indice: 1 });
  });

  it("(e) cota do dia esgotada não envia", async () => {
    const dados = base({
      prospecting_campaigns: [campanha({ limite_diario: 1 })],
      prospecting_sends: [
        { organization_id: "org-1", campaign_id: "camp-1", prospect_id: "p-001", enviado_em: DENTRO },
      ],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.pulados).toEqual([{ campanha: "camp-1", motivo: "cota_do_dia" }]);
  });

  it("(f) pacing_ledger recente bloqueia a org inteira", async () => {
    const trintaSegundosAtras = new Date(Date.parse(DENTRO) - 30_000).toISOString();
    const dados = base({
      prospecting_campaigns: [campanha()],
      pacing_ledger: [
        { organization_id: "org-1", channel_session_id: "sess-1", sent_at: trintaSegundosAtras },
      ],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.pulados).toEqual([{ campanha: "camp-1", motivo: "intervalo" }]);
  });

  it("(g) sem prospect restante, a campanha conclui sozinha", async () => {
    const dados = base({
      prospecting_campaigns: [campanha()],
      prospecting_sends: [
        { organization_id: "org-1", campaign_id: "camp-1", prospect_id: "p-001", enviado_em: DENTRO },
        { organization_id: "org-1", campaign_id: "camp-1", prospect_id: "p-002", enviado_em: DENTRO },
      ],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.concluidas).toBe(1);
    expect(dados.prospecting_campaigns![0]!.status).toBe("concluida");
  });

  it("(h) tick overlapado que perde a reserva NÃO envia", async () => {
    // Dois ticks sobrepostos (o crond não espera o anterior) leem o mesmo
    // ledger e escolhem o MESMO prospect. A reserva é o que garante que só um
    // manda: o outro recebe "nada inserido" e sai sem falar com o número.
    reservaRecusada = true;
    const dados = base({ prospecting_campaigns: [campanha()] });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.enviados).toBe(0);
    expect(resumo.pulados).toEqual([{ campanha: "camp-1", motivo: "intervalo" }]);
    expect(dados.prospecting_sends).toEqual([]);
  });

  it("(i) envio que falha deixa a reserva e a campanha segue para o próximo", async () => {
    // A reserva fica mesmo na falha: ela registra a TENTATIVA. Sem isso o tick
    // insistiria no mesmo primeiro colocado a cada minuto — a campanha inteira
    // travada num número ruim e a cota do dia queimada nele.
    const dados = base({ prospecting_campaigns: [campanha()] });
    let tentativas = 0;
    const enviar = vi.fn(async (_admin: SupabaseClient, _p: ParametrosDoEnvio) => {
      tentativas++;
      return tentativas === 1
        ? ({ ok: false, erro: "canal fora" } as const)
        : ({ ok: true, messageId: "m-2", status: "sent" } as const);
    });

    const primeira = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);
    expect(primeira.enviados).toBe(0);
    expect(primeira.pulados).toEqual([{ campanha: "camp-1", motivo: "falha_envio" }]);
    expect(dados.prospecting_sends).toHaveLength(1);
    expect(dados.prospecting_sends![0]).toMatchObject({ prospect_id: "p-001", message_id: null });

    // O tick seguinte pula o que falhou e segue para o próximo da lista.
    const segunda = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(enviar.mock.calls[1]![1].prospect.id).toBe("p-002");
    expect(segunda.enviados).toBe(1);
  });

  it("(j) período vencido PAUSA a campanha, em vez de deixá-la ativa e muda", async () => {
    // 19/10 é depois do fim (16/10): o relógio acabou e ainda sobra gente. Uma
    // campanha que fica `ativa` e nunca mais fala é a que some da tela sem
    // morrer — o operador não sabe que parou, nem que dá para reagendar.
    const dados = base({
      prospecting_campaigns: [campanha({ data_fim: "2026-10-16" })],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.pausadas).toBe(1);
    expect(resumo.pulados).toEqual([]);
    expect(dados.prospecting_campaigns![0]!.status).toBe("pausada");
  });

  it("(k) ANTES do período não envia — e não pausa (ainda não começou)", async () => {
    const dados = base({
      prospecting_campaigns: [campanha({ data_inicio: "2026-10-25" })],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.pausadas).toBe(0);
    expect(resumo.pulados).toEqual([{ campanha: "camp-1", motivo: "fora_do_periodo" }]);
    expect(dados.prospecting_campaigns![0]!.status).toBe("ativa");
  });
});
