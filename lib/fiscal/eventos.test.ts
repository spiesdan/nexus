import { afterEach, describe, expect, it } from "vitest";

import {
  lerMensagemCarta,
  motivoDeNaoBaixar,
  motivoDeNaoTransmitir,
  montarMensagemCarta,
} from "./eventos";
import type { ContextoSped } from "./sped-payload";

function contexto(
  emitente: Partial<ContextoSped["emitente"]> = {},
  senha: string | null = "senha",
): ContextoSped {
  return {
    emitente: {
      serie: "1",
      natureza_operacao: "Venda",
      cfop_padrao: "5102",
      emitente_documento: "35233142000183",
      ie: "123456789",
      crt: "3",
      logradouro: null,
      numero_end: null,
      bairro: null,
      municipio: null,
      codigo_municipio: null,
      uf: "SP",
      cep: null,
      ambiente: "homologacao",
      certificado_path: "/certs/empresa.pfx",
      provedor: "spednfe",
      ...emitente,
    },
    orgId: "4bc721ce-157a-41b9-97ae-ba633650859c",
    senhaCertificado: senha,
  };
}

const ambienteOriginal = {
  url: process.env.FISCAL_SIDECAR_URL,
  secret: process.env.FISCAL_SIDECAR_SECRET,
};

afterEach(() => {
  if (ambienteOriginal.url === undefined) delete process.env.FISCAL_SIDECAR_URL;
  else process.env.FISCAL_SIDECAR_URL = ambienteOriginal.url;
  if (ambienteOriginal.secret === undefined) delete process.env.FISCAL_SIDECAR_SECRET;
  else process.env.FISCAL_SIDECAR_SECRET = ambienteOriginal.secret;
});

describe("mensagem da carta de correção", () => {
  it("o round-tripo preserva sequência, correção e motivo", () => {
    const correcao = "O CFOP do item 2 estava 5102 e passa a ser 6102.";
    const mensagem = montarMensagemCarta(3, correcao, "SEFAZ [204]: rejeitada");
    const lida = lerMensagemCarta(mensagem);

    expect(lida).toEqual({ sequencia: 3, correcao, motivo: "SEFAZ [204]: rejeitada" });
  });

  it("sem motivo, a correção volta inteira — retransmitir não pode encurtar o texto", () => {
    const correcao = "CNPJ do destinatário incorreto: 11.222.333/0001-81.";
    const lida = lerMensagemCarta(montarMensagemCarta(1, correcao));

    expect(lida).toEqual({ sequencia: 1, correcao, motivo: null });
  });

  it("mensagem malformada não vira carta (nada de sequência inventada)", () => {
    expect(lerMensagemCarta("texto solto sem marcador")).toBeNull();
    expect(lerMensagemCarta("[0/20] sequência zero")).toBeNull();
    expect(lerMensagemCarta("")).toBeNull();
  });
});

describe("motivoDeNaoTransmitir — o portão honesto", () => {
  it("passa quando provedor, env e certificado estão todos de pé", () => {
    process.env.FISCAL_SIDECAR_URL = "http://sidecar:8080";
    process.env.FISCAL_SIDECAR_SECRET = "segredo";
    expect(motivoDeNaoTransmitir(contexto())).toBeNull();
  });

  it("stub não transmite nada — nem evento, nem histórico", () => {
    process.env.FISCAL_SIDECAR_URL = "http://sidecar:8080";
    process.env.FISCAL_SIDECAR_SECRET = "segredo";
    const motivo = motivoDeNaoTransmitir(contexto({ provedor: "stub" }));
    expect(motivo).toMatch(/stub/);
  });

  it("sem env do sidecar o motivo nomeia as variáveis que faltam", () => {
    delete process.env.FISCAL_SIDECAR_URL;
    delete process.env.FISCAL_SIDECAR_SECRET;
    const motivo = motivoDeNaoTransmitir(contexto());
    expect(motivo).toMatch(/FISCAL_SIDECAR_URL\/SECRET/);
  });

  it("sem certificado ou sem senha, não sai do chão", () => {
    process.env.FISCAL_SIDECAR_URL = "http://sidecar:8080";
    process.env.FISCAL_SIDECAR_SECRET = "segredo";
    expect(motivoDeNaoTransmitir(contexto({ certificado_path: null }))).toMatch(/Certificado/);
    expect(motivoDeNaoTransmitir(contexto({}, null))).toMatch(/Senha/);
  });

  it("configuração fiscal incompleta (CNPJ/IE/UF) é bloqueio, não silêncio", () => {
    process.env.FISCAL_SIDECAR_URL = "http://sidecar:8080";
    process.env.FISCAL_SIDECAR_SECRET = "segredo";
    expect(motivoDeNaoTransmitir(contexto({ emitente_documento: null }))).toMatch(/CNPJ/);
    expect(motivoDeNaoTransmitir(contexto({ ie: null }))).toMatch(/Inscrição/);
    expect(motivoDeNaoTransmitir(contexto({ uf: null }))).toMatch(/UF/);
  });

  describe("motivoDeNaoBaixar — baixar não é transmitir", () => {
    it("stub com certificado e CNPJ baixa: provedor não entra na chamada", () => {
      // O caso que o portão antigo barrava: a instalação real tinha
      // certificado + senha, provedor `stub`, e o botão respondia 502
      // mandando "configurar o sidecar" — que já estava no ar.
      expect(motivoDeNaoBaixar(contexto({ provedor: "stub" }))).toBeNull();
    });

    it("sem CNPJ não há de quem trazer — e a mensagem diz isso", () => {
      const motivo = motivoDeNaoBaixar(contexto({ emitente_documento: null }));
      expect(motivo).toMatch(/CNPJ/);
      // E NÃO aponta para o provedor: foi esse o erro do 502 antigo.
      expect(motivo).not.toMatch(/provedor|sidecar/i);
    });

    it("CNPJ malformado é o mesmo que ausente", () => {
      // 13 dígitos passam num `if (cnpj)` e reprovam na SEFAZ. A forma do bug
      // é sempre a mesma: o dado existe e não é verdade.
      expect(motivoDeNaoBaixar(contexto({ emitente_documento: "123" }))).toMatch(/CNPJ/);
    });

    it("sem certificado ou sem senha, não sai do chão", () => {
      expect(motivoDeNaoBaixar(contexto({ certificado_path: null }))).toMatch(/Certificado/);
      expect(motivoDeNaoBaixar(contexto({}, null))).toMatch(/Senha/);
    });

    it("IE e endereço ausentes NÃO barram o download — mas UF sim", () => {
      // IE, município e endereço: o download não usa, então não barra.
      expect(
        motivoDeNaoBaixar(contexto({ ie: null, codigo_municipio: null, municipio: null })),
      ).toBeNull();
      // UF: o schema do sped-nfe exige `siglaUF` com 2 letras. Sem ela o
      // sidecar reprova o config — e o portão do app diz isso em português.
      expect(motivoDeNaoBaixar(contexto({ uf: null }))).toMatch(/UF/);
      expect(motivoDeNaoBaixar(contexto({ uf: "S" }))).toMatch(/UF/);
    });
  });
});
