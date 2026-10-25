import { describe, expect, it } from "vitest";

import { CHANNEL_CAPABILITIES, type ChannelProvider } from "@/lib/channels";

import {
  bloqueadaPorQualidade,
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

describe("0286 — a qualidade do número veta o canal", () => {
  const emRed = (s: SessaoDaCampanha): SessaoDaCampanha => ({
    ...s,
    quality_rating: "RED",
  });

  it("template PULA o oficial em RED e usa o oficial saudável", () => {
    // Dois números oficiais: o saudável segura a operação. Escolher o primeiro
    // compatível (o RED) pausaria a campanha sem necessidade.
    const saudavel: SessaoDaCampanha = { id: "oficial-bom", provider: OFICIAL };
    expect(escolherSessaoDaCampanha([emRed(oficial), saudavel], "template")).toBe(saudavel);
  });

  it("todos os oficiais em RED devolvem null, e o motivo é a qualidade", () => {
    const sessoes = [emRed(oficial), emRed(intermediado)];
    expect(escolherSessaoDaCampanha(sessoes, "template")).toBeNull();
    expect(bloqueadaPorQualidade(sessoes, "template")).toBe(true);
  });

  it("YELLOW continua enviando — só RED pausa", () => {
    const amarelo: SessaoDaCampanha = { ...oficial, quality_rating: "YELLOW" };
    expect(escolherSessaoDaCampanha([amarelo], "template")).toBe(amarelo);
    expect(bloqueadaPorQualidade([amarelo], "template")).toBe(false);
  });

  it("o caminho por QR não é alcançado pelo gate: sem nota, nunca RED", () => {
    // A Meta não publica qualidade de número pareado por QR. `null` tem de
    // continuar sendo "não sei", não "ruim" — senão o gate pararia o único
    // canal que a instalação tem.
    expect(escolherSessaoDaCampanha([qr], "texto")).toBe(qr);
    expect(bloqueadaPorQualidade([qr], "texto")).toBe(false);
  });

  it("canal ausente não é confundido com canal em RED", () => {
    expect(escolherSessaoDaCampanha([qr], "template")).toBeNull();
    expect(bloqueadaPorQualidade([qr], "template")).toBe(false);
    expect(bloqueadaPorQualidade([], "template")).toBe(false);
  });
});
