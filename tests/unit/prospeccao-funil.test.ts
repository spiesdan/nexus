import { describe, expect, it } from "vitest";

import { calcularFunil, type ProspectDoFunil } from "@/lib/prospeccao/funil";

function p(status: ProspectDoFunil["status_comercial"], dono: string | null = null): ProspectDoFunil {
  return { status_comercial: status, owner_user_id: dono };
}

const SEM_FIM = { oportunidades: 0, pedidos: 0, faturamento_cents: 0 };

describe("calcularFunil (spec 19, §28)", () => {
  it("lista vazia zera todos os estágios", () => {
    expect(calcularFunil([], SEM_FIM)).toEqual({
      encontrados: 0,
      selecionados: 0,
      contatados: 0,
      responderam: 0,
      qualificados: 0,
      oportunidades: 0,
      pedidos: 0,
      faturamento_cents: 0,
    });
  });

  it("encontrados = todos; selecionados = dono ou fora do estado inicial", () => {
    const funil = calcularFunil(
      [p("novo"), p("novo", "user-1"), p("nao_analisado"), p("contato_pendente")],
      SEM_FIM,
    );
    expect(funil.encontrados).toBe(4);
    // dono no "novo" conta; "nao_analisado" sem dono não; "contato_pendente" conta.
    expect(funil.selecionados).toBe(2);
    expect(funil.contatados).toBe(0);
  });

  it("conjuntos aninhados: contatados ≥ responderam ≥ qualificados", () => {
    const funil = calcularFunil(
      [p("contatado"), p("respondeu"), p("qualificado"), p("cliente"), p("sem_interesse"), p("descartado")],
      SEM_FIM,
    );
    expect(funil.encontrados).toBe(6);
    expect(funil.contatados).toBe(4); // contatado, respondeu, qualificado, cliente
    expect(funil.responderam).toBe(3); // respondeu, qualificado, cliente
    expect(funil.qualificados).toBe(2); // qualificado, cliente
    expect(funil.selecionados).toBe(6); // todo status ≠ inicial está no fluxo
  });

  it("ignorar/descartar não conta como contatado", () => {
    const funil = calcularFunil([p("sem_interesse"), p("descartado")], SEM_FIM);
    expect(funil.contatados).toBe(0);
    expect(funil.responderam).toBe(0);
    expect(funil.selecionados).toBe(2);
  });

  it("o fim (CRM) vem de fora e é repassado sem tradução", () => {
    const funil = calcularFunil([p("qualificado")], {
      oportunidades: 3,
      pedidos: 2,
      faturamento_cents: 15050,
    });
    expect(funil.oportunidades).toBe(3);
    expect(funil.pedidos).toBe(2);
    expect(funil.faturamento_cents).toBe(15050);
  });
});
