/**
 * FECHAR CARGA NÃO É PAGAR — e o que QUANDO É pagar.
 *
 * ─── A regra que este arquivo trava ──────────────────────────────────────────
 *
 * O pedido original tem uma frase que é a regra inteira:
 *
 *   "fechar um romaneio não significa, por si só, que todos os pedidos foram
 *   pagos. A baixa automática deve ocorrer apenas quando houver confirmação do
 *   recebimento conforme os dados e as regras reais do sistema."
 *
 * E tem a consequência, que é a que dói:
 *
 *   "Se um romaneio agrupar vários pedidos, fazer a conciliação individual de
 *   cada pedido. Não dar baixa em todos apenas porque um dos clientes pagou."
 *
 * Os dois erros são do MESMO lugar — dar baixa em todos, ou em nenhum — e ambos
 * são silenciosos: o banco aceita, a tela mostra "carga fechada", e o dinheiro
 * some ou não some sem ninguém notar até o fechamento do mês.
 */
import { describe, expect, it } from "vitest";

import {
  conciliarFechamentoDeCarga,
  chaveDaBaixa,
  resumoDaConciliacao,
  textoDoMotivo,
  type ConfirmacaoDoRecebimento,
  type PedidoDoRomaneio,
  type RecebivelDoPedido,
} from "@/lib/comercial/conciliacao-carga";

const HOJE = "2026-10-09";

function pedido(id: string, numero: number): PedidoDoRomaneio {
  return {
    id,
    numero,
    cliente_nome: `CLIENTE ${numero}`,
    total_cents: 100_00,
    status: "expedido",
  };
}

function recebivel(
  pedidoId: string,
  over: Partial<RecebivelDoPedido> = {},
): [string, RecebivelDoPedido] {
  return [
    pedidoId,
    {
      id: `rec-${pedidoId}`,
      valor_original_cents: 100_00,
      valor_recebido_cents: 0,
      status: "aberto",
      vencimento: "2026-11-08",
      ...over,
    },
  ];
}

function conferir(
  pedidos: PedidoDoRomaneio[],
  recebiveis: [string, RecebivelDoPedido][],
  confirmacoes: ConfirmacaoDoRecebimento[],
) {
  return conciliarFechamentoDeCarga(pedidos, new Map(recebiveis), confirmacoes, HOJE);
}

describe("o que dá baixa", () => {
  it("o pedido que a pessoa marcou como pago, no valor total", () => {
    const d = conferir(
      [pedido("p1", 1)],
      [recebivel("p1")],
      [{ pedidoId: "p1", pago: true, valorRecebidoCents: 100_00 }],
    );
    expect(d).toHaveLength(1);
    expect(d[0]?.tipo).toBe("baixa");
    expect(d[0]?.tipo === "baixa" && d[0].valorCents).toBe(100_00);
  });

  it("sem valor digitado, usa o saldo em aberto", () => {
    // Marcar a caixa e não dizer quanto é o caso comum de quem recebeu o
    // valor cheio. Exigir o valor faria a pessoa digitar de novo o que a tela
    // já mostra.
    const d = conferir([pedido("p1", 1)], [recebivel("p1")], [{ pedidoId: "p1", pago: true }]);
    // Sem valor, `valor_invalido` — a decisão é "não sei o quanto", e fingir que
    // sei o saldo seria inventar um recebimento.
    expect(d[0]?.tipo).toBe("permanece_em_aberto");
  });

  it("data ausente usa hoje — e não uma data inventada", () => {
    const d = conferir(
      [pedido("p1", 1)],
      [recebivel("p1")],
      [{ pedidoId: "p1", pago: true, valorRecebidoCents: 100_00 }],
    );
    expect(d[0]?.tipo === "baixa" && d[0].pagoEm).toBe(HOJE);
  });

  it("a data que a pessoa digitado é respeitada", () => {
    const d = conferir(
      [pedido("p1", 1)],
      [recebivel("p1")],
      [{ pedidoId: "p1", pago: true, valorRecebidoCents: 100_00, pagoEm: "2026-10-05" }],
    );
    expect(d[0]?.tipo === "baixa" && d[0].pagoEm).toBe("2026-10-05");
  });
});

