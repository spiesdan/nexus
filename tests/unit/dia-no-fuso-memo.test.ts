import { describe, expect, it } from "vitest";

import { diaNoFuso, FUSO_PADRAO } from "@/lib/comercial/inteligencia";

/**
 * A home do `/app` ficou lenta numa org com 6.131 pedidos na janela de 14 meses.
 * A causa medida não foi banco nem rede: `diaNoFuso` construía um
 * `Intl.DateTimeFormat` NOVO a cada chamada, e ela roda uma vez por linha em
 * oito pontos do cálculo dos indicadores.
 *
 * Estes testes existem para travar duas coisas:
 *  1. o RESULTADO — memoizar não pode alterar nenhuma string devolvida;
 *  2. a VELOCIDADE — o memo precisa continuar valendo depois de muitas
 *     chamadas, senão a correção é de fachada.
 *
 * O limite de tempo aqui é folgado de propósito (x4 do medido): a intenção é
 * pegar a volta do `new Intl` por chamada, que custa ~55x, e não servir de
 * cronometro de CI — máquina lenta não pode ficar vermelha por causa disso.
 */
describe("diaNoFuso", () => {
  it("devolve a mesma data com o memo frio e com o memo quente", () => {
    const iso = "2026-09-05T01:30:00.000Z";
    // Primeira chamada (memo ainda vazio) e a segunda (reuso).
    const primeira = diaNoFuso(iso, FUSO_PADRAO);
    const segunda = diaNoFuso(iso, FUSO_PADRAO);
    expect(primeira).toBe(segunda);
    // 01:30 UTC em São Paulo (UTC-3) é a véspera, dia 04.
    expect(primeira).toBe("2026-09-04");
  });

  it("fuso desconhecido cai no corte de `iso`, sem estourar", () => {
    const iso = "2026-09-05T01:30:00.000Z";
    // Primeiro estouraria o `try` de dentro; o memo precisa devolver o mesmo
    // corte nas chamadas seguintes.
    expect(diaNoFuso(iso, "Fuso/Nao_Existe")).toBe("2026-09-05");
    expect(diaNoFuso(iso, "Fuso/Nao_Existe")).toBe("2026-09-05");
  });

  it("formatos diferentes não se misturam no mesmo cache", () => {
    // O mesmo fuso alimenta dois formatadores com opções diferentes (dia e
    // partes). Se compartilhassem Map, `partes["hour"]` sairia undefined.
    const iso = "2026-09-05T01:30:00.000Z";
    expect(diaNoFuso(iso, "UTC")).toBe("2026-09-05");
    expect(diaNoFuso(iso, FUSO_PADRAO)).toBe("2026-09-04");
    // E de volta: o primeiro fuso não foi contaminado pelo segundo.
    expect(diaNoFuso(iso, "UTC")).toBe("2026-09-05");
  });

  it("o formatador é construído UMA vez, não uma por chamada", () => {
    // Contar construções, não cronometrar: é determinístico. Um teste em
    // milissegundos reprovaria na máquina lenta sem que nada estivesse errado
    // — o que treina o time a ignorar o alarme.
    //
    // A pergunta é exata: o `Intl` está sendo pago uma vez por fuso ou uma vez
    // por linha? Antes da correção, 6.131 vezes por requisição do dashboard.
    const original = Intl.DateTimeFormat;
    let construcoes = 0;
    Intl.DateTimeFormat = function espiao(
      ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
    ) {
      construcoes++;
      return new original(...args);
    } as unknown as typeof Intl.DateTimeFormat;

    try {
      for (let i = 0; i < 500; i++) diaNoFuso(`2026-03-15T12:00:0${i % 10}.000Z`, FUSO_PADRAO);
      expect(
        construcoes,
        `500 chamadas construíram ${construcoes} formatadores — deveria ser 1`,
      ).toBeLessThanOrEqual(1);
    } finally {
      Intl.DateTimeFormat = original;
    }
  });

  it("6131 chamadas (a janela real do dashboard) ficam num teto folgado", () => {
    const N = 6131;
    const linhas = Array.from({ length: N }, (_, i) => {
      const dia = String((i % 28) + 1).padStart(2, "0");
      return `2026-03-${dia}T12:00:00.000Z`;
    });

    const inicio = Date.now();
    let soma = 0;
    for (const iso of linhas) soma += diaNoFuso(iso, FUSO_PADRAO).length;
    const ms = Date.now() - inicio;

    expect(soma).toBeGreaterThan(0);
    // Medido local: 274 ms sem memo, 5 ms com. Folgado de propósito: quem
    // segura o defeito é a contagem de construções acima; este é o alarme
    // grosso de ordem de grandeza.
    expect(ms, `${N} chamadas em ${ms} ms`).toBeLessThan(2000);
  });
});
