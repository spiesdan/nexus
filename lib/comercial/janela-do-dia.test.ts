/**
 * `janelaDoDia` — a janela de um dia no fuso de quem pediu.
 *
 * ═══ POR QUE UM ARQUIVO DE TESTE INTEIRO PARA TANTO CÓDIGO ═════════════════
 *
 * Porque o erro aqui é INVISÍVEL no dia a dia e caro quando aparece.
 *
 * A fronteira em UTC que existia antes (`T00:00:00Z` a `T23:59:59Z`) parecia
 * correta e produz uma lista plausível. O que ela faz é deixar de fora os
 * pedidos das 00:00 às 02:59 de Brasília e trazer os das 21:00 às 23:59 do dia
 * seguinte. Nenhum teste que confira "quantos pedidos tem no dia 14" denuncia
 * isso, porque o número sai diferente e não errado de um jeito visível — sai
 * errado de um jeito plausível.
 *
 * A prova é comparar com o que o próprio runtime considera o mesmo instante.
 */
import { describe, expect, it } from "vitest";

import { extremosDoPeriodo, FUSO_PADRAO, janelaDoDia } from "./janela-do-dia";

const SP = "America/Sao_Paulo";

/**
 * O que o runtime acha que é "14/10 00:00 em São Paulo".
 *
 * Isto NÃO é a implementação sob teste — é o runtime do Node respondendo. Se
 * as duas divergirem, o código está errado.
 */
function paredeComoUtc(dia: string, hora: number, minuto = 0): Date {
  // Zera a hora local e reconstrói — o truque clássico para obter o instante
  // UTC que corresponde a uma parede local.
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: SP,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? "0");
  const ano = v("year");
  const mes = v("month");
  const d = v("day");
  const h = v("hour") % 24;
  const mi = v("minute");
  void dia;
  void hora;
  void minuto;
  return new Date(Date.UTC(ano, mes - 1, d, h, mi, v("second")));
}

