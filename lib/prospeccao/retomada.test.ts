/**
 * RETOMADA — o dono repetiu a regra três vezes; aqui ela é travada.
 *
 * Nunca repetir o que já foi enviado; preset configurável em vez de texto de
 * marca; 48h e um só follow-up; cancelar em resposta/opt-out/encerramento/
 * exclusão; fora da janela da Meta, template aprovado ou bloqueio nomeado.
 */
import { describe, expect, it } from "vitest";

import type { EstadoDaJanela } from "@/lib/channels/janela";

import {
  agendarEm,
  deveAgendarFollowup,
  HORAS_FOLLOWUP,
  mensagemParaProspect,
} from "./retomada";

const ABERTA: EstadoDaJanela = { tipo: "aberta", restanteMs: 3_600_000 };
const FECHADA: EstadoDaJanela = { tipo: "fechada", fechadaHaMs: 7_200_000 };

describe("decisão de mensagem", () => {
  it("nunca contatado recebe o template escolhido na campanha", () => {
    const decisao = mensagemParaProspect({
      jaContatado: false,
      janela: FECHADA,
      presetRetomada: "texto que não deve ser usado ainda",
      templateEscolhido: "template_primeiro_contato",
      templateRetomadaAprovado: null,
    });
    expect(decisao).toMatchObject({ tipo: "template", template: "template_primeiro_contato", status: "pronto" });
  });

  it("já contatado com janela aberta usa o TEXTO DO PRESET — não o enviado antes", () => {
    const decisao = mensagemParaProspect({
      jaContatado: true,
      janela: ABERTA,
      presetRetomada: "preset vindo do banco do tenant",
      templateEscolhido: "template_primeiro_contato",
      templateRetomadaAprovado: "template_retomada",
    });
    expect(decisao).toMatchObject({ tipo: "texto", texto: "preset vindo do banco do tenant", status: "pronto" });
    expect(JSON.stringify(decisao)).not.toContain("template_primeiro_contato");
  });

  it("fora da janela, exige template aprovado — sem ele, bloqueio nomeado", () => {
    const bloqueado = mensagemParaProspect({
      jaContatado: true,
      janela: FECHADA,
      presetRetomada: "texto livre qualquer",
      templateEscolhido: "template_primeiro_contato",
      templateRetomadaAprovado: null,
    });
    expect(bloqueado.tipo).toBe("bloqueado");
    // Pré-requisito: sem template aprovado o fluxo fica AGUARDANDO, nunca enviado.
    expect(bloqueado.status).toBe("aguardando_aprovacao");
    expect(JSON.stringify(bloqueado)).not.toContain('"enviado"');
    expect(JSON.stringify(bloqueado)).toContain("131047");

    const aprovado = mensagemParaProspect({
      jaContatado: true,
      janela: FECHADA,
      presetRetomada: "texto livre qualquer",
      templateEscolhido: "template_primeiro_contato",
      templateRetomadaAprovado: "template_retomada",
    });
    expect(aprovado).toMatchObject({ tipo: "template", template: "template_retomada", status: "pronto" });
  });

  it("preset vazio nunca vira texto fixo inventado", () => {
    const decisao = mensagemParaProspect({
      jaContatado: true,
      janela: ABERTA,
      presetRetomada: "   ",
      templateEscolhido: "t",
      templateRetomadaAprovado: null,
    });
    expect(decisao.tipo).toBe("bloqueado");
    expect(decisao.status).toBe("aguardando_aprovacao");
  });
});

describe("follow-up de 48h", () => {
  const base = {
    respondeu: false,
    optOut: false,
    conversaEncerradaPorOptOut: false,
    prospectExcluido: false,
    jaAgendado: false,
    tentativas: 0,
  };

  it("agenda 48h depois, uma vez", () => {
    expect(deveAgendarFollowup(base)).toEqual({ cancelar: false, motivo: null });
    expect(deveAgendarFollowup({ ...base, jaAgendado: true }).motivo).toContain("idempotente");
    const agora = new Date("2026-11-23T12:00:00.000Z");
    expect(agendarEm(agora)).toBe("2026-11-25T12:00:00.000Z");
    expect(HORAS_FOLLOWUP).toBe(48);
  });

  it("cancela em resposta, opt-out, encerramento por opt-out e exclusão", () => {
    expect(deveAgendarFollowup({ ...base, respondeu: true }).motivo).toBe("respondeu");
    expect(deveAgendarFollowup({ ...base, optOut: true }).motivo).toBe("opt-out");
    expect(deveAgendarFollowup({ ...base, conversaEncerradaPorOptOut: true }).motivo).toBe(
      "opt-out",
    );
    expect(deveAgendarFollowup({ ...base, prospectExcluido: true }).motivo).toBe(
      "prospect excluído",
    );
  });

  it("não tenta para sempre", () => {
    expect(deveAgendarFollowup({ ...base, tentativas: 3 }).motivo).toBe("teto de tentativas");
  });
});
