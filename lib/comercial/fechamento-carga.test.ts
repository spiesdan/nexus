/**
 * `contaDoCaixa` — a conta que o PDF deixava para o olho humano.
 *
 * ═══ POR QUE CADA TESTE TEM UM "MUTAÇÃO" AO LADO ═════════════════════════
 *
 * Esta é dinheiro: uma linha trocada de sinal devolve uma diferença plausível,
 * e plausível é o que passa despercebido no fechamento do dia. Cada teste aqui
 * nomeia a mutação que ele segura, e a mutação é aplicada no fim para ver o
 * teste cair.
 *
 * O caso mais perigoso da lista é o das três despesas: se entrarem com sinal
 * POSITIVO, o líquido sobe, a diferença vira sobra, e o caixa fecha "batendo"
 * com dinheiro que nunca entrou. Nenhum teste que confira só o total absoluto
 * pegaria isso — por isso os testes conferem o SINAL de cada linha.
 */
import { describe, expect, it } from "vitest";

import {
  avisosDoFechamento,
  contaDoCaixa,
  linhasCompletas,
  LINHAS_DO_CAIXA,
  type LinhaDoCaixa,
} from "./fechamento-carga";

const l = (chave: LinhaDoCaixa["chave"], valor: number): LinhaDoCaixa => ({
  chave,
  valor_cents: valor,
});

describe("LINHAS_DO_CAIXA", () => {
  it("são as oito do PDF, na mesma ordem", () => {
    expect(LINHAS_DO_CAIXA.map((x) => x.chave)).toEqual([
      "dinheiro",
      "pix",
      "cartao",
      "cheques",
      "boletos",
      "vale_motorista",
      "combustivel",
      "outras_despesas",
    ]);
  });

  it("as três últimas são saída, e as cinco primeiras são entrada", () => {
    const saidas = LINHAS_DO_CAIXA.filter((x) => !x.entrada).map((x) => x.chave);
    expect(saidas).toEqual(["vale_motorista", "combustivel", "outras_despesas"]);
  });
});

describe("contaDoCaixa", () => {
  it("soma as entradas", () => {
    const c = contaDoCaixa(
      [l("dinheiro", 10000), l("pix", 5000), l("cartao", 2500)],
      0,
    );
    expect(c.entradas_cents).toBe(17500);
    expect(c.liquido_cents).toBe(17500);
  });

  it("MUTAÇÃO: despesa com sinal POSITIVO faz a diferença dizer 'sobrou' o dinheiro que faltou", () => {
    // 500 de despesa somada como entrada dá 1500 de líquido contra 500
    // esperado: sobra de 1000 que não existe.
    const c = contaDoCaixa([l("dinheiro", 2000), l("combustivel", 500)], 1500);
    expect(c.saidas_cents).toBe(500);
    expect(c.liquido_cents).toBe(1500);
    expect(c.diferenca_cents).toBe(0);
  });

  it("despesas saem do líquido", () => {
    const c = contaDoCaixa(
      [l("dinheiro", 5000), l("vale_motorista", 1000), l("combustivel", 500), l("outras_despesas", 250)],
      3000,
    );
    expect(c.entradas_cents).toBe(5000);
    expect(c.saidas_cents).toBe(1750);
    expect(c.liquido_cents).toBe(3250);
  });

  it("MUTAÇÃO: ignorar as despesas faz o líquido passar do valor entregue", () => {
    const completo = contaDoCaixa([l("dinheiro", 5000), l("combustivel", 800)], 4200);
    const semDespesa = contaDoCaixa([l("dinheiro", 5000)], 4200);
    expect(completo.diferenca_cents).toBe(0);
    expect(semDespesa.diferenca_cents).toBe(800);
  });

  it("diferença positiva é sobra, negativa é falta", () => {
    expect(contaDoCaixa([l("dinheiro", 5000)], 4000).diferenca_cents).toBe(1000);
    expect(contaDoCaixa([l("dinheiro", 5000)], 6000).diferenca_cents).toBe(-1000);
  });

  it("sobrou e faltou nunca são os dois", () => {
    // O erro clássico é mostrar "sobrou R$ 100" numa diferença de −100 porque
    // o `Math.abs` entrou antes do `if`.
    const sobra = contaDoCaixa([l("dinheiro", 5100)], 5000);
    const falta = contaDoCaixa([l("dinheiro", 4900)], 5000);
    expect(sobra.diferenca_cents).toBeGreaterThan(0);
    expect(sobra.bate).toBe(false);
    expect(falta.diferenca_cents).toBeLessThan(0);
    expect(falta.bate).toBe(false);
  });

  it("bate só quando a diferença é exatamente zero", () => {
    expect(contaDoCaixa([l("dinheiro", 5000)], 5000).bate).toBe(true);
    expect(contaDoCaixa([l("dinheiro", 5001)], 5000).bate).toBe(false);
    expect(contaDoCaixa([l("dinheiro", 4999)], 5000).bate).toBe(false);
  });

  it("linha vazia vale zero, e não some do total", () => {
    const c = contaDoCaixa([l("dinheiro", 1000)], 1000);
    expect(c.entradas_cents).toBe(1000);
    expect(c.liquido_cents).toBe(1000);
  });

  it("MUTAÇÃO: `linhasCompletas` devolvendo só as preenchidas muda a ordem do PDF", () => {
    const completas = linhasCompletas([l("cartao", 700)]);
    expect(completas).toHaveLength(8);
    expect(completas[0]!.chave).toBe("dinheiro");
    expect(completas[2]!.valor_cents).toBe(700);
  });

  it("chave repetida conta uma vez só", () => {
    // Duas linhas com a mesma chave viram uma: somar as duas faria o caixa
    // "bater" por dupla contagem.
    const c = contaDoCaixa([l("dinheiro", 1000), l("dinheiro", 1000)], 2000);
    expect(c.entradas_cents).toBe(2000);
  });

  it("valor não numérico vira zero, e não NaN que contamina a soma", () => {
    const c = contaDoCaixa([l("dinheiro", Number.NaN)], 0);
    expect(Number.isFinite(c.liquido_cents)).toBe(true);
    expect(c.liquido_cents).toBe(0);
  });

  it("centavo não inteiro é truncado, não arredondado", () => {
    // Arredondar 1000,5 para 1001 faz o caixa bater por acaso.
    const c = contaDoCaixa([l("dinheiro", 1000.9)], 1000);
    expect(c.liquido_cents).toBe(1000);
  });

  it("uma carga sem nada a cobrar e sem entrada bate em zero", () => {
    // O caso que tem de ser verdade: carga sem cobrança não tem diferença, e
    // dizer que "faltou R$ 0,00" seria ruído.
    const c = contaDoCaixa([], 0);
    expect(c.bate).toBe(true);
    expect(c.diferenca_cents).toBe(0);
  });
});

