import { describe, expect, it } from "vitest";

import {
  agruparDoDia,
  chaveDeAmanha,
  chaveDeData,
  dataPorExtenso,
  horaDe,
  limitesDeHojeEAmanha,
  limitesDoDia,
  saudacaoDoDia,
  type CompromissoDoDia,
  type TarefaDoDia,
} from "./dia";

/**
 * Sexta-feira 2026-10-02, 09:30 no fuso de quem olha. Todos os Date abaixo
 * são montados em tempo LOCAL de propósito: as comparações do agrupamento são
 * locais, então o teste tem de ser local também — se um dia ele fosse
 * construído em UTC, o teste passaria em UTC e falharia no fuso do cliente.
 */
const AGORA = new Date(2026, 9, 2, 9, 30);

const t = (id: string, data: string | null): TarefaDoDia => ({
  id,
  titulo: `Tarefa ${id}`,
  contato: null,
  agendada_para: data,
});

const c = (id: string, em: Date, situacao = "confirmed"): CompromissoDoDia => ({
  id,
  titulo: `Compromisso ${id}`,
  contato: null,
  iniciaEm: em.toISOString(),
  situacao,
});

const ids = (itens: { id: string }[]): string[] => itens.map((i) => i.id);

describe("chaveDeData / horaDe", () => {
  it("usa o relógio LOCAL, não o UTC (toISOString aqui engolia o dia)", () => {
    expect(chaveDeData(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(chaveDeData(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("hora local com dois dígitos", () => {
    expect(horaDe(new Date(2026, 9, 2, 8, 5))).toBe("08:05");
    expect(horaDe(new Date(2026, 9, 2, 23, 0))).toBe("23:00");
  });

  it("chaveDeAmanha é a data local seguinte (véspera de virada de mês/ano)", () => {
    expect(chaveDeAmanha(new Date(2026, 9, 2, 23, 59))).toBe("2026-10-03");
    expect(chaveDeAmanha(new Date(2026, 11, 31, 0, 1))).toBe("2027-01-01");
  });
});

describe("agruparDoDia", () => {
  it("separa os quatro grupos por data local", () => {
    const linha = agruparDoDia({
      agora: AGORA,
      tarefas: [
        t("atr", "2026-10-01"),
        t("hoje", "2026-10-02"),
        t("amanha", "2026-10-03"),
        t("depois", "2026-10-10"),
        t("semdata", null),
      ],
      compromissos: [],
    });
    expect(ids(linha.atrasado)).toEqual(["atr"]);
    expect(ids(linha.hoje)).toEqual(["hoje"]);
    expect(ids(linha.amanha)).toEqual(["amanha"]);
    expect(linha.depois).toHaveLength(2);
    expect(ids(linha.depois)).toContain("depois");
    expect(ids(linha.depois)).toContain("semdata");
    expect(linha.atrasado[0]).toMatchObject({ kind: "tarefa", atrasada: true });
    expect(linha.hoje[0]).toMatchObject({ kind: "tarefa", atrasada: false });
  });

  it("em Hoje: compromissos por hora crescente ANTES das tarefas sem hora", () => {
    const linha = agruparDoDia({
      agora: AGORA,
      tarefas: [t("tar", "2026-10-02")],
      compromissos: [
        c("tarde", new Date(2026, 9, 2, 15, 0)),
        c("cedo", new Date(2026, 9, 2, 10, 0)),
      ],
    });
    expect(ids(linha.hoje)).toEqual(["cedo", "tarde", "tar"]);
    expect(linha.hoje[0]).toMatchObject({ kind: "compromisso", hora: "10:00" });
  });

  it("compromisso cancelado não aparece; perdido vira atrasado", () => {
    const linha = agruparDoDia({
      agora: AGORA,
      tarefas: [],
      compromissos: [
        c("ok", new Date(2026, 9, 2, 14, 0)),
        c("cancelado", new Date(2026, 9, 2, 16, 0), "cancelled"),
        c("perdido", new Date(2026, 9, 1, 11, 0)),
      ],
    });
    expect(ids(linha.hoje)).toEqual(["ok"]);
    expect(ids(linha.atrasado)).toEqual(["perdido"]);
  });

  it("agendamento de ontem e de depois de amanhã caem no lugar certo", () => {
    const linha = agruparDoDia({
      agora: AGORA,
      tarefas: [],
      compromissos: [
        c("ontem", new Date(2026, 9, 1, 23, 30)),
        c("futuro", new Date(2026, 9, 5, 9, 0)),
      ],
    });
    expect(ids(linha.atrasado)).toEqual(["ontem"]);
    expect(ids(linha.depois)).toEqual(["futuro"]);
  });

  it("atrasados em ordem cronológica da mais velha para a mais nova", () => {
    const linha = agruparDoDia({
      agora: AGORA,
      tarefas: [t("novo", "2026-10-01"), t("velho", "2026-09-20")],
      compromissos: [],
    });
    expect(ids(linha.atrasado)).toEqual(["velho", "novo"]);
  });

  it("compromisso inválido (data lixo) é ignorado, não derruba a tela", () => {
    const linha = agruparDoDia({
      agora: AGORA,
      tarefas: [],
      compromissos: [
        {
          id: "lixo",
          titulo: "Lixo",
          contato: null,
          iniciaEm: "não é data",
          situacao: "confirmed",
        },
      ],
    });
    expect(linha.hoje).toEqual([]);
    expect(linha.atrasado).toEqual([]);
  });
});

describe("saudacaoDoDia", () => {
  it("muda no meio-dia e às 18h (cortes de apresentação)", () => {
    expect(saudacaoDoDia(new Date(2026, 9, 2, 0, 0))).toBe("Bom dia");
    expect(saudacaoDoDia(new Date(2026, 9, 2, 11, 59))).toBe("Bom dia");
    expect(saudacaoDoDia(new Date(2026, 9, 2, 12, 0))).toBe("Boa tarde");
    expect(saudacaoDoDia(new Date(2026, 9, 2, 17, 59))).toBe("Boa tarde");
    expect(saudacaoDoDia(new Date(2026, 9, 2, 18, 0))).toBe("Boa noite");
  });
});

describe("dataPorExtenso", () => {
  it("data por extenso em pt-BR", () => {
    expect(dataPorExtenso(new Date(2026, 9, 2), "pt-BR")).toBe("sexta-feira, 2 de outubro");
  });
});

describe("limitesDoDia / limitesDeHojeEAmanha", () => {
  it("dia inteiro: meia-noite local de hoje até meia-noite de amanhã", () => {
    const { de, ate } = limitesDoDia(AGORA);
    expect(de).toBe(new Date(2026, 9, 2, 0, 0).toISOString());
    expect(ate).toBe(new Date(2026, 9, 3, 0, 0).toISOString());
  });

  it("janela da linha do tempo: hoje + amanhã inteiros, em instante ISO", () => {
    const { de, ate } = limitesDeHojeEAmanha(AGORA);
    expect(de).toBe(new Date(2026, 9, 2, 0, 0).toISOString());
    expect(ate).toBe(new Date(2026, 9, 4, 0, 0).toISOString());
  });
});
