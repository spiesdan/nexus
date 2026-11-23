import { describe, expect, it } from "vitest";

// @ts-expect-error — módulo ESM do script, sem declaração TS
import { dentroDaJanela, payloadDeImportacao, registroValido, situacaoPresenca } from "../../scripts/mercos-reconciliar-logica.mjs";

const registro = {
  numero: 19669,
  cliente: { razao: "Cliente Mercos", documento: "123", fantasia: "Fantasia" },
  status_detalhe: "aprovado",
  total_cents: 1000,
  soma_itens_cents: 1000,
  itens: [{ codigo: "A", descricao: "Item A", quantidade: 1, subtotal: "1.000,00" }],
};

describe("reconciliação Mercos", () => {
  it("payload preserva o número do Mercos e os itens", () => {
    const p = payloadDeImportacao(registro);
    expect(p.numero).toBe(19669);
    expect(p.cliente_nome).toBe("Cliente Mercos");
    expect(p.itens).toHaveLength(1);
  });

  it("registro incompleto é falha de leitura, não ausência", () => {
    expect(registroValido(registro)).toBe(true);
    expect(registroValido({ ...registro, cliente: null })).toBe(false);
    expect(registroValido({ ...registro, itens: [] })).toBe(false);
    expect(registroValido({ ...registro, numero: 0 })).toBe(false);
  });

  it("presença no banco decide a situação", () => {
    expect(situacaoPresenca(true)).toBe("importado");
    expect(situacaoPresenca(false)).toBe("ausente");
  });
});

describe("janela de garantia da reconciliação", () => {
  const agora = Date.parse("2026-11-20T12:00:00Z");
  it("30 dias: 17/11 entra, 17/10 fica de fora (e é declarado)", () => {
    expect(dentroDaJanela({ data_emissao: "2026-11-17T10:00:00Z" }, agora)).toBe(true);
    expect(dentroDaJanela({ data_emissao: "2026-10-17T10:00:00Z" }, agora)).toBe(false);
  });

  it("sem data de emissão não entra na garantia", () => {
    expect(dentroDaJanela({ data_emissao: null }, agora)).toBe(false);
    expect(dentroDaJanela({}, agora)).toBe(false);
  });

  it("janela configurável, padrão 30", () => {
    const r = { data_emissao: "2026-09-25T10:00:00Z" };
    expect(dentroDaJanela(r, agora, 30)).toBe(false);
    expect(dentroDaJanela(r, agora, 60)).toBe(true);
  });
});
