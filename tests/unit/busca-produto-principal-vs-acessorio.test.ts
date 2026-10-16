/**
 * PRINCIPAL × ACESSÓRIO — o caso da vassoura que voltou cabo avulso.
 *
 * A pontuação mede qualidade de casamento textual: "vassoura" casa
 * "Cabo de vassoura avulso" com nota 1.0, igual às vassouras de verdade — e o
 * desempate alfabético punha "Cabo…" em primeiro. O modelo lê de cima para
 * baixo e apresentava o primeiro. Estes testes prendem a classificação
 * estrutural (`direta` × `relacionada`) e a ordenação que dela decorre.
 */
import { describe, expect, it } from "vitest";

import {
  buscarComRelaxamento,
  classificarRelacao,
  type ProdutoBuscavel,
} from "@/lib/catalogo/busca";

const VASSOURAS: ProdutoBuscavel[] = [
  { nome: "Vassoura de pelo", codigo: "VAS-PELO", categoria: "vassouras" },
  { nome: "Vassoura de nylon", codigo: "VAS-NYLON", categoria: "vassouras" },
  { nome: "Vassourão", codigo: "VAS-GRANDE", categoria: "vassouras" },
  { nome: "Cabo de vassoura avulso", codigo: "CABO-VAS", categoria: "acessórios" },
];

function nomes(consulta: string, catalogo: ProdutoBuscavel[] = VASSOURAS) {
  return buscarComRelaxamento(catalogo, consulta).achados;
}

describe("classificação principal × acessório", () => {
  it("⭐ 'quais vassouras vocês têm?' — cabo é relacionada, vassouras são diretas", () => {
    expect(classificarRelacao("Quais vassouras vocês têm?", VASSOURAS[3]!)).toBe("relacionada");
    expect(classificarRelacao("Quais vassouras vocês têm?", VASSOURAS[0]!)).toBe("direta");
    expect(classificarRelacao("Quais vassouras vocês têm?", VASSOURAS[2]!)).toBe("direta");
  });

  it("⭐ pedido explícito de acessório volta direta — 'quero um cabo de vassoura avulso'", () => {
    expect(classificarRelacao("Quero um cabo de vassoura avulso", VASSOURAS[3]!)).toBe("direta");
  });

  it("rodo × refil: 'têm refil de rodo?' casa o refil como direta", () => {
    const rodo = { nome: "Rodo 40cm", codigo: "RODO-40", categoria: "rodos" };
    const refil = { nome: "Refil para rodo 40cm", codigo: "REFIL-40", categoria: "acessórios" };
    expect(classificarRelacao("Vocês têm refil de rodo?", refil)).toBe("direta");
    expect(classificarRelacao("Vocês têm rodo?", refil)).toBe("relacionada");
    expect(classificarRelacao("Vocês têm rodo?", rodo)).toBe("direta");
  });

  it("categoria de acessório sem marca no nome também é relacionada", () => {
    const peca = { nome: "Alça reserva", codigo: "ALC-1", categoria: "peças" };
    expect(classificarRelacao("Vocês têm balde?", peca)).toBe("relacionada");
    expect(classificarRelacao("Vocês têm alça reserva?", peca)).toBe("direta");
  });

  it("consulta só com número não demove nada — número não é intenção de produto", () => {
    expect(classificarRelacao("128", VASSOURAS[3]!)).toBe("direta");
  });
});

