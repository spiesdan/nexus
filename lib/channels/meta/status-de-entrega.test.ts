import { describe, expect, it } from "vitest";

import { patchDeStatus, STATUS_DE_ENTREGA } from "./status-de-entrega";

/**
 * O que a Meta confirma DEPOIS do POST vira coluna — e a transição é monotônica.
 *
 * O defeito que este módulo mata: a rota gravava `failed ? "failed" : "sent"`.
 * `delivered` e `read` chegavam no payload e morriam ali, então a campanha no
 * canal oficial nunca sabia se a mensagem tinha chegado.
 */

const AGORA = "2026-10-24T20:00:00.000Z";
const semErro = { code: null, title: null };

describe("patchDeStatus", () => {
  it("`delivered` grava o instante da entrega", () => {
    const t = patchDeStatus("delivered", semErro, AGORA);

    expect(t?.patch).toMatchObject({ status: "delivered", delivered_at: AGORA, updated_at: AGORA });
    expect(t?.de).toContain("sent");
  });

  it("`read` grava o instante da leitura", () => {
    const t = patchDeStatus("read", semErro, AGORA);

    expect(t?.patch).toMatchObject({ status: "read", read_at: AGORA });
    expect(t?.de).toContain("delivered");
  });

  it("`failed` grava o código e o título que a Meta mandou", () => {
    const t = patchDeStatus("failed", { code: 131047, title: "Re-engagement message" }, AGORA);

    expect(t?.patch).toMatchObject({
      status: "failed",
      error_code: "131047",
      error_message: "Re-engagement message",
    });
  });

  it("`failed` sem código não inventa erro nem apaga o anterior com string vazia", () => {
    const t = patchDeStatus("failed", semErro, AGORA);

    expect(t?.patch.error_code).toBeNull();
    expect(t?.patch.error_message).toBeNull();
  });

  it("`delivered`/`read` NÃO tocam em error_code — a falha anterior continua visível", () => {
    const entregue = patchDeStatus("delivered", { code: 131047, title: "x" }, AGORA);
    const lido = patchDeStatus("read", { code: 131047, title: "x" }, AGORA);

    expect(entregue?.patch).not.toHaveProperty("error_code");
    expect(lido?.patch).not.toHaveProperty("error_code");
  });

  it("a transição não regride: `sent` não parte de um estado já confirmado", () => {
    const t = patchDeStatus("sent", semErro, AGORA);

    expect(t?.de).not.toContain("sent");
    expect(t?.de).not.toContain("delivered");
    expect(t?.de).not.toContain("read");
  });

  it("`failed` não sobrescreve uma mensagem já lida", () => {
    const t = patchDeStatus("failed", { code: 1, title: "x" }, AGORA);

    expect(t?.de).not.toContain("read");
  });

  it("status fora do vocabulário devolve null — quem chama ignora e registra", () => {
    for (const status of ["deleted", "warning", "", "SENT"]) {
      expect(patchDeStatus(status, semErro, AGORA)).toBeNull();
    }
  });

  it("o vocabulário publicado é o que o parser produz", () => {
    expect(STATUS_DE_ENTREGA).toEqual(["sent", "delivered", "read", "failed"]);
  });
});