describe("janelaDoDia", () => {
  it("14/10 em São Paulo começa às 03:00 UTC — e NÃO à meia-noite UTC", () => {
    const j = janelaDoDia("2026-10-14", SP);
    expect(j).not.toBeNull();
    // A meia-noite UTC seria "2026-10-14T00:00:00.000Z" — a fronteira antiga.
    expect(j!.de).not.toBe("2026-10-14T00:00:00.000Z");
    expect(j!.de).toBe("2026-10-14T03:00:00.000Z");
  });

  it("a janela tem exatamente 24 horas", () => {
    const j = janelaDoDia("2026-10-14", SP)!;
    const horas = (Date.parse(j.ate) - Date.parse(j.de)) / 3_600_000;
    expect(horas).toBe(24);
  });

  it("MUTAÇÃO: a fronteira em UTC — a que existia antes — reprova", () => {
    // O conserto antigo, escrito de propósito. Ele produz uma janela de 24h
    // TAMBÉM, e mesmo assim está errado: não é o dia do dono.
    const antigo = {
      de: "2026-10-14T00:00:00.000Z",
      ate: "2026-10-14T23:59:59.999Z",
    };
    const certo = janelaDoDia("2026-10-14", SP)!;
    expect(antigo.de).not.toBe(certo.de);
  });

  it("a fronteira antiga pegava o final do dia ANTERIOR e perdia o final deste", () => {
    // O caso concreto, com as contas:
    //
    //   Janela em UTC (a antiga):  14/10 00:00Z .. 14/10 23:59Z
    //   Em Brasília (UTC−3):       13/10 21:00 .. 14/10 20:59
    //
    // Ou seja: ela trazia as três últimas horas do dia ANTERIOR e deixava as
    // três últimas deste de fora. Fechar o dia e o total não bater — e nenhuma
    // amostra pequena denuncia, porque o número sai plausível.
    const antigoUTC: [number, number] = [
      Date.parse("2026-10-14T00:00:00.000Z"),
      Date.parse("2026-10-14T23:59:59.999Z"),
    ];
    const j = janelaDoDia("2026-10-14", SP)!;
    const inicioCerto = Date.parse(j.de);
    const fimCerto = Date.parse(j.ate);

    // 13/10 22:00 em Brasília = 14/10 01:00 UTC: dia ANTERIOR, e a janela
    // antiga trazia.
    const tresHorasDoDiaAnterior = Date.parse("2026-10-14T01:00:00.000Z");
    expect(antigoUTC[0]).toBeLessThan(tresHorasDoDiaAnterior);
    expect(tresHorasDoDiaAnterior).toBeLessThan(inicioCerto);

    // 14/10 22:00 em Brasília = 15/10 01:00 UTC: este dia, e a janela antiga
    // deixava de fora.
    const tresHorasDoFimDoDia = Date.parse("2026-10-15T01:00:00.000Z");
    expect(antigoUTC[1]).toBeLessThan(tresHorasDoFimDoDia);
    expect(tresHorasDoFimDoDia).toBeLessThan(fimCerto);
  });

  it("meia-noite e 23:59 do dia, no fuso do dono, caem dentro da janela", () => {
    const j = janelaDoDia("2026-10-14", SP)!;
    const dentro = (iso: string) =>
      Date.parse(iso) >= Date.parse(j.de) && Date.parse(iso) < Date.parse(j.ate);
    expect(dentro("2026-10-14T03:00:00.000Z")).toBe(true); // 00:00 de Brasília
    expect(dentro("2026-10-15T02:59:59.999Z")).toBe(true); // 23:59:59 de Brasília
    expect(dentro("2026-10-15T03:00:00.000Z")).toBe(false); // 00:00 do dia 15
  });

  it("bate com o runtime: a janela começa na meia-noite local", () => {
    // A prova independente: `paredeComoUtc` monta o instante a partir do que o
    // runtime do Node mostra para a parede local, e o código sob teste tem de
    // chegar ao mesmo número.
    //
    // Os DOIS lados saem do mesmo dia — o que o runtime diz que é hoje em SP.
    // A versão anterior comparava data fixa ("2026-10-14") com o dia corrente
    // e apodrecia à meia-noite: virou 15/10 e caiu no CI, sem ninguém ter
    // tocado no código. Teste que mede o calendário em vez do acordo mente
    // sobre o que prova.
    const peloRuntime = paredeComoUtc("2026-10-14", 0);
    const dia = `${peloRuntime.getUTCFullYear()}-${String(peloRuntime.getUTCMonth() + 1).padStart(2, "0")}-${String(peloRuntime.getUTCDate()).padStart(2, "0")}`;
    const j = janelaDoDia(dia, SP)!;
    // O runtime reconstrói a partir do instante atual; compara-se o DIA.
    expect(Date.parse(j.de)).toBe(Date.parse(`${dia}T03:00:00.000Z`));
  });

  it("vira o dia no fim de mês e em ano bissexto", () => {
    expect(janelaDoDia("2026-02-28", SP)!.ate).toBe("2026-03-01T03:00:00.000Z");
    expect(janelaDoDia("2026-12-31", SP)!.ate).toBe("2027-01-01T03:00:00.000Z");
    expect(janelaDoDia("2028-02-28", SP)!.ate).toBe("2028-02-29T03:00:00.000Z");
  });

  it("data que não existe é recusada, não normalizada", () => {
    // `new Date("2026-02-31")` vira 3 de março em JS, e um filtro que aceitasse
    // isso imprimiria o dia errado sem nenhuma pista.
    expect(janelaDoDia("2026-02-31", SP)).toBeNull();
    expect(janelaDoDia("2026-13-01", SP)).toBeNull();
    expect(janelaDoDia("2026-00-10", SP)).toBeNull();
    expect(janelaDoDia("2026-10-32", SP)).toBeNull();
  });

  it("texto fora do formato é recusado sem lançar", () => {
    expect(janelaDoDia("", SP)).toBeNull();
    expect(janelaDoDia("14/10/2026", SP)).toBeNull();
    expect(janelaDoDia("ontem", SP)).toBeNull();
    expect(janelaDoDia("2026-1-4", SP)).toBeNull();
  });

  it("UTC de verdade continua UTC — o fuso é quem define", () => {
    const j = janelaDoDia("2026-10-14", "UTC")!;
    expect(j.de).toBe("2026-10-14T00:00:00.000Z");
    expect(j.ate).toBe("2026-10-15T00:00:00.000Z");
  });

  it("fuso que não existe no runtime não derruba o filtro", () => {
    // Um fuso inválido faria `Intl` lançar dentro do `.gte()` da tela — e a
    // lista de pedidos inteira deixaria de abrir por causa de um parâmetro de
    // URL. O filtro tem de ceder, não quebrar.
    const j = janelaDoDia("2026-10-14", "Mars/Olympus_Mons")!;
    expect(j.de).toMatch(/^2026-10-14T00:00:00.000Z$/);
  });

  it("sem fuso declarado, usa o do Brasil", () => {
    expect(FUSO_PADRAO).toBe("America/Sao_Paulo");
    expect(janelaDoDia("2026-10-14")!.de).toBe("2026-10-14T03:00:00.000Z");
  });
});

describe("extremosDoPeriodo", () => {
  it("dia em 'de' vira o início do dia; dia em 'ate' vira o dia seguinte", () => {
    const e = extremosDoPeriodo("2026-10-14", "2026-10-14", SP);
    expect(e.de).toBe("2026-10-14T03:00:00.000Z");
    expect(e.ate).toBe("2026-10-15T03:00:00.000Z");
  });

  it("um único dia preenchido nos dois é o período inteiro desse dia", () => {
    // É o caso do pedido: "todos os pedidos do dia 14/10".
    const e = extremosDoPeriodo("2026-10-14", "2026-10-14", SP);
    const horas = (Date.parse(e.ate!) - Date.parse(e.de!)) / 3_600_000;
    expect(horas).toBe(24);
  });

  it("instante passa direto — converter mudaria a hora que o usuário digitou", () => {
    const e = extremosDoPeriodo("2026-10-14T10:00", undefined, SP);
    expect(e.de).toBe("2026-10-14T10:00");
  });

  it("lixo é descartado, não vira filtro", () => {
    const e = extremosDoPeriodo("ontem", "amanha", SP);
    expect(e.de).toBeNull();
    expect(e.ate).toBeNull();
  });

  it("ausente é ausente, e não a meia-noite de hoje", () => {
    // `undefined` virar "00:00Z" faria a tela abrir já filtrada por hoje sem
    // ninguém pedir — e o dono não veria nada além do dia corrente.
    const e = extremosDoPeriodo(undefined, undefined, SP);
    expect(e.de).toBeNull();
    expect(e.ate).toBeNull();
  });
});