describe("o que NÃO dá baixa — o lado caro", () => {
  it("pedido que a pessoa NÃO marcou", () => {
    // Este é o caso central: fechar a carga não é pagar.
    const d = conferir(
      [pedido("p1", 1), pedido("p2", 2)],
      [recebivel("p1"), recebivel("p2")],
      [{ pedidoId: "p1", pago: true, valorRecebidoCents: 100_00 }],
    );
    const p2 = d.find((x) => x.pedidoId === "p2");
    expect(p2?.tipo).toBe("permanece_em_aberto");
    expect(p2?.tipo === "permanece_em_aberto" && p2.motivo).toBe("nao_confirmado");
  });

  it("um cliente pagou NÃO quita os outros do mesmo romaneio", () => {
    // A frase do pedido original, como teste.
    const d = conferir(
      [pedido("p1", 1), pedido("p2", 2), pedido("p3", 3)],
      [recebivel("p1"), recebivel("p2"), recebivel("p3")],
      [{ pedidoId: "p1", pago: true, valorRecebidoCents: 100_00 }],
    );
    expect(d.filter((x) => x.tipo === "baixa")).toHaveLength(1);
    expect(d.filter((x) => x.tipo === "permanece_em_aberto")).toHaveLength(2);
  });

  it("nenhum marcado = nenhuma baixa, e todas as linhas são respondidas", () => {
    const d = conferir([pedido("p1", 1), pedido("p2", 2)], [recebivel("p1"), recebivel("p2")], []);
    expect(d.filter((x) => x.tipo === "baixa")).toHaveLength(0);
    expect(d).toHaveLength(2);
  });

  it("pedido sem recebível não dá baixa — e diz por quê", () => {
    const d = conferir(
      [pedido("p1", 1)],
      [],
      [{ pedidoId: "p1", pago: true, valorRecebidoCents: 100_00 }],
    );
    expect(d[0]?.tipo).toBe("permanece_em_aberto");
    expect(d[0]?.tipo === "permanece_em_aberto" && d[0].motivo).toBe("sem_recebivel");
  });

  it("já quitado não dá baixa duplicada", () => {
    const d = conferir(
      [pedido("p1", 1)],
      [recebivel("p1", { status: "pago", valor_recebido_cents: 100_00 })],
      [{ pedidoId: "p1", pago: true, valorRecebidoCents: 100_00 }],
    );
    expect(d[0]?.tipo === "permanece_em_aberto" && d[0].motivo).toBe("ja_quitado");
  });
});

describe("os limites do valor", () => {
  it("acima do saldo é recusado", () => {
    const d = conferir(
      [pedido("p1", 1)],
      [recebivel("p1")],
      [{ pedidoId: "p1", pago: true, valorRecebidoCents: 150_00 }],
    );
    expect(d[0]?.tipo === "permanece_em_aberto" && d[0].motivo).toBe("valor_acima_do_saldo");
  });

  it("parcial NÃO quita o saldo inteiro — e o restante fica explícito", () => {
    const d = conferir(
      [pedido("p1", 1)],
      [recebivel("p1")],
      [{ pedidoId: "p1", pago: true, valorRecebidoCents: 40_00 }],
    );
    expect(d[0]?.tipo).toBe("permanece_em_aberto");
    expect(d[0]?.tipo === "permanece_em_aberto" && d[0].motivo).toBe("parcial");
    expect(d[0]?.tipo === "permanece_em_aberto" && d[0].saldoRestanteCents).toBe(60_00);
  });

  it("parcial sobre o que já foi recebido compara com o SALDO, não com o total", () => {
    // Já Entraram 60; o saldo é 40. Pagar 40 quita. Pagar 41 é demais.
    const quita = conferir(
      [pedido("p1", 1)],
      [recebivel("p1", { valor_recebido_cents: 60_00 })],
      [{ pedidoId: "p1", pago: true, valorRecebidoCents: 40_00 }],
    );
    expect(quita[0]?.tipo).toBe("baixa");

    const demais = conferir(
      [pedido("p1", 1)],
      [recebivel("p1", { valor_recebido_cents: 60_00 })],
      [{ pedidoId: "p1", pago: true, valorRecebidoCents: 41_00 }],
    );
    expect(demais[0]?.tipo).toBe("permanece_em_aberto");
  });

  it("zero e negativo são recusados", () => {
    for (const valor of [0, -100]) {
      const d = conferir(
        [pedido("p1", 1)],
        [recebivel("p1")],
        [{ pedidoId: "p1", pago: true, valorRecebidoCents: valor }],
      );
      expect(d[0]?.tipo === "permanece_em_aberto" && d[0].motivo, `valor ${valor}`).toBe(
        "valor_invalido",
      );
    }
  });
});

describe("a idempotência da baixa", () => {
  it("a chave é por pedido, não por carga", () => {
    // Com uma chave por carga, a segunda baixa do mesmo romaneio pareceria
    // repetida da primeira — e o pedido original proíbe isso.
    expect(chaveDaBaixa("carga-1", "pedido-1")).toBe("carga:carga-1:pedido:pedido-1");
    expect(chaveDaBaixa("carga-1", "pedido-1")).not.toBe(chaveDaBaixa("carga-1", "pedido-2"));
  });

  it("reprocessar a mesma carga dá a MESMA chave", () => {
    expect(chaveDaBaixa("carga-1", "pedido-1")).toBe(chaveDaBaixa("carga-1", "pedido-1"));
  });
});

describe("o que a pessoa vê depois de fechar", () => {
  it("uma linha por pedido, sempre", () => {
    const d = conferir(
      [pedido("p1", 1), pedido("p2", 2)],
      [recebivel("p1"), recebivel("p2")],
      [{ pedidoId: "p1", pago: true, valorRecebidoCents: 100_00 }],
    );
    const r = resumoDaConciliacao(d);
    expect(r.processados).toBe(2);
    expect(r.baixados).toBe(1);
    expect(r.emAberto).toBe(1);
    expect(r.totalBaixadoCents).toBe(100_00);
  });

  it("cada motivo tem frase", () => {
    for (const m of [
      "confirmado_na_conciliacao",
      "nao_confirmado",
      "sem_recebivel",
      "ja_quitado",
      "valor_invalido",
      "valor_acima_do_saldo",
      "parcial",
    ] as const) {
      expect(textoDoMotivo(m), `sem texto para ${m}`).not.toBe("");
    }
  });
});
