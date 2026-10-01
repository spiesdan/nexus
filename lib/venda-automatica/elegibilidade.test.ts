/**
 * Os filtros ANTES da fila (§4) e a cota do dia (§6) — função pura, sem banco.
 *
 * A ordem dos motivos é contrato: a tela mostra UM motivo por linha, e o
 * primeiro da lista da spec (localização → categoria → opt-out → telefone →
 * duplicidade) é quem fala. Trocar a ordem muda o que o operador lê, não o
 * resultado — e este arquivo prende a ordem também.
 */
import { describe, expect, it } from "vitest";

import {
  avaliarElegibilidade,
  contarConsumo,
  cotaRestante,
  normalizarTexto,
  type CandidatoDaCampanha,
  type ContextoDeDuplicidade,
  type FiltroDaCampanha,
} from "./elegibilidade";
import type { StatusDaFila } from "./tipos";

const FILTRO: FiltroDaCampanha = { cidade: "São Paulo", categorias: ["Farmácia"] };

function candidato(over: Partial<CandidatoDaCampanha> = {}): CandidatoDaCampanha {
  return {
    nome: "Drogaria Central",
    cidade: "São Paulo",
    categorias: ["Farmácia"],
    telefone_normalizado: "+5511999999999",
    do_not_contact: false,
    ...over,
  };
}

function contexto(over: Partial<ContextoDeDuplicidade> = {}): ContextoDeDuplicidade {
  return {
    jaNaFila: false,
    jaCliente: false,
    jaLead: false,
    conversaAtiva: false,
    mensagemRecente: false,
    recusouContato: false,
    pedidoEmAndamento: false,
    ...over,
  };
}

describe("normalizarTexto", () => {
  it("acentos e caixa não separam a mesma cidade", () => {
    expect(normalizarTexto("São Paulo")).toBe(normalizarTexto("SAO PAULO"));
    expect(normalizarTexto("  Joinville ")).toBe("joinville");
  });
});

describe("avaliarElegibilidade — o caminho feliz", () => {
  it("cidade, categoria, telefone e contexto limpo: elegível", () => {
    expect(avaliarElegibilidade(candidato(), FILTRO, contexto())).toEqual({ ok: true });
  });
  it("cidade com acento/CAIXA diferentes casa (são a mesma)", () => {
    expect(
      avaliarElegibilidade(candidato({ cidade: "SÃO PAULO" }), FILTRO, contexto()),
    ).toEqual({ ok: true });
  });
  it("sem categoria no filtro = qualquer categoria serve", () => {
    const r = avaliarElegibilidade(
      candidato({ categorias: ["Padaria"] }),
      { cidade: "São Paulo", categorias: [] },
      contexto(),
    );
    expect(r).toEqual({ ok: true });
  });
});

describe("avaliarElegibilidade — um motivo por linha, na ordem da spec", () => {
  it("fora da cidade vence tudo (nem olha o resto)", () => {
    const r = avaliarElegibilidade(
      candidato({ cidade: "Campinas", do_not_contact: true, telefone_normalizado: null }),
      FILTRO,
      contexto(),
    );
    expect(r).toEqual({ ok: false, motivo: "fora_da_cidade" });
  });
  it("cidade nula também é fora_da_cidade", () => {
    expect(avaliarElegibilidade(candidato({ cidade: null }), FILTRO, contexto())).toEqual({
      ok: false,
      motivo: "fora_da_cidade",
    });
  });
  it("fora da categoria quando o filtro pede uma e o prospect não bate", () => {
    const r = avaliarElegibilidade(candidato({ categorias: ["Posto"] }), FILTRO, contexto());
    expect(r).toEqual({ ok: false, motivo: "fora_da_categoria" });
  });
  it("do_not_contact (opt-out da base) é recusado antes de qualquer duplicidade", () => {
    const r = avaliarElegibilidade(candidato({ do_not_contact: true }), FILTRO, contexto());
    expect(r).toEqual({ ok: false, motivo: "nao_contatar" });
  });
  it("sem telefone", () => {
    expect(avaliarElegibilidade(candidato({ telefone_normalizado: null }), FILTRO, contexto())).toEqual({
      ok: false,
      motivo: "sem_telefone",
    });
  });
  it("telefone que não é E.164 (+ e 8..15 dígitos)", () => {
    expect(
      avaliarElegibilidade(candidato({ telefone_normalizado: "11999999999" }), FILTRO, contexto()),
    ).toEqual({ ok: false, motivo: "telefone_invalido" });
  });
  it("fixo (sem 9 na faixa móvel) não tem WhatsApp — não há canal de entrega", () => {
    expect(
      avaliarElegibilidade(candidato({ telefone_normalizado: "+5511333344444" }), FILTRO, contexto()),
    ).toEqual({ ok: false, motivo: "sem_whatsapp" });
  });
});

describe("avaliarElegibilidade — a escada das duplicidades, na ordem", () => {
  const casos: [keyof ContextoDeDuplicidade, string][] = [
    ["recusouContato", "ja_recusou"],
    ["jaNaFila", "ja_na_fila"],
    ["jaCliente", "ja_cliente"],
    ["pedidoEmAndamento", "pedido_em_andamento"],
    ["jaLead", "ja_lead"],
    ["conversaAtiva", "conversa_ativa"],
    ["mensagemRecente", "mensagem_recente"],
  ];
  for (const [chave, motivo] of casos) {
    it(`${chave} → ${motivo}`, () => {
      expect(avaliarElegibilidade(candidato(), FILTRO, contexto({ [chave]: true }))).toEqual({
        ok: false,
        motivo,
      });
    });
  }
  it("recusouContato vence jaNaFila (a tela nunca mostra dois motivos)", () => {
    const r = avaliarElegibilidade(
      candidato(),
      FILTRO,
      contexto({ recusouContato: true, jaNaFila: true }),
    );
    expect(r).toEqual({ ok: false, motivo: "ja_recusou" });
  });
});

describe("cota do dia (§6)", () => {
  it("cotaRestante: o que sobra, nunca negativo", () => {
    expect(cotaRestante(30, 0)).toBe(30);
    expect(cotaRestante(30, 12)).toBe(18);
    expect(cotaRestante(30, 45)).toBe(0);
  });
  it("contarConsumo: só o que passou por CONTACTING conta — queued não", () => {
    const linhas: { status: StatusDaFila }[] = [
      { status: "queued" },
      { status: "discovered" },
      { status: "qualified" },
      { status: "contacting" },
      { status: "contacted" },
      { status: "no_response" },
      { status: "failed" },
    ];
    expect(contarConsumo(linhas)).toBe(4);
  });
  it("contarConsumo de lista vazia é zero (não NaN, não undefined)", () => {
    expect(contarConsumo([])).toBe(0);
  });
});
