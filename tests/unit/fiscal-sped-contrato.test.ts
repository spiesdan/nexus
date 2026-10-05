import { describe, expect, it } from "vitest";

import { resolverProvedor } from "@/lib/fiscal/provedor";
import { montarPayloadSped, type EmitenteSped, type ItemSped } from "@/lib/fiscal/sped-payload";
import { extrasFiscaisSchema, type ExtrasFiscais } from "@/lib/schemas/fiscal";

/**
 * O CONTRATO SPED — cerca do ATT.txt F3 (fiscal via sidecar).
 *
 * Imposto presumido é crime fiscal: o que falta volta nomeando o campo.
 */
const EMITENTE: EmitenteSped = {
  serie: "1",
  natureza_operacao: "Venda",
  cfop_padrao: "5102",
  emitente_documento: "12345678000190",
  ie: "123456789",
  crt: "1",
  logradouro: "Rua A",
  numero_end: "100",
  bairro: "Centro",
  municipio: "São Paulo",
  codigo_municipio: "3550308",
  uf: "SP",
  cep: "01001000",
  ambiente: "homologacao",
  certificado_path: "/certs/empresa.pfx",
};

const ITEM: ItemSped = {
  codigo: "AG-5L",
  descricao: "Água Sanitária",
  ncm: "28289011",
  cfop: null,
  unidade: null,
  quantidade: 2,
  preco_cents: 5000,
  desconto_pct: 0,
};

const PEDIDO = { numero: 1, nome: "Mercado", documento: null, frete_cents: 0 };

describe("montarPayloadSped", () => {
  it("monta quando está tudo presente", () => {
    const r = montarPayloadSped(EMITENTE, "senha", PEDIDO, [ITEM]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.certificado_arquivo).toBe("/certs/empresa.pfx");
      expect((r.payload.itens[0] as { unidade: string }).unidade).toBe("UN");
    }
  });

  it("nomeia o NCM ausente em vez de presumir", () => {
    const r = montarPayloadSped(EMITENTE, "senha", PEDIDO, [{ ...ITEM, ncm: null }]);
    expect(r).toEqual({ ok: false, falta: 'NCM do produto "Água Sanitária"' });
  });

  it("nomeia cada ausência na ordem de dependência", () => {
    expect(montarPayloadSped({ ...EMITENTE, emitente_documento: null }, "s", PEDIDO, [ITEM])).toEqual({
      ok: false,
      falta: "CNPJ do emitente (configuração fiscal)",
    });
    expect(montarPayloadSped({ ...EMITENTE, codigo_municipio: null }, "s", PEDIDO, [ITEM])).toEqual({
      ok: false,
      falta: "Código IBGE do município (configuração fiscal)",
    });
    expect(montarPayloadSped(EMITENTE, "", PEDIDO, [ITEM])).toEqual({
      ok: false,
      falta: "Senha do certificado",
    });
    expect(montarPayloadSped(EMITENTE, "s", PEDIDO, [])).toEqual({
      ok: false,
      falta: "Ao menos 1 item",
    });
  });

  it("nomeia o CPF/CNPJ que falta quando o endereço de entrega é enviado", () => {
    const entrega = {
      logradouro: "Av. Central",
      numero: "500",
      bairro: "Centro",
      municipio: "São Paulo",
      codigo_municipio: "3550308",
      uf: "SP",
      cep: "01001000",
    };
    const semDocumento = montarPayloadSped(EMITENTE, "senha", PEDIDO, [ITEM], { entrega });
    expect(semDocumento).toEqual({
      ok: false,
      falta: "CPF/CNPJ do destinatário para o local de entrega",
    });

    const comDocumento = montarPayloadSped(
      EMITENTE,
      "senha",
      { ...PEDIDO, documento: "12987654000100" },
      [ITEM],
      { entrega },
    );
    expect(comDocumento.ok).toBe(true);
    if (comDocumento.ok) {
      expect(comDocumento.payload.extras).toEqual({ entrega });
    }
  });

  it("sem extras deixa extras null — o sidecar usa o padrão", () => {
    const r = montarPayloadSped(EMITENTE, "senha", PEDIDO, [ITEM]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.extras).toBeNull();
  });
});

