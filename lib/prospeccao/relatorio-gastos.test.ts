/**
 * RELATÓRIO MENSAL — três colunas de duas fontes, guard reaproveitado e CSV.
 *
 * O que se trava: orçado (soma das duas colunas), gasto (prospecção real +
 * mídia lançada), o guard 80/100 e um CSV com cabeçalho fixo e escape correto.
 */
import { describe, expect, it } from "vitest";

import {
  montarRelatorio,
  relatorioParaCsv,
  type LinhaDeGasto,
} from "./relatorio-gastos";

const base: LinhaDeGasto = {
  campanha_id: "c-1",
  nome: 'Campanha "Teste", Mafra',
  orcamento_prospeccao_cents: 20000,
  orcamento_midia_cents: 5000,
  gasto_prospeccao_cents: 9000,
  midia_lancada_cents: 8000,
};

describe("montarRelatorio", () => {
  it("soma orçado e gasto das duas fontes e aplica o guard", () => {
    const [linha] = montarRelatorio([base], null);
    expect(linha?.orcamento_total_cents).toBe(25000);
    expect(linha?.gasto_total_cents).toBe(17000);
    expect(linha?.pct).toBe(68);
    expect(linha?.guard.estado).toBe("ok");
  });

  it("80% avisa, 100% bloqueia — o mesmo guard do gasto na criação", () => {
    const apertado = montarRelatorio([{ ...base, gasto_prospeccao_cents: 12500 }], null);
    expect(apertado[0]?.guard.estado).toBe("aviso");
    const estourado = montarRelatorio([{ ...base, gasto_prospeccao_cents: 20000 }], null);
    expect(estourado[0]?.guard.estado).toBe("bloqueio");
    expect(estourado[0]?.guard.permite).toBe(false);
  });

  it("campanha sem orçamento próprio cai no limite da org", () => {
    const semOrcamento = montarRelatorio(
      [{ ...base, orcamento_prospeccao_cents: null, orcamento_midia_cents: null }],
      20000,
    );
    expect(semOrcamento[0]?.orcamento_total_cents).toBeNull();
    expect(semOrcamento[0]?.guard.estado).toBe("aviso");
  });
});

describe("CSV", () => {
  it("tem cabeçalho fixo e escapa vírgulas/aspas no nome", () => {
    const csv = relatorioParaCsv(montarRelatorio([base], null));
    const linhas = csv.trim().split("\n");
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toBe(
      "campanha_id,campanha,orcamento_prospeccao_cents,orcamento_midia_cents,gasto_prospeccao_cents,midia_lancada_cents,orcamento_total_cents,gasto_total_cents,percentual,estado,proximo_passo",
    );
    expect(csv).toContain('"Campanha ""Teste"", Mafra"');
    expect(linhas[1]).toContain(",25000,17000,68,ok,");
  });
});
