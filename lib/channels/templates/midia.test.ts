import { describe, expect, it } from "vitest";

import {
  caminhoDaReferencia,
  ehSlotDeMidia,
  referenciaDeMidia,
  valorDeMidiaAceito,
} from "./midia";

describe("referência de mídia da campanha", () => {
  it("monta e desmonta o caminho de storage", () => {
    const ref = referenciaDeMidia("org-1/campanhas/kit.jpeg");
    expect(ref).toBe("bucket://whatsapp-media/org-1/campanhas/kit.jpeg");
    expect(caminhoDaReferencia(ref)).toBe("org-1/campanhas/kit.jpeg");
  });

  it("recusa caminho com traversal — a referência vira URL assinada no envio", () => {
    expect(() => referenciaDeMidia("org-1/../../org-2/kit.jpeg")).toThrow();
    expect(caminhoDaReferencia("bucket://whatsapp-media/org-1/../org-2/kit.jpeg")).toBeNull();
  });

  it("não confunde link comum com referência", () => {
    expect(caminhoDaReferencia("https://cdn.exemplo.com/kit.jpeg")).toBeNull();
  });
});

describe("valorDeMidiaAceito", () => {
  it("aceita https e a referência de storage", () => {
    expect(valorDeMidiaAceito("https://cdn.exemplo.com/kit.jpeg")).toBe(true);
    expect(valorDeMidiaAceito("bucket://whatsapp-media/org-1/campanhas/kit.jpeg")).toBe(true);
  });

  it("recusa http, texto solto e vazio — a Meta exige HTTPS", () => {
    expect(valorDeMidiaAceito("http://cdn.exemplo.com/kit.jpeg")).toBe(false);
    expect(valorDeMidiaAceito("kit.jpeg")).toBe(false);
    expect(valorDeMidiaAceito("   ")).toBe(false);
  });
});

describe("ehSlotDeMidia", () => {
  it("só imagem, vídeo e documento", () => {
    expect(["image", "video", "document"].every(ehSlotDeMidia)).toBe(true);
    expect(["text", "url_suffix", "coupon_code", "currency"].some(ehSlotDeMidia)).toBe(false);
  });
});
