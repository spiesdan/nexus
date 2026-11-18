/**
 * A RECUPERAÇÃO DE NOTA TRAVADA — a decisão, testada sem banco.
 *
 * O caso que originou isto: o job fiscal é reivindicado com
 * `pendente → processando` ANTES da SEFAZ. Worker que morre no meio deixa o
 * job `processando` e a nota `em_emissao` para sempre. A rota `reemitir`
 * dizia recuperar esse estado, mas a máquina de estados proibia
 * `em_emissao → em_emissao` e devolvia 422.
 *
 * Estes testes fixam a decisão: só reabre job de processamento VELHO; job
 * fresco manda aguardar (transmitir de novo cedo demais duplicaria o
 * documento), e nota terminal nunca volta.
 */
import { describe, expect, it } from "vitest";

import {
  LIMITE_PROCESSANDO_MIN,
  jobDeProcessamentoTravado,
  planejarRecuperacao,
  type JobAberto,
} from "@/lib/fiscal/recuperacao";

const AGORA = new Date("2026-11-18T12:00:00.000Z");

function job(status: JobAberto["status"], minutosAtras: number): JobAberto {
  return {
    id: "job-1",
    status,
    updated_at: new Date(AGORA.getTime() - minutosAtras * 60_000).toISOString(),
  };
}

describe("jobDeProcessamentoTravado", () => {
  it("processando dentro do teto não é travado", () => {
    expect(jobDeProcessamentoTravado(job("processando", 5), AGORA)).toBe(false);
  });

  it("processando no teto é travado", () => {
    expect(
      jobDeProcessamentoTravado(job("processando", LIMITE_PROCESSANDO_MIN), AGORA),
    ).toBe(true);
  });

  it("job pendente nunca é travado", () => {
    expect(jobDeProcessamentoTravado(job("pendente", 999), AGORA)).toBe(false);
    expect(jobDeProcessamentoTravado(null, AGORA)).toBe(false);
  });

  it("data inválida não vira recuperação por acidente", () => {
    expect(
      jobDeProcessamentoTravado(
        { id: "job-1", status: "processando", updated_at: "não é data" },
        AGORA,
      ),
    ).toBe(false);
  });
});

describe("planejarRecuperacao", () => {
  it("nota erro sem job é o retry normal", () => {
    expect(planejarRecuperacao("erro", null, AGORA)).toEqual({
      acao: "enfileirar",
      reabrirJob: null,
    });
  });

  it("nota erro com job pendente não duplica trabalho", () => {
    const pendente = job("pendente", 1);
    expect(planejarRecuperacao("erro", pendente, AGORA)).toEqual({
      acao: "ja_na_fila",
      job: pendente,
    });
  });

  it("nota em_emissao sem job (órfã) é recuperável", () => {
    expect(planejarRecuperacao("em_emissao", null, AGORA)).toEqual({
      acao: "enfileirar",
      reabrirJob: null,
    });
  });

  it("job processando fresco manda aguardar — nunca reenvia cedo", () => {
    const fresco = job("processando", 2);
    expect(planejarRecuperacao("em_emissao", fresco, AGORA)).toEqual({
      acao: "aguardar_processamento",
      job: fresco,
    });
  });

  it("job processando velho é reaberto (o caso do worker morto)", () => {
    const travado = job("processando", 60);
    expect(planejarRecuperacao("em_emissao", travado, AGORA)).toEqual({
      acao: "enfileirar",
      reabrirJob: travado,
    });
  });

  it("autorizada, denegada e cancelada nunca voltam", () => {
    for (const status of ["autorizada", "denegada", "cancelada"] as const) {
      const plano = planejarRecuperacao(status, null, AGORA);
      expect(plano.acao).toBe("recusar");
    }
  });

  it("nota pendente (sem emissor real) pode voltar à fila", () => {
    expect(planejarRecuperacao("pendente", null, AGORA)).toEqual({
      acao: "enfileirar",
      reabrirJob: null,
    });
  });
});
