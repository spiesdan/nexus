/**
 * OS DOIS ALERTAS DE VENCIMENTO, E A JANELA DE CADA UM.
 *
 * O pedido original distingue dois avisos que na maior parte dos casos parecem
 * o mesmo:
 *
 *   - "Gerar um aviso preventivo no 30º dia após a emissão" (para 45 dias)
 *   - "Gerar o alerta de vencimento no 45º dia"
 *
 * E para 30 dias não existe preventivo. Estes testes fixam essa diferença — que
 * é o tipo de coisa que "só quando der problema" não revela.
 */
import { describe, expect, it } from "vitest";

import {
  alertasDeVencimento,
  chaveDoAlerta,
  chaveDoPreventivo,
  type RecebivelParaConferir,
} from "@/lib/meu-dia/vencimento";

const HOJE = "2026-10-09";

function r(over: Partial<RecebivelParaConferir> = {}): RecebivelParaConferir {
  return {
    id: "r-1",
    order_id: "o-1",
    contact_id: null,
    cliente_nome: "ACME",
    valor_original_cents: 100_000,
    vencimento: HOJE,
    status: "aberto",
    forma_pagamento: "agendado_30",
    parcela_n: 1,
    total_parcelas: 1,
    vencimento_depende_de_nf: false,
    ...over,
  };
}

function alertasDe(um: RecebivelParaConferir, hoje = HOJE) {
  return alertasDeVencimento([um], hoje, "org-1");
}

describe("o que vira alerta", () => {
  it("vencido ontem", () => {
    const a = alertasDe(r({ vencimento: "2026-10-08" }));
    expect(a).toHaveLength(1);
    expect(a[0]?.titulo).toMatch(/vencido há 1 dia/);
    expect(a[0]?.prioridade).toBe("critica");
  });

  it("vence hoje", () => {
    const a = alertasDe(r({ vencimento: HOJE }));
    expect(a).toHaveLength(1);
    expect(a[0]?.titulo).toMatch(/vence hoje/);
  });

  it("vence em 3 dias — dentro da antecedência", () => {
    const a = alertasDe(r({ vencimento: "2026-10-12" }));
    expect(a).toHaveLength(1);
    expect(a[0]?.titulo).toMatch(/vence em 3 dias/);
  });

  it("vence em 20 dias — ainda não é hora, e avisar seria ruído", () => {
    expect(alertasDe(r({ vencimento: "2026-10-29" }))).toHaveLength(0);
  });
});

describe("o preventivo do 45 dias", () => {
  it("dispara no dia 30 da emissão, que é 15 dias antes do vencimento", () => {
    // Emissão 09/10 → vencimento 23/11 (45 dias). O dia 30 da emissão é 08/11,
    // e dali faltam 15 dias — o começo da janela.
    const a = alertasDe(
      r({ vencimento: "2026-11-23", forma_pagamento: "agendado_45" }),
      "2026-11-08",
    );
    expect(a).toHaveLength(1);
    expect(a[0]?.titulo).toMatch(/15 dias para o vencimento/);
    expect(a[0]?.chave).toMatch(/^vencimento_proximo:/);
  });

  it("cobre a janela inteira: do 15º ao 30º dia da emissão", () => {
    // 24/10 é o dia 15 (faltam 30) e 08/11 é o dia 30 (faltam 15). Os dois
    // extremos geram o preventivo.
    for (const [hoje, faltando] of [
      ["2026-10-24", 30],
      ["2026-11-01", 22],
      ["2026-11-08", 15],
    ] as const) {
      const a = alertasDe(r({ vencimento: "2026-11-23", forma_pagamento: "agendado_45" }), hoje);
      expect(a[0]?.chave, `não gerou preventivo em ${hoje}`).toMatch(/^vencimento_proximo:/);
      expect(a[0]?.titulo, `contagem errada em ${hoje}`).toContain(`${faltando} dias`);
    }
  });

  it("NÃO dispara ANTES da janela — avisar cedo é só mais um aviso", () => {
    // 23/10 é o dia 14 — a janela (15 a 30 dias antes) ainda NÃO abriu. Em
    // 25/10 já é dia 16 e o preventivo dispara; ver o teste da janela acima.
    expect(
      alertasDe(r({ vencimento: "2026-11-23", forma_pagamento: "agendado_45" }), "2026-10-23"),
    ).toHaveLength(0);
  });

  it("NÃO dispara DEPOIS da janela — perto do vencimento é o aviso normal", () => {
    const a = alertasDe(
      r({ vencimento: "2026-11-23", forma_pagamento: "agendado_45" }),
      "2026-11-20",
    );
    expect(a[0]?.chave).not.toMatch(/^vencimento_proximo:/);
  });

  it("30 dias NÃO tem preventivo — metade do prazo não informa ninguém", () => {
    // Um pedido de 30 dias que vence em 10 dias tem 20 dias de folga; o mesmo
    // aviso aqui seria um pedido de 45 dias adiantado.
    const a = alertasDe(r({ vencimento: "2026-10-19", forma_pagamento: "agendado_30" }));
    // Só o aviso de proximidade (5 dias) pode aparecer, e 10 dias não é ele.
    expect(a).toHaveLength(0);
  });
});

describe("o que não vira alerta", () => {
  it("sem vencimento", () => {
    expect(alertasDe(r({ vencimento: null }))).toHaveLength(0);
  });

  it("dependente de NF ainda não emitido", () => {
    // A data existe mas não é a do vencimento real — ela nasce com a emissão.
    const a = alertasDe(r({ vencimento_depende_de_nf: true, vencimento: "2026-10-01" }));
    expect(a).toHaveLength(0);
  });

  it("pago", () => {
    expect(alertasDe(r({ status: "pago" }))).toHaveLength(0);
  });
});

describe("as chaves", () => {
  it("o vencido e o preventivo são chaves DIFERENTES", () => {
    // Se fossem a mesma, o segundo sobrescreveria o primeiro e o operador
    // perderia a distinção entre "prevista" e "perdida".
    expect(chaveDoAlerta("r-1")).toBe("vencimento:r-1");
    expect(chaveDoPreventivo("r-1")).toBe("vencimento_proximo:r-1");
    expect(chaveDoAlerta("r-1")).not.toBe(chaveDoPreventivo("r-1"));
  });

  it("é o recebível e não o pedido — parcelas vencem em dias diferentes", () => {
    expect(chaveDoAlerta("r-1")).toContain("r-1");
    expect(chaveDoAlerta("r-1")).not.toContain("o-1");
  });
});

describe("o texto do aviso", () => {
  it("nomeia cliente, valor e vencimento", () => {
    const a = alertasDe(r({ vencimento: "2026-10-08" }));
    const texto = `${a[0]?.titulo} ${a[0]?.descricao}`;
    expect(texto).toContain("ACME");
    expect(texto).toMatch(/1\.000,00/);
    expect(texto).toContain("2026-10-08");
  });

  it("um pedido parcelado mostra qual parcela", () => {
    const a = alertasDe(r({ parcela_n: 2, total_parcelas: 3, vencimento: "2026-10-08" }));
    expect(a[0]?.descricao).toContain("parcela 2/3");
  });

  it("sem pedido, aponta para o financeiro", () => {
    const a = alertasDe(r({ order_id: null, vencimento: "2026-10-08" }));
    expect(a[0]?.href).toBe("/app/financeiro");
  });
});
