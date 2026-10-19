import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";

import { assinarOrcamento } from "./orcamento-link";
import { aprovarOrcamentoPublico, carregarOrcamentoPublico } from "./orcamento-publico";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

/**
 * ADMIN FALSO — mini-PostgREST em memória (select/update por eq/in/order).
 * Suficiente porque o módulo só usa o encadeamento padrão, e falso de propósito:
 * o teste prova as DECISÕES, não o driver.
 */
type Linha = Record<string, unknown>;

class Query {
  private filtros: Array<[string, unknown]> = [];
  private dentro: [string, unknown[]] | null = null;
  private ordem: { col: string; asc: boolean } | null = null;
  private acao: "select" | "update" = "select";
  private payload: Linha | null = null;

  constructor(
    private dados: Record<string, Linha[]>,
    private tabela: string,
  ) {}

  select(_cols?: string): this {
    return this;
  }
  update(payload: Linha): this {
    this.acao = "update";
    this.payload = payload;
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filtros.push([col, val]);
    return this;
  }
  in(col: string, val: unknown[]): this {
    this.dentro = [col, val];
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.ordem = { col, asc: opts?.ascending ?? true };
    return this;
  }

  private casa(l: Linha): boolean {
    for (const [c, v] of this.filtros) if (l[c] !== v) return false;
    if (this.dentro && !this.dentro[1].includes(l[this.dentro[0]])) return false;
    return true;
  }

