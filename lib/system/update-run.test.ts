import { describe, expect, it } from "vitest";

import { canTransition, falhaObsoleta, isRunStale, RUN_STALE_AFTER_MS } from "./update-run";

describe("canTransition", () => {
  it("aceita o desfecho reportado pelo agente", () => {
    expect(canTransition("dispatched", "success")).toBe(true);
    expect(canTransition("dispatched", "failed")).toBe(true);
    expect(canTransition("dispatched", "failed_rolled_back")).toBe(true);
  });

  it("recusa mexer num run que já terminou", () => {
    expect(canTransition("success", "failed")).toBe(false);
    expect(canTransition("failed", "success")).toBe(false);
    expect(canTransition("failed_rolled_back", "success")).toBe(false);
  });

  it("recusa voltar para dispatched", () => {
    expect(canTransition("success", "dispatched")).toBe(false);
    expect(canTransition("dispatched", "dispatched")).toBe(false);
  });
});

describe("isRunStale", () => {
  const dispatched = "2026-07-28T12:00:00.000Z";

  it("não é velho antes do teto", () => {
    const now = new Date(Date.parse(dispatched) + RUN_STALE_AFTER_MS - 1000);
    expect(isRunStale(dispatched, now)).toBe(false);
  });

  it("é velho depois do teto", () => {
    const now = new Date(Date.parse(dispatched) + RUN_STALE_AFTER_MS + 1000);
    expect(isRunStale(dispatched, now)).toBe(true);
  });

  it("data inválida conta como velho — o que não dá para afirmar, não se afirma", () => {
    expect(isRunStale("isso não é data", new Date())).toBe(true);
  });
});

describe("falhaObsoleta", () => {
  const base = {
    status: "failed_rolled_back",
    agentOnline: true,
    versaoInstalada: "1.1.0",
    fromVersion: "1.0.0",
    toVersion: "1.1.0",
  };

  it("falha recém-reportada com o host na versão alvo ainda descreve a instalação", () => {
    // Falha sem rollback: o checkout deu certo, o app não subiu — o heartbeat
    // nomeia a versão alvo, que é exatamente a pegada da falha.
    expect(falhaObsoleta({ ...base, status: "failed", versaoInstalada: "1.1.0" })).toBe(false);
  });

  it("rollback cumprido ainda descreve a instalação (host na versão de onde saiu)", () => {
    expect(falhaObsoleta({ ...base, versaoInstalada: "1.0.0" })).toBe(false);
  });

  it("instalação que foi adiante por fora dispensa a falha antiga", () => {
    // O caso medido em produção (2026-10-02): rollback de 27/09 segurou a tela
    // por dias depois de um update manual — a 1.18.0 publicada sem botão.
    expect(
      falhaObsoleta({
        status: "failed_rolled_back",
        agentOnline: true,
        versaoInstalada: "1.18.0",
        fromVersion: "d4416bfe4",
        toVersion: "1.56.0",
      }),
    ).toBe(true);
  });

  it("sem agente online não se afirma nada — a falha fica de pé", () => {
    expect(falhaObsoleta({ ...base, agentOnline: false, versaoInstalada: "9.9.9" })).toBe(false);
  });

  it("status que não é falha nunca é obsoleto", () => {
    expect(falhaObsoleta({ ...base, status: "success", versaoInstalada: "9.9.9" })).toBe(false);
    expect(falhaObsoleta({ ...base, status: "dispatched", versaoInstalada: "9.9.9" })).toBe(false);
  });

  it("sem versão instalada para comparar, a falha fica de pé", () => {
    expect(falhaObsoleta({ ...base, versaoInstalada: "" })).toBe(false);
  });

  it("o 'v' da tag não conta como diferença de versão", () => {
    expect(falhaObsoleta({ ...base, versaoInstalada: "v1.1.0", toVersion: "v1.1.0" })).toBe(false);
    expect(falhaObsoleta({ ...base, versaoInstalada: "v1.2.0", toVersion: "v1.1.0" })).toBe(true);
  });

  it("'unknown' (agente morto no meio) segue a mesma regra das demais falhas", () => {
    expect(falhaObsoleta({ ...base, status: "unknown", versaoInstalada: "1.0.0" })).toBe(false);
    expect(falhaObsoleta({ ...base, status: "unknown", versaoInstalada: "9.9.9" })).toBe(true);
  });
});
