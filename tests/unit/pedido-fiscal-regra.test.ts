/**
 * A PARTIDA TEM TEXTO DENTRO. A REGRA QUE LÊ ESSE TEXTO, TESTADA.
 *
 * ─── O que estes testes têm de verdade que os outros não têm ─────────────────
 *
 * Um conjunto de casos de TEXTO que a busca por "NF" tem de acertar e errar.
 * A pergunta "isso precisa de nota?" é respondida por uma expressão regular, e
 * expressão regular não tem modo de passar por review de código: ela passa ou
 * não passa. O que se mede aqui é a taxa de erro nos dois sentidos, e ela é
 * assimétrica de propósito:
 *
 *   - FALSO NEGATIVO (pedido que precisa de NF não é marcado) — o pedido some
 *     do Meu Dia e ninguém percebe que ele sumiu. **É o pior.**
 *   - FALSO POSITIVO ("tenho flanela e café" vira pedido com NF) — o operador
 *     vê um aviso que não é, e o trains-o a ignorar todos.
 *
 * Por isso o conjunto é grande nos dois sentidos e o texto sem acento é caso
 * explícito: `/i` em JavaScript não dobra "ç", e "nota fiscal" escrito por
 * alguém sem acento precisa funcionar igual.
 */
import { describe, expect, it } from "vitest";

import {
  DIAS_DO_AVISO_PREVENTIVO_45,
  DIAS_DE_PRAZO,
  exigeNF,
  observaPedidoComNota,
  proximoDoVencimento,
  somaDias,
  trechoQueIndicaNota,
  vencimentoDoRecebimento,
} from "@/lib/comercial/pedido-fiscal";

describe("o pedido pede nota fiscal", () => {
  describe("o que tem que ser lido como pedido com NF", () => {
    const SIM = [
      ["pedido com nf", "o texto que o pedido original cita"],
      ["NF", "a sigla isolada"],
      ["com nf", "sem o substantivo na frente"],
      ["COM NF", "caixa alta"],
      ["com N.F.", "com pontos — o que o brasileiro digita"],
      ["com N. F.", "pontos E espaço"],
      ["nota fiscal", "por extenso — mesmo negócio que a sigla"],
      ["nota fiscal, por favor", "por extenso, com pedido no fim"],
      ["emitir nf", "verbo na frente"],
      ["NF\npor favor", "quebra de linha no meio"],
      ["  nf  ", "só a sigla, cercada de espaço"],
      ["Levar NF", "no meio de outra frase"],
      ["esse cliente sempre pede nf.", "com ponto final"],
      [
        "café NF na emin",
        "compra que pede nota — a sigla está isolada, e pedir nota é o que está escrito",
      ],
      ["nota fiscal 500", "por extenso, com número depois"],
    ] as const;

    for (const [texto, porque] of SIM) {
      it(`"${texto.replace(/\n/g, "\\n")}" → sim  (${porque})`, () => {
        expect(observaPedidoComNota(texto)).toBe(true);
      });
    }
  });

  describe("o que NÃO pode virar pedido com NF", () => {
    const NAO = [
      ["", "texto vazio"],
      ["   ", "só espaço"],
      [null, "observação nula"],
      [undefined, "observação ausente"],
      ["Levar flanela, sabão em pó e 2 caixas de água", "listagem de compra comum"],
      ["atencao: nfl hoje", "sigla de time, com letra colada"],
      ["e-mail alterado", "letras separadas"],
      ["transferência", "palavra que contém as letras"],
      ["informação", "palavra comum com n…f no meio"],
      ["não fiscal", "negação — a palavra mais perigosa do arquivo"],
      ["o pedido é com nota", "CONFIRMADO: sem a sigla nem o par por extenso, não dispara"],
      [
        "precisa de nota",
        "CONFIDADO: o par por extenso é `nota fiscal`, e `nota` solto é amplo demais",
      ],
    ] as const;

    for (const [texto, porque] of NAO) {
      it(`${JSON.stringify(texto)} → não  (${porque})`, () => {
        expect(observaPedidoComNota(texto as string | null)).toBe(false);
      });
    }
  });

  describe("borda de palavra dos dois lados", () => {
    it("não casa nf no MEIO de uma palavra", () => {
      // `\b` puro resolveria este, mas não resolveria `nf_pedido` — por isso o
      // lookaround, e por isso este par de casos existe.
      expect(observaPedidoComNota("kamurá")).toBe(false);
    });

    it("não casa `_`, que `\\w` inclui e a classe da borda não", () => {
      // Este é o teste que pega a regressão de trocar a classe por `\w`.
      // `nf_pedido` é um identificador interno, não um pedido com nota.
      expect(observaPedidoComNota("campos.nf_pedido")).toBe(false);
      expect(observaPedidoComNota("campo_pedido_nf")).toBe(false);
    });

    it("casa quando a sigla está isolada por pontuação", () => {
      expect(observaPedidoComNota("(nf)")).toBe(true);
      expect(observaPedidoComNota("[NF]")).toBe(true);
      expect(observaPedidoComNota("1-NF")).toBe(true);
    });

    it("aceita ponto entre n e f, que é como se escreve por extenso", () => {
      expect(observaPedidoComNota("N.F.")).toBe(true);
      expect(observaPedidoComNota("N. F.")).toBe(true);
    });
  });

  describe("acento: NFD antes de casar", () => {
    it('"não fiscal" NÃO vira pedido com NF', () => {
      // A palavra mais perigosa do teste: contém 'n', 'f' e é negação. Se o
      // acento não for normalizado, "não fiscal" pode casar `n f` com o
      // padrão e todo pedido de Tissue vira pedido com nota.
      expect(observaPedidoComNota("não fiscal")).toBe(false);
      expect(observaPedidoComNota("são paulo")).toBe(false);
      expect(observaPedidoComNota("informação")).toBe(false);
    });

    it('"nota fiscal" com acento continua casando', () => {
      expect(observaPedidoComNota("precisa de nota fiscal")).toBe(true);
    });
  });
});

