import { describe, expect, it } from "vitest";

import { lerJsonSiscomex } from "@/lib/fiscal/ncm-siscomex";

/**
 * RECORTE REAL do arquivo do Siscomex (12/10/2026, Res. Gecex 926/2026).
 *
 * Não é um JSON inventado: os códigos, os níveis e os textos são os que o
 * portal devolveu. A hierarquia é IRREGULAR de propósito — o `0102.29.1` tem 7
 * dígitos e o pai real é o de 6 (`0102.29`), o que quebra a remontagem de
 * passo fixo.
 */
const RECORTE = JSON.stringify({
  Data_Ultima_Atualizacao_NCM: "Vigente em 12/10/2026",
  Ato: "Resolução Gecex nº 926/2026",
  Nomenclaturas: [
    { Codigo: "28", Descricao: "Produtos químicos inorgânicos; compostos inorgânicos ou orgânicos de metais preciosos." },
    { Codigo: "2828", Descricao: "Hipocloritos; hipoclorito de cálcio comercial; cloritos; hipobromitos." },
    { Codigo: "282890", Descricao: "- Outros" },
    {
      Codigo: "28289011",
      Descricao: "- De sódio",
      Data_Inicio: "01/04/2022",
      Data_Fim: "31/12/9999",
    },
    { Codigo: "01", Descricao: "Animais vivos." },
    { Codigo: "0102", Descricao: "Bovinos." },
    { Codigo: "010229", Descricao: "- Outros" },
    { Codigo: "0102.29.1", Descricao: "-- Para reprodução" },
    {
      Codigo: "01022910",
      Descricao: "- De dupla função",
      Data_Inicio: "01/04/2022",
      Data_Fim: "31/12/9999",
    },
  ],
});

describe("lerJsonSiscomex", () => {
  it("remonta a descrição subindo a hierarquia", () => {
    // O defeito que este arquivo existe para resolver: o item vem sozinho
    // ("De sódio") e, jogado na tabela, não casaria com "ÁGUA SANITARIA".
    const r = lerJsonSiscomex(RECORTE);
    const linha = r.linhas.find((l) => l.codigo === "28289011");
    expect(linha?.descricao).toContain("Hipocloritos");
    expect(linha?.descricao).toContain("De sódio");
  });

  it("trata a hierarquia irregular de 7 dígitos (subitem)", () => {
    // De `01022910` o pai por passo fixo seria `0102291` (o próprio subitem, que
    // existe!) e o avô `010229`. Se sondar só de dois em dois, o subitem entra
    // na descrição — que é correto e desejado. O que NÃO pode é sumir com o
    // "Bovinos", dois níveis acima.
    const r = lerJsonSiscomex(RECORTE);
    const linha = r.linhas.find((l) => l.codigo === "01022910");
    expect(linha?.descricao).toContain("Bovinos");
    expect(linha?.descricao).toContain("Para reprodução");
    expect(linha?.descricao).toContain("De dupla função");
  });

  it("mantém só o item de 8 dígitos", () => {
    const r = lerJsonSiscomex(RECORTE);
    expect(r.linhas.map((l) => l.codigo).sort()).toEqual(["01022910", "28289011"]);
    // 28, 2828, 282890, 01, 0102, 010229 e 0102.29.1 são nível acima do item.
    expect(r.ignoradas).toBe(7);
  });

  it("limpa os travessões de nível do Siscomex", () => {
    const r = lerJsonSiscomex(RECORTE);
    for (const l of r.linhas) expect(l.descricao).not.toMatch(/-( |\s)/);
  });

  it("tira os pontos do código", () => {
    const r = lerJsonSiscomex(RECORTE);
    for (const l of r.linhas) expect(l.codigo).toMatch(/^\d{8}$/);
  });

  it("converte as datas e trata 31/12/9999 como sem fim", () => {
    const r = lerJsonSiscomex(RECORTE);
    const linha = r.linhas.find((l) => l.codigo === "28289011");
    expect(linha?.vigencia_inicio).toBe("2022-04-01");
    // 9999 não é uma data: gravá-la faria a linha nunca ser considerada vigente.
    expect(linha?.vigencia_fim).toBeNull();
  });

  it("leva o ato e a data de atualização para o relatório", () => {
    const r = lerJsonSiscomex(RECORTE);
    expect(r.ato).toContain("926/2026");
    expect(r.atualizacao).toContain("12/10/2026");
  });
});

describe("recusa em vez de devolver zero linhas", () => {
  // A fonte pode responder HTML de portal, 403 ou `{}`. Cada um desses viraria
  // "0 importadas" — que o operador lê como sucesso e acredita que a tabela
  // está vazia por escolha.
  it("HTML de portal", () => {
    const r = lerJsonSiscomex("<!DOCTYPE html><html>erro</html>");
    expect(r.valido).toBe(false);
    expect(r.erro).toBeTruthy();
  });

  it("JSON sem Nomenclaturas", () => {
    const r = lerJsonSiscomex('{"message":"Unauthorized"}');
    expect(r.valido).toBe(false);
    expect(r.erro).toBeTruthy();
  });

  it("lista vazia", () => {
    const r = lerJsonSiscomex('{"Nomenclaturas":[]}');
    expect(r.valido).toBe(false);
    expect(r.erro).toBeTruthy();
  });

  it("texto vazio", () => {
    expect(lerJsonSiscomex("").valido).toBe(false);
  });
});