describe("ordenação: diretas antes, sem duplicar", () => {
  it("⭐ 'quais vassouras vocês têm?' lista os 3 modelos antes do cabo", () => {
    const r = nomes("Quais vassouras vocês têm?");
    expect(r.map((a) => a.produto.codigo)).toEqual([
      "VAS-NYLON",
      "VAS-PELO",
      "VAS-GRANDE",
      "CABO-VAS",
    ]);
    expect(r[3]!.relacao).toBe("relacionada");
    expect(r.filter((a) => a.relacao === "direta")).toHaveLength(3);
  });

  it("o empate alfabético não põe mais o cabo na frente", () => {
    // Todos os 4 casam "vassoura" com nota máxima; antes do conserto o "Cabo…"
    // vinha primeiro por ordem alfabética e o modelo apresentava ele.
    const r = nomes("vassoura");
    expect(r[0]!.produto.codigo).not.toBe("CABO-VAS");
  });

  it("linhas duplicadas do cadastro (mesmo nome + preço) aparecem uma vez", () => {
    // Medido no catálogo real: "CABO DE VASSOURA AVULSO" ×2 e
    // "VASSOURA CERLON 40 CM PLASTICA" ×2 — sem isto o agente lista "duas opções" idênticas.
    const catalogo = [
      { nome: "Cabo de vassoura avulso", codigo: "CABO-1", categoria: "Vassouras", preco_cents: 500 },
      { nome: "Cabo de vassoura avulso", codigo: "CABO-2", categoria: "Vassouras", preco_cents: 500 },
      { nome: "Vassoura de pelo", codigo: "VAS-1", categoria: "vassouras", preco_cents: 1500 },
    ];
    const r = buscarComRelaxamento(catalogo, "vassoura");
    expect(r.achados.map((a) => a.produto.codigo)).toEqual(["VAS-1", "CABO-1"]);
  });

  it("mesmo nome com preços diferentes NÃO deduplica — pode ser variante real", () => {
    const catalogo = [
      { nome: "Vassoura X", codigo: "X-1", categoria: "vassouras", preco_cents: 1200 },
      { nome: "Vassoura X", codigo: "X-2", categoria: "vassouras", preco_cents: 1500 },
    ];
    const r = buscarComRelaxamento(catalogo, "vassoura x");
    expect(r.achados).toHaveLength(2);
  });
});

describe("combos e kits — 'vassoura é apenas vassoura'", () => {
  it("⭐ 'PÁ COM COLETOR + VASSOURA' para quem pediu vassoura é relacionada", () => {
    const pa = { nome: "PÁ COM COLETOR + VASSOURA", codigo: "149", categoria: "Vassouras" };
    expect(classificarRelacao("quais vassouras vocês têm?", pa)).toBe("relacionada");
  });

  it("'PÁ COM COLETOR + VASSOURA' para quem pediu PÁ é direta", () => {
    const pa = { nome: "PÁ COM COLETOR + VASSOURA", codigo: "149", categoria: "Vassouras" };
    expect(classificarRelacao("vocês têm pá de lixo?", pa)).toBe("direta");
  });

  it("'Vassoura com rotação' continua direta — a ligação vem depois", () => {
    const v = { nome: "Vassoura com rotação", codigo: "426", categoria: "Vassouras" };
    expect(classificarRelacao("quais vassouras vocês têm?", v)).toBe("direta");
  });

  it("'Suporte para celular' para quem pediu celular é relacionada", () => {
    const s = { nome: "Suporte para celular", codigo: "SUP-1", categoria: "acessórios" };
    expect(classificarRelacao("vocês têm celular?", s)).toBe("relacionada");
  });

  it("'Vassoura de palha cabo longo' continua direta — 'cabo' no fim não desvia", () => {
    const v = { nome: "Vassoura de palha cabo longo", codigo: "430", categoria: "Vassouras" };
    expect(classificarRelacao("quais vassouras vocês têm?", v)).toBe("direta");
  });
});

describe("sinônimos, erros de digitação e falsos amigos", () => {
  it("'vasoura' (erro) ainda acha as vassouras como diretas", () => {
    const r = nomes("vasoura");
    expect(r.filter((a) => a.relacao === "direta").length).toBeGreaterThan(0);
    expect(r[r.length - 1]!.produto.codigo).toBe("CABO-VAS");
  });

  it("'cabo' sozinho não traz 'acabou' como se fosse produto", () => {
    const catalogo: ProdutoBuscavel[] = [
      { nome: "Cabo de vassoura avulso", codigo: "CABO-VAS", categoria: "acessórios" },
      { nome: "Acabamento premium", codigo: "ACAB-1", categoria: "outros" },
    ];
    const r = nomes("cabo", catalogo);
    expect(r.map((a) => a.produto.codigo)).toEqual(["CABO-VAS"]);
  });
});
