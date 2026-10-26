/**
 * A TRAVA DE DISPARO — o que impede três cliques de virarem três mensagens por
 * minuto num número que prometeu duas.
 *
 * O defeito medido em 26/10/2026 não foi "falta de espaçamento": o espaçamento
 * existia, num `Map` de memória. Três requisições de "Enviar agora" leram o
 * "último envio" antes de qualquer uma gravar, e as três mandaram juntas.
 *
 * Por isso os testes não cobrem "espera X segundos" — cobrem o que o banco
 * decide: só UMA requisição casa a linha livre, o lease vencido é retomado, e só
 * o dono do token libera. Também cobrem o TTL: uma requisição que morre no meio
 * (restart, deploy, aba fechada) não pode deixar o número travado.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  TETO_DA_TRAVA_MS,
  disparoEmAndamento,
  soltarDisparo,
  travarDisparo,
  validadeDaTrava,
} from "@/lib/prospeccao/trava-de-disparo";

interface LinhaDoSessao {
  id: string;
  organization_id: string;
  dispatch_locked_until: string | null;
  dispatch_lock_token: string | null;
}

type Resposta = { data: unknown; error: { message: string } | null };

/**
 * Client falso de UMA linha.
 *
 * O update condicional do Postgres é simulado pelo único comportamento que
 * importa aqui: aplicar os filtros ANTES de gravar e devolver `[]` quando a linha
 * não casa. É isso que faz duas requisições disputarem e só uma vencer.
 */
function fakeDb(linha: LinhaDoSessao, opcoes: { erroNoUpdate?: boolean } = {}) {
  const chamadas: string[] = [];

  const from = (tabela: string) => {
    void tabela;
    let ehUpdate = false;
    let valores: Partial<LinhaDoSessao> = {};
    const filtros: Array<(l: LinhaDoSessao) => boolean> = [];

    const builder = {
      update(v: Partial<LinhaDoSessao>) {
        ehUpdate = true;
        valores = v;
        chamadas.push("update");
        return builder;
      },
      select(_colunas?: string) {
        if (!ehUpdate) chamadas.push("select");
        return builder;
      },
      eq(coluna: keyof LinhaDoSessao, valor: unknown) {
        filtros.push((l) => l[coluna] === valor);
        return builder;
      },
      is(coluna: keyof LinhaDoSessao, valor: unknown) {
        filtros.push((l) => l[coluna] === valor);
        return builder;
      },
      lt(coluna: keyof LinhaDoSessao, valor: string) {
        filtros.push((l) => {
          const atual = l[coluna];
          return typeof atual === "string" && atual < valor;
        });
        return builder;
      },
      gt(coluna: keyof LinhaDoSessao, valor: string) {
        filtros.push((l) => {
          const atual = l[coluna];
          return typeof atual === "string" && atual > valor;
        });
        return builder;
      },
      order(_coluna: keyof LinhaDoSessao, _opcoes?: { ascending?: boolean }) {
        return builder;
      },
      limit(_n: number) {
        return builder;
      },
      maybeSingle(): Promise<Resposta> {
        if (!filtros.every((f) => f(linha))) return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: { ...linha }, error: null });
      },
      then(resolve: (v: Resposta) => unknown): Promise<unknown> {
        if (!ehUpdate) {
          const casa = filtros.every((f) => f(linha));
          return Promise.resolve({ data: casa ? [{ ...linha }] : [], error: null }).then(resolve);
        }
        if (opcoes.erroNoUpdate) {
          return Promise.resolve({ data: null, error: { message: "db caiu" } }).then(resolve);
        }
        const casa = filtros.every((f) => f(linha));
        if (casa) Object.assign(linha, valores);
        return Promise.resolve({ data: casa ? [{ id: linha.id }] : [], error: null }).then(resolve);
      },
    };
    return builder;
  };

  return { db: { from } as unknown as SupabaseClient, chamadas };
}

const AGORA = new Date("2026-10-26T15:00:00.000Z");
const ORG = "org-1";
const SESSAO = "sessao-1";

function linha(extra: Partial<LinhaDoSessao> = {}): LinhaDoSessao {
  return {
    id: SESSAO,
    organization_id: ORG,
    dispatch_locked_until: null,
    dispatch_lock_token: null,
    ...extra,
  };
}

describe("validadeDaTrava", () => {
  it("cobre a duração prometida na tela mais a folga do envio", () => {
    // 20 mensagens a 60s = 20min; a folga padrão é 2min.
    expect(validadeDaTrava(60_000, 20)).toBe(20 * 60_000 + 120_000);
  });

  it("respeita o intervalo pedido quando ele passa de 2min", () => {
    // 5 mensagens a 2min = 10min; a folga acompanha o intervalo (2min).
    expect(validadeDaTrava(120_000, 5)).toBe(10 * 60_000 + 120_000);
  });

  it("nunca fica menor que o intervalo — a segunda requisição não entra entre duas mensagens", () => {
    expect(validadeDaTrava(600_000, 0)).toBeGreaterThanOrEqual(600_000);
    expect(validadeDaTrava(600_000, 1)).toBeGreaterThan(600_000);
  });

  it("com intervalo 0 (saída de emergência) ainda reserva tempo de ENVIO por mensagem", () => {
    // Cada envio custa uma ida ao canal; sem o piso de 5s, 20 mensagens
    // ganhariam lease de 2min e o segundo clique entraria no meio do primeiro.
    expect(validadeDaTrava(0, 20)).toBe(20 * 5_000 + 120_000);
  });

  it("tem teto — processo morto não deixa o número preso por um dia", () => {
    expect(validadeDaTrava(600_000, 500)).toBe(TETO_DA_TRAVA_MS);
  });
});

