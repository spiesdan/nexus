/**
 * O CLIENTE DO OCR — o que ele aceita e o que ele recusa.
 *
 * O contrato que importa: nenhuma falha do serviço pode virar erro do pedido.
 * Desligado, fora do ar, lento ou com resposta estranha, a função devolve
 * `null` e a rota segue para a IA. É o que mantém o OCR como caminho BARATO,
 * não como novo ponto único de falha.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  OCR_SERVICE_URL: "",
  OCR_TIMEOUT_MS: 60_000,
}));

vi.mock("@/lib/env", () => ({ env: envMock }));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  envMock.OCR_SERVICE_URL = "";
  envMock.OCR_TIMEOUT_MS = 60_000;
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lerComOcr", () => {
  it("desligado não chama rede nenhuma", async () => {
    const { lerComOcr } = await import("./ocr");
    await expect(lerComOcr(Buffer.from("x"), "image/png")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resposta válida vira linhas tipadas", async () => {
    envMock.OCR_SERVICE_URL = "http://ocr:8790/";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        linhas: [{ texto: "2x AGUA 5L", confianca: 0.97 }],
        motor: "paddleocr",
      }),
    });

    const { lerComOcr } = await import("./ocr");
    const leitura = await lerComOcr(Buffer.from("x"), "image/png");

    expect(leitura?.linhas[0]).toEqual({ texto: "2x AGUA 5L", confianca: 0.97 });
    // A barra final da URL não pode virar `//ocr`.
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://ocr:8790/ocr");
  });

  it("erro HTTP do serviço vira null, não exceção", async () => {
    envMock.OCR_SERVICE_URL = "http://ocr:8790";
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    const { lerComOcr } = await import("./ocr");
    await expect(lerComOcr(Buffer.from("x"), "image/png")).resolves.toBeNull();
  });

  it("resposta fora do contrato vira null", async () => {
    envMock.OCR_SERVICE_URL = "http://ocr:8790";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ linhas: "não é lista" }),
    });

    const { lerComOcr } = await import("./ocr");
    await expect(lerComOcr(Buffer.from("x"), "image/png")).resolves.toBeNull();
  });

  it("timeout/rede caem no mesmo null", async () => {
    envMock.OCR_SERVICE_URL = "http://ocr:8790";
    fetchMock.mockRejectedValue(Object.assign(new Error("abort"), { name: "TimeoutError" }));

    const { lerComOcr } = await import("./ocr");
    await expect(lerComOcr(Buffer.from("x"), "image/png")).resolves.toBeNull();
  });
});
