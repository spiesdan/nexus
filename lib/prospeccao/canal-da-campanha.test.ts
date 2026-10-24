import { describe, expect, it } from "vitest";

import { CHANNEL_CAPABILITIES, type ChannelProvider } from "@/lib/channels";

import {
  canalAceitaTipo,
  escolherSessaoDaCampanha,
  type SessaoDaCampanha,
} from "./canal-da-campanha";

/**
 * As fixtures saem da MATRIZ, não de literais: o lint de canal
 * (`scripts/lint-channels.ts`) proíbe nomear provider fora de `lib/channels/`,
 * e teste co-locado em `lib/` entra na varredura. Montar as sessões pelo que
 * elas PERMITEM é a mesma pergunta que o módulo faz — e mantém o teste sem
 * depender de qual provider é qual.
 */
const PROVIDERS = Object.keys(CHANNEL_CAPABILITIES) as ChannelProvider[];
const falaTextoLivre = (p: ChannelProvider) =>
  CHANNEL_CAPABILITIES[p].freeformOutsideWindow;
const exigeTemplate = (p: ChannelProvider) =>
  CHANNEL_CAPABILITIES[p].requiresTemplates;

const QR = PROVIDERS.find((p) => falaTextoLivre(p) && !exigeTemplate(p))!;
const OFICIAIS = PROVIDERS.filter((p) => exigeTemplate(p) && !falaTextoLivre(p));
const [OFICIAL, INTERMEDIADO] = OFICIAIS;

const oficial: SessaoDaCampanha = { id: "oficial", provider: OFICIAL };
const qr: SessaoDaCampanha = { id: "qr", provider: QR };
const intermediado: SessaoDaCampanha = {
  id: "intermediado",
  provider: INTERMEDIADO,
};

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