describe("avisosDoFechamento", () => {
  it("NENHUMA parada conferida é erro — e não aviso", () => {
    const c = contaDoCaixa([l("dinheiro", 1000)], 1000);
    const av = avisosDoFechamento(c, 0, 5);
    expect(av.some((a) => a.nivel === "erro")).toBe(true);
    expect(av.some((a) => /Nenhuma parada foi conferida/.test(a.texto))).toBe(true);
  });

  it("conferir parte é atenção, não erro", () => {
    const c = contaDoCaixa([l("dinheiro", 1000)], 1000);
    const av = avisosDoFechamento(c, 3, 5);
    expect(av.some((a) => a.nivel === "erro")).toBe(false);
    expect(av.some((a) => /Faltam conferir 2 de 5/.test(a.texto))).toBe(true);
  });

  it("carga sem paradas não exige conferência", () => {
    // Rota vazia não tem o que conferir; exigir seria um erro falso que
    // impediria fechar uma carga sem pedido.
    const c = contaDoCaixa([], 0);
    expect(avisosDoFechamento(c, 0, 0)).toHaveLength(0);
  });

  it("MUTAÇÃO: transformar 'nada conferido' em atenção deixaria fechar sem conferir", () => {
    const c = contaDoCaixa([l("dinheiro", 1000)], 1000);
    const av = avisosDoFechamento(c, 0, 5);
    expect(av.filter((a) => a.nivel === "atencao").length).toBeLessThan(av.length);
  });

  it("diferença vira aviso com a palavra certa", () => {
    const sobra = avisosDoFechamento(contaDoCaixa([l("dinheiro", 1200)], 1000), 1, 1);
    expect(sobra.some((a) => /Sobra de 2.00/.test(a.texto))).toBe(true);
    const falta = avisosDoFechamento(contaDoCaixa([l("dinheiro", 800)], 1000), 1, 1);
    expect(falta.some((a) => /Falta de 2.00/.test(a.texto))).toBe(true);
  });

  it("nada contado com valor a cobrar é suspeito — e o aviso diz o que conferir", () => {
    const c = contaDoCaixa([], 5000);
    expect(avisosDoFechamento(c, 1, 1).some((a) => /Nenhuma entrada contada/.test(a.texto))).toBe(
      true,
    );
  });

  it("fechamento completo, conferido e batendo não avisa nada", () => {
    const c = contaDoCaixa([l("dinheiro", 1000)], 1000);
    expect(avisosDoFechamento(c, 1, 1)).toHaveLength(0);
  });
});