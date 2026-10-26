import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHANNEL_CAPABILITIES, type ChannelProvider } from "@/lib/channels";

import type { ParametrosDoEnvio } from "./envio";
import { processarCampanhasAgendadas } from "./agendado";

/**
 * As linhas de `channel_sessions` saem da MATRIZ de capabilities, não de
 * literais: o lint de canal proíbe nomear provider fora de `lib/channels/`, e
 * teste co-locado em `lib/` entra na varredura. O tick escolhe por capability —
 * a fixture fala a mesma língua.
 */
const PROVIDERS = Object.keys(CHANNEL_CAPABILITIES) as ChannelProvider[];
const SESSOES = {
  qr: PROVIDERS.find(
    (p) =>
      CHANNEL_CAPABILITIES[p].freeformOutsideWindow &&
      !CHANNEL_CAPABILITIES[p].requiresTemplates,
  )!,
  oficial: PROVIDERS.find(
    (p) =>
      CHANNEL_CAPABILITIES[p].requiresTemplates &&
      !CHANNEL_CAPABILITIES[p].freeformOutsideWindow,
  )!,
};

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
    if (arr[1] === "__gte__") {
      // ISO-8601 UTC ordena como string (mesmo comprimento), que é como o
      // PostgREST compara timestamptz.
      if (String(linha[col]) < String(arr[2])) return false;
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
  /** `.select(..., { count: "exact" })` — o fake devolve `count = linhas`. */
  private contar = false;

  constructor(
    private dados: Record<string, Linha[]>,
    private tabela: string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }): this {
    if (opts?.count) this.contar = true;
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
  gte(col: string, val: unknown): this {
    this.filtros.push([col, "__gte__", val]);
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

  private executar(): { data: Linha[] | null; error: null; count?: number } {
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
      return this.contar
        ? { data: saida, error: null, count: saida.length }
        : { data: saida, error: null };
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
  then<T>(
    onFulfilled: (r: { data: Linha[] | null; error: null; count?: number }) => T,
  ): Promise<T> {
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
    // Categoria classificada: o tick bloqueia linha em revisão desde a 0277,
    // inclusive em campanha sem recorte. O fixture precisa de evidência real.
    categoria: "Auto repair shop",
    categorias: [],
    website: null,
    categoria_canonica: null,
    categoria_revisar: false,
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

/**
 * Um envio EFETIVADO pelo número (é o que `pacing_ledger` guarda).
 *
 * `sent_at` de 4h antes do instante do teste, de propósito: ele está no MESMO
 * dia local (conta na cota) e fora do `espaco_ms` (não aciona a trava de
 * ritmo). Um carimbo igual a "agora" faria a campanha parar por INTERVALO
 * antes de a cota do número ser avaliada — e o teste mediria a coisa errada.
 */
function ledgers(extra: Linha = {}): Linha {
  return {
    organization_id: "org-1",
    channel_session_id: "sess-1",
    sent_at: "2026-10-19T13:00:00.000Z",
    ...extra,
  };
}

/** Knobs do número declarado JÁ AQUECIDO — aí só o teto do CRM limita. */
function knobsAquecidos(): Linha {
  return {
    organization_id: "org-1",
    channel_session_id: "sess-1",
    warmup_daily_caps: [{ minAgeDays: 0, cap: null }],
    number_activated_at: "2026-01-01T00:00:00.000Z",
  };
}

function senderFalso() {
  return vi.fn(
    async (_admin: SupabaseClient, _p: ParametrosDoEnvio) =>
      ({ ok: true, messageId: "m-1", status: "sent" }) as const,
  );
}

/** Uma linha APROVADA no espelho de modelos, com o contrato que o bind declara. */
function modeloNoEspelho(name: string, contractHash: string): Linha {
  return {
    organization_id: "org-1",
    name,
    language: "pt_BR",
    status: "APPROVED",
    category: "MARKETING",
    rejected_reason: null,
    quality_score: null,
    parameter_format: "POSITIONAL",
    contract_hash: contractHash,
    components: [{ type: "BODY", text: "Olá {{1}}." }],
    synced_at: "2026-10-23T12:00:00.000Z",
  };
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

  it("(d2) com TRÊS mensagens, o quarto envio volta para a primeira (1→2→3→1)", async () => {
    // A rotação é `enviadas.length % mensagens.length`. Com três variações e
    // três envios feitos, o próximo é o índice 0 de novo — sem este teste, uma
    // troca futura para `min(enviadas, n-1)` (que "parece" mais seguro) faria
    // todo mundo depois do terceiro receber sempre a mesma mensagem.
    const dados = base({
      prospecting_campaigns: [
        campanha({
          mensagens: ["A", "B", "C"],
          prospect_ids: ["p-001", "p-002", "p-003", "p-004"],
        }),
      ],
      business_prospects: [
        prospect("p-001", "Primeira"),
        prospect("p-002", "Segunda"),
        prospect("p-003", "Terceira"),
        prospect("p-004", "Quarta"),
      ],
      prospecting_sends: [
        { organization_id: "org-1", campaign_id: "camp-1", prospect_id: "p-001", enviado_em: DENTRO },
        { organization_id: "org-1", campaign_id: "camp-1", prospect_id: "p-002", enviado_em: DENTRO },
        { organization_id: "org-1", campaign_id: "camp-1", prospect_id: "p-003", enviado_em: DENTRO },
      ],
    });
    const enviar = senderFalso();
    await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0]![1].mensagem).toBe("A");
    expect(dados.prospecting_sends![3]).toMatchObject({ mensagem_indice: 0 });
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

  it("(f2) 'Enviar agora' segurando o número faz o tick esperar a vez (0288)", async () => {
    // O lote a 2min E o tick a 1min davam uma mensagem a cada ~40s no mesmo
    // número. O lease diz que o número é do lote; o tick não fala por cima.
    const dados = base({
      prospecting_campaigns: [campanha()],
      channel_sessions: [
        {
          id: "sess-1",
          organization_id: "org-1",
          status: "WORKING",
          archived_at: null,
          dispatch_locked_until: new Date(Date.parse(DENTRO) + 10 * 60_000).toISOString(),
        },
      ],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.pulados).toEqual([{ campanha: "camp-1", motivo: "disparo_manual" }]);
  });

  it("(f3) lease VENCIDO não segura o tick — quem morreu no meio não trava o número", async () => {
    const dados = base({
      prospecting_campaigns: [campanha()],
      channel_sessions: [
        {
          id: "sess-1",
          organization_id: "org-1",
          status: "WORKING",
          archived_at: null,
          dispatch_locked_until: new Date(Date.parse(DENTRO) - 60_000).toISOString(),
        },
      ],
    });
    const enviar = senderFalso();
    await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("(g) sem prospect restante, a campanha conclui sozinha", async () => {
    const dados = base({
      prospecting_campaigns: [campanha()],
      prospecting_sends: [
        {
          organization_id: "org-1",
          campaign_id: "camp-1",
          prospect_id: "p-001",
          enviado_em: DENTRO,
          message_id: "msg-1",
        },
        {
          organization_id: "org-1",
          campaign_id: "camp-1",
          prospect_id: "p-002",
          enviado_em: DENTRO,
          message_id: "msg-2",
        },
      ],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.concluidas).toBe(1);
    expect(dados.prospecting_campaigns![0]!.status).toBe("concluida");
  });

  it("(g2) reserva sem comprovante NÃO conclui a campanha — o lote ainda vai falar", async () => {
    // Medido em 26/10/2026: o "Enviar agora" reservou 28 empresas a 2min, e o
    // tick seguinte viu "nenhum prospect restante" e marcou `concluida` com 23
    // mensagens ainda na fila. Além do selo errado, `concluida` bloqueia o
    // reagendamento: um lote que morresse no meio ficaria sem saída.
    const dados = base({
      prospecting_campaigns: [campanha()],
      prospecting_sends: [
        {
          organization_id: "org-1",
          campaign_id: "camp-1",
          prospect_id: "p-001",
          enviado_em: DENTRO,
          message_id: "msg-1",
        },
        {
          organization_id: "org-1",
          campaign_id: "camp-1",
          prospect_id: "p-002",
          enviado_em: DENTRO,
          message_id: null,
        },
      ],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.concluidas).toBe(0);
    expect(dados.prospecting_campaigns![0]!.status).toBe("ativa");
    expect(resumo.pulados).toEqual([
      { campanha: "camp-1", motivo: "aguardando_comprovante" },
    ]);
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

  it("(l) o TETO DO NÚMERO manda quando é menor que a cota da campanha", async () => {
    // A campanha pede 50/dia e o número aceita 3 (limite do CRM). Vale o menor:
    // é a MESMA régua que o agente de IA obedece, e sem ela a campanha furaria o
    // aquecimento do próprio número que o produto promete proteger.
    const dados = base({
      prospecting_campaigns: [campanha({ limite_diario: 50 })],
      channel_sessions: [
        {
          id: "sess-1",
          organization_id: "org-1",
          status: "WORKING",
          archived_at: null,
          daily_message_limit: 3,
        },
      ],
      channel_knobs: [knobsAquecidos()],
      pacing_ledger: [1, 2, 3].map(() => ledgers()),
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.pulados).toEqual([{ campanha: "camp-1", motivo: "cota_do_dia" }]);
  });

  it("(m) sem linha em channel_knobs, o warm-up DEFAULT (20/dia) segura a campanha", async () => {
    // Quem nunca abriu Conexões não tem linha em `channel_knobs` e cai nos
    // defaults do pacing, que tratam o número como recém-nascido. É conservador
    // de propósito — e é a decisão que o agente de IA já toma para o mesmo
    // número. 20 é o degrau de idade 0 em `PACING_DEFAULTS`.
    const dados = base({
      prospecting_campaigns: [campanha({ limite_diario: 50 })],
      pacing_ledger: Array.from({ length: 20 }, () => ledgers()),
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.pulados).toEqual([{ campanha: "camp-1", motivo: "cota_do_dia" }]);
  });

  it("(n) duas campanhas ativas nunca mandam duas no MESMO tick", async () => {
    // Duas campanhas, teto do número = 1, mesmo tick. A primeira manda; a
    // segunda é barrada pelo RITMO (o número acabou de falar) — e é o ritmo que
    // responde primeiro, porque a trava global roda antes de a cota da campanha
    // ser avaliada. O que importa: sai UMA mensagem, não duas. Na passada
    // seguinte a cota do número já enxerga o envio no `pacing_ledger` e barra
    // (o teto é 1/dia).
    const dados = base({
      prospecting_campaigns: [
        campanha({ id: "camp-1", prospect_ids: ["p-001"], created_at: "2026-10-19T10:00:00.000Z" }),
        campanha({ id: "camp-2", prospect_ids: ["p-002"], created_at: "2026-10-19T11:00:00.000Z" }),
      ],
      channel_sessions: [
        {
          id: "sess-1",
          organization_id: "org-1",
          status: "WORKING",
          archived_at: null,
          daily_message_limit: 1,
        },
      ],
      channel_knobs: [knobsAquecidos()],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(resumo.enviados).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0]![1].prospect.id).toBe("p-001");
    expect(resumo.pulados).toEqual([{ campanha: "camp-2", motivo: "intervalo" }]);

    // Segunda passada: o envio da primeira já está no ledger, e agora a cota do
    // número barra a segunda campanha — não há como mandar duas no dia.
    const dados2 = base({
      prospecting_campaigns: [campanha({ id: "camp-2", prospect_ids: ["p-002"] })],
      channel_sessions: [
        {
          id: "sess-1",
          organization_id: "org-1",
          status: "WORKING",
          archived_at: null,
          daily_message_limit: 1,
        },
      ],
      channel_knobs: [knobsAquecidos()],
      pacing_ledger: [ledgers({ sent_at: "2026-10-19T13:00:00.000Z" })],
    });
    const enviar2 = senderFalso();
    const resumo2 = await processarCampanhasAgendadas(
      criarAdmin(dados2),
      "2026-10-19T18:00:00.000Z",
      enviar2,
    );

    expect(enviar2).not.toHaveBeenCalled();
    expect(resumo2.pulados).toEqual([{ campanha: "camp-2", motivo: "cota_do_dia" }]);
  });

  it("(o) a cota do número conta o que o AGENTE já mandou hoje", async () => {
    // O `pacing_ledger` não distingue origem: um envio do agente de IA é um
    // envio do número. Com o teto em 2 e duas respostas já dadas na conversa, a
    // campanha não manda — é o mesmo orçamento.
    const dados = base({
      prospecting_campaigns: [campanha({ limite_diario: 50 })],
      channel_sessions: [
        {
          id: "sess-1",
          organization_id: "org-1",
          status: "WORKING",
          archived_at: null,
          daily_message_limit: 2,
        },
      ],
      channel_knobs: [knobsAquecidos()],
      pacing_ledger: [1, 2].map(() => ledgers()),
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.pulados).toEqual([{ campanha: "camp-1", motivo: "cota_do_dia" }]);
  });

  it("(p) envio de ONTEM não consome a cota de hoje", async () => {
    // A meia-noite é a LOCAL da organização (São Paulo, UTC−3): o corte é
    // 03:00Z. Contar em UTC faria a cota reiniciar às 21h de Brasília.
    const dados = base({
      prospecting_campaigns: [campanha({ limite_diario: 50 })],
      channel_sessions: [
        {
          id: "sess-1",
          organization_id: "org-1",
          status: "WORKING",
          archived_at: null,
          daily_message_limit: 2,
        },
      ],
      channel_knobs: [knobsAquecidos()],
      // 02:00Z de hoje = 23:00 de ONTEM em São Paulo — fora do dia local.
      pacing_ledger: [1, 2].map(() => ledgers({ sent_at: "2026-10-19T02:00:00.000Z" })),
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(resumo.enviados).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("(q) campanha de recuperação fala com o CONTATO — nunca com a coluna de prospect", async () => {
    // `prospect_ids` fica preenchido DE PROPÓSITO: se o tick lesse a coluna
    // errada, mandaria para a empresa errada e o teste não veria.
    const dados = base({
      prospecting_campaigns: [
        campanha({ publico: "contatos", contato_ids: ["c-001"], prospect_ids: ["p-001"] }),
      ],
      contacts: [
        {
          id: "c-001",
          organization_id: "org-1",
          name: "Mercado ME",
          display_name: "Mercado do Zé",
          phone_number: "(49) 99999-8888",
        },
      ],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(resumo.enviados).toBe(1);
    const p = enviar.mock.calls[0]![1];
    expect(p.prospect.id).toBe("c-001");
    expect(p.prospect.nome).toBe("Mercado do Zé");
    // O telefone passa pela regra da casa: 11 dígitos sem DDI ganham +55.
    expect(p.prospect.telefone_normalizado).toBe("+5549999998888");
    expect(dados.prospecting_sends![0]).toMatchObject({
      campaign_id: "camp-1",
      prospect_id: "c-001",
    });
  });

  it("(r) contato sem telefone é pulado e o próximo da lista recebe", async () => {
    const dados = base({
      prospecting_campaigns: [
        campanha({ publico: "contatos", contato_ids: ["c-001", "c-002"], prospect_ids: [] }),
      ],
      contacts: [
        {
          id: "c-001",
          organization_id: "org-1",
          name: "Sem fone",
          display_name: null,
          phone_number: null,
        },
        {
          id: "c-002",
          organization_id: "org-1",
          name: "Com fone",
          display_name: null,
          phone_number: "+5549888887777",
        },
      ],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(resumo.enviados).toBe(1);
    expect(enviar.mock.calls[0]![1].prospect.id).toBe("c-002");
    // `name` vale quando não há `display_name`.
    expect(enviar.mock.calls[0]![1].prospect.nome).toBe("Com fone");
  });

  it("(s) recuperação sem contatos não cai para prospect_ids", async () => {
    const dados = base({
      prospecting_campaigns: [
        campanha({ publico: "contatos", contato_ids: [], prospect_ids: ["p-001"] }),
      ],
      contacts: [],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    // Campanha sem lista não é "pulo": é campanha vazia, e ela não aparece
    // como falha no resumo do tick.
    expect(resumo.pulados).toEqual([]);
  });

  it("(t) a campanha de segunda a sexta NÃO manda no sábado (o dia vem do jsonb)", async () => {
    // SÁBADO às 14:00 de São Paulo. A janela 13–19 está ABERTA: se o dia da
    // semana não chegasse do `janelas` (jsonb) até o motor, este tick mandaria.
    const SABADO = "2026-10-17T17:00:00.000Z";
    const uteis = campanha({
      data_inicio: "2026-10-12",
      data_fim: "2026-10-25",
      janelas: [
        { inicio: "07:00", fim: "12:00", dias: [1, 2, 3, 4, 5] },
        { inicio: "13:00", fim: "19:00", dias: [1, 2, 3, 4, 5] },
      ],
    });

    const noSabado = await processarCampanhasAgendadas(
      criarAdmin(base({ prospecting_campaigns: [uteis] })),
      SABADO,
      senderFalso(),
    );
    expect(noSabado.enviados).toBe(0);
    expect(noSabado.pulados).toEqual([{ campanha: "camp-1", motivo: "fora_do_dia" }]);

    // A MESMA campanha na segunda-feira (19/10) manda: o dia não é um bloqueio
    // cego, ele deixa passar quem está na lista de dias.
    const enviar = senderFalso();
    const naSegunda = await processarCampanhasAgendadas(
      criarAdmin(base({ prospecting_campaigns: [uteis] })),
      DENTRO,
      enviar,
    );
    expect(naSegunda.enviados).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("(u) campanha de TEMPLATE usa o canal oficial e não manda texto", async () => {
    // O número por QR não serve: a Meta aceita o POST e recusa a ENTREGA
    // (131047). A escolha é por capability, e o template vai no payload.
    const dados = base({
      prospecting_campaigns: [
        campanha({
          mensagens: [],
          mensagem_tipo: "template",
          template_name: "boas_vindas",
          template_language: "pt_BR",
          template_contract_hash: "hash-1",
          template_values: { "1": "Maria", "2": "Belo Horizonte" },
        }),
      ],
      channel_sessions: [
        { id: "sess-qr", organization_id: "org-1", provider: SESSOES.qr, status: "WORKING", archived_at: null },
        { id: "sess-oficial", organization_id: "org-1", provider: SESSOES.oficial, status: "WORKING", archived_at: null },
      ],
      meta_templates: [
        {
          organization_id: "org-1",
          name: "boas_vindas",
          language: "pt_BR",
          status: "APPROVED",
          category: "MARKETING",
          rejected_reason: null,
          quality_score: null,
          parameter_format: "POSITIONAL",
          contract_hash: "hash-1",
          components: [{ type: "BODY", text: "Olá {{1}}, falamos de {{2}}." }],
          synced_at: "2026-10-23T12:00:00.000Z",
        },
      ],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(resumo.enviados).toBe(1);
    const p = enviar.mock.calls[0]![1];
    expect(p.sessaoId).toBe("sess-oficial");
    expect(p.mensagem).toBe("");
    expect(p.template).toMatchObject({
      name: "boas_vindas",
      language: "pt_BR",
      contractHash: "hash-1",
      values: { "1": "Maria", "2": "Belo Horizonte" },
    });
    expect(dados.prospecting_sends![0]).toMatchObject({ mensagem_indice: 0, prospect_id: "p-001" });
  });

  it("(v) campanha de TEXTO não cai no oficial: fica sem canal e registra o motivo", async () => {
    // Antes, a primeira WORKING era usada — e texto no oficial vira 131047 na
    // entrega. Aqui não há QR, então o tick NÃO envia e o operador vê o porquê.
    const dados = base({
      prospecting_campaigns: [campanha()],
      channel_sessions: [
        { id: "sess-oficial", organization_id: "org-1", provider: SESSOES.oficial, status: "WORKING", archived_at: null },
      ],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.pulados).toEqual([{ campanha: "camp-1", motivo: "sem_canal_texto" }]);
    // Canal ausente NÃO pausa: o número pode voltar. O erro fica visível.
    expect(dados.prospecting_campaigns![0]).toMatchObject({ status: "ativa" });
    expect(String(dados.prospecting_campaigns![0]!.ultimo_erro)).toContain("texto livre");
  });

  it("(v2) número oficial em RED PAUSA a campanha de template — e diz por quê", async () => {
    // A Meta ainda aceita o envio em RED; é justamente por isso que a decisão
    // não pode ser dela. Seguir mandando piora a nota do número e, depois,
    // desabilita os modelos. O tick para sozinho e deixa o motivo na tela.
    const dados = base({
      prospecting_campaigns: [
        campanha({
          mensagens: [],
          mensagem_tipo: "template",
          template_name: "boas_vindas",
          template_language: "pt_BR",
          template_contract_hash: "hash-1",
          template_values: { "1": "Maria" },
        }),
      ],
      channel_sessions: [
        {
          id: "sess-oficial",
          organization_id: "org-1",
          provider: SESSOES.oficial,
          status: "WORKING",
          archived_at: null,
          quality_rating: "RED",
        },
      ],
      meta_templates: [
        {
          organization_id: "org-1",
          name: "boas_vindas",
          language: "pt_BR",
          status: "APPROVED",
          category: "MARKETING",
          rejected_reason: null,
          quality_score: null,
          parameter_format: "POSITIONAL",
          contract_hash: "hash-1",
          components: [{ type: "BODY", text: "Olá {{1}}." }],
          synced_at: "2026-10-23T12:00:00.000Z",
        },
      ],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.pausadas).toBe(1);
    expect(resumo.pulados).toEqual([{ campanha: "camp-1", motivo: "numero_qualidade_red" }]);
    expect(dados.prospecting_campaigns![0]).toMatchObject({
      status: "pausada",
      pausa_motivo: expect.stringContaining("RED"),
    });
  });

  it("(w) template inválido PAUSA a campanha e grava o motivo visível", async () => {
    // Sem a linha no espelho, insistir a cada minuto gastaria uma reserva por
    // prospect e a Meta recusaria todas. O tick para e deixa o erro na tela.
    const dados = base({
      prospecting_campaigns: [
        campanha({
          mensagem_tipo: "template",
          template_name: "sumiu",
          template_language: "pt_BR",
          template_contract_hash: "hash-1",
          template_values: {},
        }),
      ],
      channel_sessions: [
        { id: "sess-oficial", organization_id: "org-1", provider: SESSOES.oficial, status: "WORKING", archived_at: null },
      ],
      meta_templates: [],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.pausadas).toBe(1);
    expect(resumo.pulados).toEqual([{ campanha: "camp-1", motivo: "template_invalido" }]);
    expect(dados.prospecting_campaigns![0]).toMatchObject({ status: "pausada" });
    expect(String(dados.prospecting_campaigns![0]!.ultimo_erro)).toContain("não está no espelho");
  });

  it("(x) o modelo é escolhido pela CATEGORIA da empresa, não pelo bind legado", async () => {
    // A campanha cobre oficina e tem um modelo POR CATEGORIA. O bind legado
    // aponta para outro modelo de propósito: se o motor ignorasse o mapeamento,
    // a oficina receberia o texto errado — e o teste reprovaria.
    const dados = base({
      prospecting_campaigns: [
        campanha({
          categorias: ["Oficina mecânica"],
          mensagens: [],
          mensagem_tipo: "template",
          template_name: "legado_errado",
          template_language: "pt_BR",
          template_contract_hash: "hash-legado",
          template_values: {},
          templates_por_categoria: [
            {
              categoria: "Oficina mecânica",
              name: "modelo_oficina",
              language: "pt_BR",
              contract_hash: "hash-oficina",
              values: { "1": "Maria" },
            },
          ],
        }),
      ],
      channel_sessions: [
        { id: "sess-oficial", organization_id: "org-1", provider: SESSOES.oficial, status: "WORKING", archived_at: null },
      ],
      meta_templates: [
        modeloNoEspelho("modelo_oficina", "hash-oficina"),
        modeloNoEspelho("legado_errado", "hash-legado"),
      ],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(resumo.enviados).toBe(1);
    expect(enviar.mock.calls[0]![1].template).toMatchObject({
      name: "modelo_oficina",
      contractHash: "hash-oficina",
      values: { "1": "Maria" },
    });
  });

  it("(y) categoria sem modelo PAUSA — nunca manda o modelo de outra categoria", async () => {
    // Mandar o texto de posto para uma oficina é pior que não mandar. A
    // campanha para com o motivo visível na tela.
    const dados = base({
      prospecting_campaigns: [
        campanha({
          categorias: ["Oficina mecânica"],
          mensagens: [],
          mensagem_tipo: "template",
          template_name: "modelo_posto",
          template_language: "pt_BR",
          template_contract_hash: "hash-posto",
          template_values: {},
          templates_por_categoria: [
            {
              categoria: "Posto de combustível",
              name: "modelo_posto",
              language: "pt_BR",
              contract_hash: "hash-posto",
              values: {},
            },
          ],
        }),
      ],
      channel_sessions: [
        { id: "sess-oficial", organization_id: "org-1", provider: SESSOES.oficial, status: "WORKING", archived_at: null },
      ],
      meta_templates: [modeloNoEspelho("modelo_posto", "hash-posto")],
    });
    const enviar = senderFalso();
    const resumo = await processarCampanhasAgendadas(criarAdmin(dados), DENTRO, enviar);

    expect(enviar).not.toHaveBeenCalled();
    expect(resumo.pausadas).toBe(1);
    expect(resumo.pulados).toEqual([
      { campanha: "camp-1", motivo: "template_da_categoria_ausente" },
    ]);
    expect(dados.prospecting_campaigns![0]).toMatchObject({ status: "pausada" });
    expect(String(dados.prospecting_campaigns![0]!.ultimo_erro)).toContain("não tem modelo");
  });
});
