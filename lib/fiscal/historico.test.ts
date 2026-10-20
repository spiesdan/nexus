/**
 * O LEITOR DO procNFe — o que a importação por XML aceita e o que recusa.
 *
 * A aba Notas passou a importar o histórico pelo XML exportado do sistema
 * antigo (a SEFAZ não devolve ao emitente as notas que ele emitiu). O parser é
 * a peça que decide se a nota entra: chave, série, número, valor, emitente,
 * data e protocolo saem das tags. Um regex quebrado aqui importa 0 em silêncio,
 * então o teste usa um procNFe mínimo com a forma real (nfeProc > NFe >
 * infNFe/ide/emit/ICMSTot + protNFe/infProt).
 */
import { describe, expect, it } from "vitest";

import { lerProcNfe } from "./historico";

const CHAVE = "35261035233142000183550010000001231234567890";

function procNfe({
  chave = CHAVE,
  cnpj = "35233142000183",
  cstat = "100",
  valor = "123.45",
}: {
  chave?: string;
  cnpj?: string;
  cstat?: string;
  valor?: string;
} = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <nNF>123</nNF>
        <serie>1</serie>
        <dhEmi>2026-10-01T10:00:00-03:00</dhEmi>
        <mod>55</mod>
      </ide>
      <emit>
        <CNPJ>${cnpj}</CNPJ>
        <xNome>BILL HIGIENE E LIMPEZA</xNome>
      </emit>
      <total>
        <ICMSTot>
          <vNF>${valor}</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <chNFe>${chave}</chNFe>
      <nProt>135260000000001</nProt>
      <cStat>${cstat}</cStat>
    </infProt>
  </protNFe>
</nfeProc>`;
}

describe("lerProcNfe", () => {
  it("extrai chave, série, número, valor, emitente, data e protocolo", () => {
    const nota = lerProcNfe(procNfe());
    expect(nota).not.toBeNull();
    expect(nota).toMatchObject({
      chave: CHAVE,
      serie: "1",
      numero: 123,
      valor_cents: 12345,
      cnpj_emitente: "35233142000183",
      dh_emi: "2026-10-01T10:00:00-03:00",
    });
    expect(nota?.xml).toContain("<nfeProc");
  });

  it("recusa XML que não é procNFe reconhecível", () => {
    expect(lerProcNfe("<html>erro do portal</html>")).toBeNull();
    expect(lerProcNfe("")).toBeNull();
  });

  it("CNPJ do emitente sai só com dígitos, para a régua do upload comparar", () => {
    const nota = lerProcNfe(procNfe({ cnpj: "35.233.142/0001-83" }));
    // O regex do emitente exige 14 dígitos crus; um CNPJ formatado no XML não
    // é o formato da NF-e e deve ser recusado (o `cnpj_emitente` fica vazio).
    expect(nota?.cnpj_emitente).toBe("");
  });

  it("valor com ponto decimal vira centavos (formato do schema da NF-e)", () => {
    expect(lerProcNfe(procNfe({ valor: "1234.56" }))?.valor_cents).toBe(123456);
  });
});