describe("travarDisparo", () => {
  it("reserva o número livre e grava o token do dono", async () => {
    const estado = linha();
    const { db } = fakeDb(estado);

    const r = await travarDisparo(db, { orgId: ORG, sessaoId: SESSAO, validadeMs: 60_000, agora: AGORA });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.trava.expiraEm).toBe("2026-10-26T15:01:00.000Z");
    expect(estado.dispatch_lock_token).toBe(r.trava.token);
    expect(estado.dispatch_locked_until).toBe(r.trava.expiraEm);
  });

  it("recusa a segunda requisição e diz até quando o número está ocupado", async () => {
    const estado = linha();
    const { db } = fakeDb(estado);

    const primeira = await travarDisparo(db, { orgId: ORG, sessaoId: SESSAO, validadeMs: 20 * 60_000, agora: AGORA });
    const segunda = await travarDisparo(db, { orgId: ORG, sessaoId: SESSAO, validadeMs: 20 * 60_000, agora: AGORA });

    expect(primeira.ok).toBe(true);
    expect(segunda.ok).toBe(false);
    if (segunda.ok) return;
    expect(segunda.ocupadaAte).toBe("2026-10-26T15:20:00.000Z");
  });

  it("assume o lease vencido — a requisição que morreu não trava o número para sempre", async () => {
    const estado = linha({ dispatch_locked_until: "2026-10-26T14:59:00.000Z", dispatch_lock_token: "dono-que-morreu" });
    const { db } = fakeDb(estado);

    const r = await travarDisparo(db, { orgId: ORG, sessaoId: SESSAO, validadeMs: 60_000, agora: AGORA });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(estado.dispatch_lock_token).toBe(r.trava.token);
    expect(estado.dispatch_lock_token).not.toBe("dono-que-morreu");
  });

  it("não reserva o número de OUTRA organização", async () => {
    const estado = linha({ organization_id: "org-2" });
    const { db } = fakeDb(estado);

    const r = await travarDisparo(db, { orgId: ORG, sessaoId: SESSAO, validadeMs: 60_000, agora: AGORA });

    expect(r.ok).toBe(false);
    expect(estado.dispatch_lock_token).toBeNull();
  });

  it("falha FECHADO: erro de banco não vira disparo liberado", async () => {
    const { db } = fakeDb(linha(), { erroNoUpdate: true });

    const r = await travarDisparo(db, { orgId: ORG, sessaoId: SESSAO, validadeMs: 60_000, agora: AGORA });

    expect(r.ok).toBe(false);
  });
});

describe("soltarDisparo", () => {
  it("libera quando o token é do dono", async () => {
    const estado = linha();
    const { db } = fakeDb(estado);
    const r = await travarDisparo(db, { orgId: ORG, sessaoId: SESSAO, validadeMs: 60_000, agora: AGORA });
    if (!r.ok) throw new Error("esperava adquirir a trava");

    await soltarDisparo(db, { orgId: ORG, sessaoId: SESSAO, token: r.trava.token });

    expect(estado.dispatch_locked_until).toBeNull();
    expect(estado.dispatch_lock_token).toBeNull();
  });

  it("quem perdeu o lease por TTL NÃO destrava o disparo de quem assumiu", async () => {
    const estado = linha({
      dispatch_locked_until: "2026-10-26T15:20:00.000Z",
      dispatch_lock_token: "dono-novo",
    });
    const { db } = fakeDb(estado);

    await soltarDisparo(db, { orgId: ORG, sessaoId: SESSAO, token: "dono-antigo" });

    expect(estado.dispatch_lock_token).toBe("dono-novo");
    expect(estado.dispatch_locked_until).toBe("2026-10-26T15:20:00.000Z");
  });
});

/**
 * A LEITURA QUE A TELA USA PARA NÃO GRITAR "ÓRFÃ" NO MEIO DO LOTE.
 *
 * Medido em 26/10/2026: durante um "Enviar agora" de 28 empresas a 2 min, a tela
 * de controle mostrava "27 empresas com reserva, mas sem comprovante" com o
 * botão de liberar habilitado. Clicar ali apagaria as reservas que o lote ainda
 * ia usar — e o scheduler poderia reservá-las de novo, duplicando a mensagem.
 */
describe("disparoEmAndamento", () => {
  it("reconhece o lease ativo e devolve até quando", async () => {
    const estado = linha({ dispatch_locked_until: "2026-10-26T15:58:00.000Z" });
    const { db } = fakeDb(estado);

    const r = await disparoEmAndamento(db, { orgId: ORG, agora: AGORA });

    expect(r).toEqual({ ativo: true, ate: "2026-10-26T15:58:00.000Z" });
  });

  it("lease VENCIDO não conta como disparo em andamento", async () => {
    const estado = linha({ dispatch_locked_until: "2026-10-26T14:59:00.000Z" });
    const { db } = fakeDb(estado);

    const r = await disparoEmAndamento(db, { orgId: ORG, agora: AGORA });

    expect(r).toEqual({ ativo: false, ate: null });
  });

  it("sem lease, não há lote em voo", async () => {
    const { db } = fakeDb(linha());

    const r = await disparoEmAndamento(db, { orgId: ORG, agora: AGORA });

    expect(r.ativo).toBe(false);
  });
});