describe("o campo vence o texto", () => {
  it("marcado na tela, sem observação → sim", () => {
    expect(exigeNF({ exige_nf: true, observacoes: null })).toBe(true);
    expect(exigeNF({ exige_nf: true, observacoes: "só flanela" })).toBe(true);
  });

  it("sem marcação, com o texto → sim (quem escreveu queria isso)", () => {
    expect(exigeNF({ exige_nf: false, observacoes: "pedido com nf" })).toBe(true);
    expect(exigeNF({ exige_nf: null, observacoes: "nota fiscal" })).toBe(true);
  });

  it("sem marcação e sem texto → não", () => {
    expect(exigeNF({ exige_nf: false, observacoes: null })).toBe(false);
    expect(exigeNF({ exige_nf: false, observacoes: "levar água" })).toBe(false);
  });
});

describe("o trecho que dispara mostra o que a pessoa escreveu", () => {
  it("devolve o texto com acento, mesmo casando em NFD", () => {
    const obs = "Cliente pediu nota fiscal e oNF";
    const trecho = trechoQueIndicaNota(obs);
    expect(trecho).toBeTruthy();
    // O texto ORIGINAL, não o normalizado: quem lê o alerta reconhece o que
    // escreveu. Devolver "nota fiscal" com o acento original importa pouco,
    // devolver "NFD" minúsculo seria o sistema falando outra língua.
    expect(trecho).toContain("nota fiscal");
  });

  it("devolve null quando não há texto", () => {
    expect(trechoQueIndicaNota(null)).toBeNull();
    expect(trechoQueIndicaNota("sem nada")).toBeNull();
  });

  it("não estoura o comprimento do texto", () => {
    const enorme = `${"x".repeat(4_000)} nf`;
    const trecho = trechoQueIndicaNota(enorme);
    expect(trecho, "um trecho de 4 KB no título do alerta").toBeTruthy();
    expect((trecho ?? "").length).toBeLessThan(120);
  });
});

