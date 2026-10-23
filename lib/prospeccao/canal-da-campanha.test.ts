import { describe, expect, it } from "vitest";

import {
  canalAceitaTipo,
  escolherSessaoDaCampanha,
  type SessaoDaCampanha,
} from "./canal-da-campanha";

const oficial: SessaoDaCampanha = { id: "oficial", provider: "meta_cloud" };
const qr: SessaoDaCampanha = { id: "qr", provider: "waha" };
const intermediado: SessaoDaCampanha = { id: "zernio", provider: "zernio" };

describe("escolherSessaoDaCampanha", () => {
  it("texto livre PULA o oficial e escolhe o número por QR", () => {
    // O defeito medido: pegar a primeira WORKING punha texto no oficial; a API
    // aceitava (200 + wamid) e a Meta recusava a ENTREGA (131047).
    expect(escolherSessaoDaCampanha([oficial, qr], "texto")).toBe(qr);
  });

  it("template PULA o QR e escolhe o canal que exige modelos", () => {
    expect(escolherSessaoDaCampanha([qr, oficial], "template")).toBe(oficial);
  });

  it("o intermediado (BSP) serve para template, não para texto fora da janela", () => {
    expect(escolherSessaoDaCampanha([intermediado], "template")).toBe(intermediado);
    expect(escolherSessaoDaCampanha([intermediado], "texto")).toBeNull();
  });

  it("sem sessão do tipo pedido devolve null — estado visível, não fallback silencioso", () => {
    expect(escolherSessaoDaCampanha([qr], "template")).toBeNull();
    expect(escolherSessaoDaCampanha([oficial], "texto")).toBeNull();
    expect(escolherSessaoDaCampanha([], "texto")).toBeNull();
  });

  it("linha sem provider cai no default CONSERVADOR (QR)", () => {
    const semProvider: SessaoDaCampanha = { id: "antiga" };
    expect(canalAceitaTipo(semProvider, "texto")).toBe(true);
    expect(canalAceitaTipo(semProvider, "template")).toBe(false);
  });

  it("provider desconhecido também cai no default, em vez de explodir", () => {
    expect(canalAceitaTipo({ id: "x", provider: "provider_novo" }, "texto")).toBe(true);
    expect(canalAceitaTipo({ id: "x", provider: "provider_novo" }, "template")).toBe(false);
  });
});