  private executar(): { data: Linha[] | null; error: null } {
    const linhas = this.dados[this.tabela] ?? (this.dados[this.tabela] = []);
    const alvo = linhas.filter((l) => this.casa(l));
    if (this.acao === "update") {
      for (const l of alvo) Object.assign(l, this.payload ?? {});
      return { data: alvo.map((l) => ({ id: l.id })), error: null };
    }
    let saida = alvo;
    if (this.ordem) {
      const { col, asc } = this.ordem;
      saida = [...saida].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    return { data: saida, error: null };
  }

  maybeSingle(): Promise<{ data: Linha | null; error: null }> {
    const r = this.executar();
    return Promise.resolve({ data: r.data?.[0] ?? null, error: null });
  }

  then<T>(onF: (r: { data: Linha[] | null; error: null }) => T): Promise<T> {
    return Promise.resolve(this.executar()).then(onF);
  }
}

function criarAdmin(dados: Record<string, Linha[]>): SupabaseClient {
  return {
    from: (tabela: string) => new Query(dados, tabela),
  } as unknown as SupabaseClient;
}

const PEDIDO = "ped-1";
const ORG = "org-1";

function base(extra: Record<string, Linha[]> = {}): Record<string, Linha[]> {
  return {
    commercial_orders: [
      {
        id: PEDIDO,
        organization_id: ORG,
        numero: 42,
        cliente_nome: "Mercado do Bairro",
        status: "em_analise",
        created_at: "2026-10-18T13:00:00.000Z",
        subtotal_cents: 10_000,
        desconto_cents: 0,
        desconto_pct: 0,
        frete_cents: 0,
        total_cents: 10_000,
        moeda: "BRL",
        condicao_pagamento: "28 dias",
        observacoes: null,
      },
    ],
    commercial_order_items: [
      {
        id: "item-1",
        order_id: PEDIDO,
        organization_id: ORG,
        produto_nome: "Sabonete 90g",
        quantidade: 2,
        preco_unit_cents: 5_000,
        desconto_pct: 0,
        subtotal_cents: 10_000,
        posicao: 1,
      },
    ],
    organizations: [{ id: ORG, display_name: "Bill Higiene", locale: "pt-BR" }],
    commercial_policies: [{ organization_id: ORG, desconto_max_vendedor_pct: 5 }],
    ...extra,
  };
}

const token = (orderId = PEDIDO, orgId = ORG) => assinarOrcamento({ orderId, orgId });

beforeEach(() => {
  vi.mocked(audit).mockClear();
});

describe("orçamento visto pelo cliente", () => {
  it("mostra o pedido, os itens e o nome da empresa — e o botão vale", async () => {
    const dados = base();
    const orcamento = await carregarOrcamentoPublico(criarAdmin(dados), token());

    expect(orcamento).not.toBeNull();
    expect(orcamento!.numero).toBe(42);
    expect(orcamento!.organizacao).toBe("Bill Higiene");
    expect(orcamento!.itens).toEqual([
      {
        nome: "Sabonete 90g",
        quantidade: 2,
        precoUnitCents: 5_000,
        descontoPct: 0,
        subtotalCents: 10_000,
      },
    ]);
    expect(orcamento!.podeAprovar).toBe(true);
    expect(orcamento!.jaAprovado).toBe(false);
    expect(orcamento!.espera).toBeNull();
  });

  it("link válido de OUTRA organização não abre o pedido (o escopo vem da assinatura)", async () => {
    const dados = base();
    const orcamento = await carregarOrcamentoPublico(criarAdmin(dados), token(PEDIDO, "org-2"));
    expect(orcamento).toBeNull();
  });

  it("token adulterado não abre nada (nem chega ao banco)", async () => {
    const dados = base();
    const ruim = `${token()}x`;
    expect(await carregarOrcamentoPublico(criarAdmin(dados), ruim)).toBeNull();
  });

  it("pedido já aprovado aparece como aprovado, sem botão", async () => {
    const dados = base();
    dados.commercial_orders![0]!.status = "faturado";
    const orcamento = await carregarOrcamentoPublico(criarAdmin(dados), token());
    expect(orcamento!.jaAprovado).toBe(true);
    expect(orcamento!.podeAprovar).toBe(false);
  });

  it("desconto acima do teto do vendedor: botão existe, mas a confirmação é interna", async () => {
    const dados = base();
    dados.commercial_order_items![0]!.desconto_pct = 20;
    const orcamento = await carregarOrcamentoPublico(criarAdmin(dados), token());
    expect(orcamento!.podeAprovar).toBe(true);
    expect(orcamento!.espera).toBe("gerente");
  });
});

describe("aprovação do cliente", () => {
  it("coloca o pedido na fila e escreve a trilha com o fato certo", async () => {
    const dados = base();
    const r = await aprovarOrcamentoPublico(criarAdmin(dados), { token: token(), requestId: "req-1" });

    expect(r).toEqual({ ok: true, jaAprovado: false, aguardandoGerente: false });
    expect(dados.commercial_orders![0]!.status).toBe("aprovado");
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "commercial_order.approved_by_client",
        resourceId: PEDIDO,
        organizationId: ORG,
      }),
    );
  });

  it("é idempotente: o segundo clique não muda nada nem duplica trilha", async () => {
    const dados = base();
    const admin = criarAdmin(dados);
    await aprovarOrcamentoPublico(admin, { token: token(), requestId: "req-1" });
    vi.mocked(audit).mockClear();

    const r = await aprovarOrcamentoPublico(admin, { token: token(), requestId: "req-2" });
    expect(r).toEqual({ ok: true, jaAprovado: true, aguardandoGerente: false });
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("desconto acima do teto: registra a aprovação e NÃO furou a alçada do gerente", async () => {
    const dados = base();
    dados.commercial_order_items![0]!.desconto_pct = 30;
    const r = await aprovarOrcamentoPublico(criarAdmin(dados), { token: token(), requestId: "req-1" });

    expect(r).toEqual({ ok: true, jaAprovado: false, aguardandoGerente: true });
    expect(dados.commercial_orders![0]!.status).toBe("em_analise");
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "commercial_order.client_approved" }),
    );
  });

  it("pedido cancelado não aprova", async () => {
    const dados = base();
    dados.commercial_orders![0]!.status = "cancelado";
    const r = await aprovarOrcamentoPublico(criarAdmin(dados), { token: token(), requestId: "req-1" });
    expect(r).toEqual({ ok: false, motivo: "cancelado" });
  });

  it("link inválido e pedido inexistente têm motivos distintos", async () => {
    const dados = base();
    const admin = criarAdmin(dados);
    expect(await aprovarOrcamentoPublico(admin, { token: "v1.x.y", requestId: "req-1" })).toEqual({
      ok: false,
      motivo: "link_invalido",
    });
    expect(
      await aprovarOrcamentoPublico(admin, { token: token("inexistente"), requestId: "req-1" }),
    ).toEqual({ ok: false, motivo: "nao_encontrado" });
  });
});