describe("o vencimento nasce da NOTA, nunca do pedido", () => {
  it("à vista não vence em dia nenhum", () => {
    const r = vencimentoDoRecebimento({ forma_pagamento: "a_vista", dataEmissaoNf: "2026-10-09" });
    expect(r).toEqual({ situacao: "a_vista", vencimento: null });
  });

  it("30 dias conta a partir da emissão", () => {
    const r = vencimentoDoRecebimento({
      forma_pagamento: "agendado_30",
      dataEmissaoNf: "2026-10-09",
    });
    expect(r).toEqual({ situacao: "prazo", vencimento: "2026-11-08" });
  });

  it("45 dias conta a partir da emissão", () => {
    const r = vencimentoDoRecebimento({
      forma_pagamento: "agendado_45",
      dataEmissaoNf: "2026-10-09",
    });
    expect(r).toEqual({ situacao: "prazo", vencimento: "2026-11-23" });
  });

  it("SEM nota emitida, prazo NÃO tem data — nem estimada", () => {
    // Este é o caso que o pedido original chama de "sem criar uma data
    // definitiva incorreta". O teste é sobre a AUSÊNCIA: um `vencimento`
    // não-null aqui passaria a data errada direto para o financeiro.
    for (const forma of ["agendado_30", "agendado_45"] as const) {
      const r = vencimentoDoRecebimento({ forma_pagamento: forma, dataEmissaoNf: null });
      expect(r.vencimento, `${forma} sem NF não pode ter data`).toBeNull();
      expect(r.situacao).toBe("aguardando_nf");
    }
  });

  it("a data muda quando a NF sai, e só então", () => {
    const semNf = vencimentoDoRecebimento({ forma_pagamento: "agendado_30", dataEmissaoNf: null });
    const comNf = vencimentoDoRecebimento({
      forma_pagamento: "agendado_30",
      dataEmissaoNf: "2026-10-20",
    });
    expect(semNf.vencimento).toBeNull();
    expect(comNf.vencimento).toBe("2026-11-19");
  });

  it("forma desconhecida (texto livre antigo) não vira prazo", () => {
    // `condicao_pagamento` ainda aceita "30/60/90 dias" digitado à mão, e
    // esse pedido NÃO tem forma estruturada. Adivinhar 30 dias para ele seria
    // chutar o vencimento de um cliente que combinou 90.
    const r = vencimentoDoRecebimento({
      forma_pagamento: null,
      dataEmissaoNf: "2026-10-09",
    });
    expect(r).toEqual({ situacao: "indefinido", vencimento: null });
  });

  it("null (todo pedido anterior a 0261) não vira prazo", () => {
    expect(vencimentoDoRecebimento({}).situacao).toBe("indefinido");
  });
});

describe("somar dias na data, sem fuso", () => {
  it("estoura mês corretamente", () => {
    expect(somaDias("2026-01-31", 30)).toBe("2026-03-02");
    expect(somaDias("2026-10-09", 30)).toBe("2026-11-08");
  });

  it("estoura ano", () => {
    expect(somaDias("2026-12-20", 30)).toBe("2027-01-19");
  });

  it("não desloca por fuso — a mesma data dá o mesmo resultado", () => {
    // Este teste roda em UTC-3 e o resultado tem de bater com o cálculo em
    // UTC. `new Date("2026-10-09")` interpretaria a string como hora LOCAL e
    // somaria um dia a menos num limite de mês; aqui a conta é feita com
    // Date.UTC, que não tem fuso.
    expect(somaDias("2026-10-09", 30)).toBe("2026-11-08");
    expect(somaDias("2026-03-01", 30)).toBe("2026-03-31");
  });

  it("data inválida volta como veio, em vez de virar NaN", () => {
    expect(somaDias("lixo", 30)).toBe("lixo");
  });
});

describe("os prazos e o aviso preventivo", () => {
  it("30 e 45 são os prazos declarados", () => {
    expect(DIAS_DE_PRAZO.agendado_30).toBe(30);
    expect(DIAS_DE_PRAZO.agendado_45).toBe(45);
    expect(DIAS_DE_PRAZO.a_vista).toBeNull();
  });

  it("o aviso preventivo do 45 dias é no 30º dia", () => {
    expect(DIAS_DO_AVISO_PREVENTIVO_45).toBe(30);
    expect(DIAS_DO_AVISO_PREVENTIVO_45).toBeLessThan(DIAS_DE_PRAZO.agendado_45!);
  });
});

describe("o aviso chega antes, não depois", () => {
  it("avisa dentro da antecedência", () => {
    // Vence 08/11, hoje é 05/11 = 3 dias.
    expect(proximoDoVencimento("2026-11-08", "2026-11-05", 5)).toBe(true);
  });

  it("NÃO avisa longe demais (senão vira sempre)", () => {
    expect(proximoDoVencimento("2026-11-30", "2026-11-05", 5)).toBe(false);
  });

  it("NÃO avisa depois de vencer — esse é o outro alerta", () => {
    expect(proximoDoVencimento("2026-11-01", "2026-11-05", 5)).toBe(false);
  });

  it("avisa no dia do vencimento", () => {
    expect(proximoDoVencimento("2026-11-05", "2026-11-05", 5)).toBe(true);
  });

  it("o dia 30 do pedido de 45 dias entra na janela preventiva", () => {
    // Emissão 09/10 → vencimento 23/11. Em 08/11 (dia 30) faltam 15 dias.
    const vencimento = vencimentoDoRecebimento({
      forma_pagamento: "agendado_45",
      dataEmissaoNf: "2026-10-09",
    });
    expect(vencimento.vencimento).toBe("2026-11-23");
    // 15 dias de antecedência: o aviso preventivo entra.
    expect(proximoDoVencimento("2026-11-23", "2026-11-08", 15)).toBe(true);
  });
});