describe("extrasFiscaisSchema", () => {
  const EXTRAS: ExtrasFiscais = {
    transporte: {
      modalidade_frete: "9",
      transportador: {
        nome: "Transportes X",
        documento: "12345678000190",
        ie: "123456789",
        endereco: "Rua B, 200",
        municipio: "São Paulo",
        uf: "SP",
      },
      volumes: { quantidade: 2, especie: "CAIXAS", peso_liquido_kg: 12.5, peso_bruto_kg: 13 },
    },
    cobranca: {
      forma_pagamento: "15",
      descricao: "Boleto bancário",
      parcelas: 3,
      primeiro_vencimento: "2026-10-20",
      dias_entre: 30,
    },
    adicionais: { informacoes_complementares: "Pedido 456", informacoes_fisco: "" },
    entrega: {
      logradouro: "Av. Central",
      numero: "500",
      bairro: "Centro",
      municipio: "São Paulo",
      codigo_municipio: "3550308",
      uf: "SP",
      cep: "01001000",
    },
  };

  it("aceita os quatro grupos e repassa sem transformar", () => {
    const r = extrasFiscaisSchema.safeParse(EXTRAS);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(EXTRAS);
  });

  it("modalidade de frete default é 9 (sem transportador)", () => {
    const r = extrasFiscaisSchema.safeParse({ transporte: {} });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.transporte?.modalidade_frete).toBe("9");
  });

  const recusa = (valor: unknown, campo: string) => {
    const r = extrasFiscaisSchema.safeParse(valor);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path.join(".")).toBe(campo);
  };

  it("nomeia o campo fora do leiaute", () => {
    recusa({ transporte: { modalidade_frete: "7" } }, "transporte.modalidade_frete");
    recusa({ cobranca: { forma_pagamento: "00" } }, "cobranca.forma_pagamento");
    recusa(
      { transporte: { transportador: { nome: "Transportes X", documento: "123456789012" } } },
      "transporte.transportador.documento",
    );
    recusa({ entrega: { logradouro: "Rua A", bairro: "Centro", municipio: "SP", uf: "SP", cep: "01001000" } }, "entrega.numero");
    recusa({ adicionais: { informacoes_complementares: "x".repeat(5001) } }, "adicionais.informacoes_complementares");
    recusa({ transporte: { volumes: { quantidade: 0 } } }, "transporte.volumes.quantidade");
  });

  it("parcelas a prazo exigem 1º vencimento e dias entre parcelas", () => {
    recusa(
      { cobranca: { forma_pagamento: "15", parcelas: 3, dias_entre: 30 } },
      "cobranca.primeiro_vencimento",
    );
    recusa(
      { cobranca: { forma_pagamento: "15", parcelas: 3, primeiro_vencimento: "2026-10-20" } },
      "cobranca.dias_entre",
    );
    recusa(
      {
        cobranca: {
          forma_pagamento: "15",
          parcelas: 3,
          primeiro_vencimento: "2026-10-20",
          dias_entre: 400,
        },
      },
      "cobranca.dias_entre",
    );
    recusa({ cobranca: { forma_pagamento: "15", parcelas: 121 } }, "cobranca.parcelas");
  });

  it("tPag 99 exige descrição — mas cartão não pede tpIntegra", () => {
    recusa({ cobranca: { forma_pagamento: "99", parcelas: 1, dias_entre: 0 } }, "cobranca.descricao");
    // descrição vazia não é "sem descrição": min(2) recusa antes do Zod chegar no superRefine
    recusa({ cobranca: { forma_pagamento: "03", descricao: "", parcelas: 1, dias_entre: 0 } }, "cobranca.descricao");
    const r = extrasFiscaisSchema.safeParse({
      cobranca: { forma_pagamento: "03", parcelas: 1, dias_entre: 0 },
    });
    expect(r.success).toBe(true);
  });
});

describe("resolverProvedor", () => {
  it("default é stub, mesmo com sidecar no ar", () => {
    process.env.FISCAL_SIDECAR_URL = "http://fiscal:8080";
    process.env.FISCAL_SIDECAR_SECRET = "x";
    expect(resolverProvedor({ provedor: "stub" })).toBe("stub");
    expect(resolverProvedor({ provedor: null })).toBe("stub");
    delete process.env.FISCAL_SIDECAR_URL;
    delete process.env.FISCAL_SIDECAR_SECRET;
  });

  it("spednfe sem sidecar cai no stub — nunca em emissão pela metade", () => {
    delete process.env.FISCAL_SIDECAR_URL;
    delete process.env.FISCAL_SIDECAR_SECRET;
    expect(resolverProvedor({ provedor: "spednfe" })).toBe("stub");
  });

  it("spednfe com config + sidecar vai ao sidecar", () => {
    process.env.FISCAL_SIDECAR_URL = "http://fiscal:8080";
    process.env.FISCAL_SIDECAR_SECRET = "x";
    expect(resolverProvedor({ provedor: "spednfe" })).toBe("spednfe");
    delete process.env.FISCAL_SIDECAR_URL;
    delete process.env.FISCAL_SIDECAR_SECRET;
  });
});
