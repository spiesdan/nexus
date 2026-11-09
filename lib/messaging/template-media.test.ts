import { describe, expect, it } from "vitest";

import {
  mimeDaMidiaDoTemplate,
  templateMediaDoMetadata,
  templateMediaDosValores,
} from "./template-media";

describe("templateMediaDosValores", () => {
  it("extrai o caminho da referência bucket:// antes da assinatura", () => {
    expect(
      templateMediaDosValores({
        "header:1":
          "bucket://whatsapp-media/org-1/campanhas/1f4ac242-e986-46f3-b9af-cf4486f185b9.jpg",
      }),
    ).toEqual({
      path: "org-1/campanhas/1f4ac242-e986-46f3-b9af-cf4486f185b9.jpg",
      mime: "image/jpeg",
    });
  });

  it("ignora valores que não são referência de storage", () => {
    expect(
      templateMediaDosValores({
        "1": "Olá, {{nome}}",
        "2": "https://exemplo.com/imagem.png",
      }),
    ).toBeNull();
  });

  it("recusa referência com travessia de diretório", () => {
    expect(
      templateMediaDosValores({
        "header:1": "bucket://whatsapp-media/org-1/../../outra-org/segredo.png",
      }),
    ).toBeNull();
  });
});

describe("templateMediaDoMetadata", () => {
  it("lê { path, mime } gravado pelo envio", () => {
    expect(
      templateMediaDoMetadata({
        template_media: { path: "org-1/campanhas/kit.webp", mime: "image/webp" },
      }),
    ).toEqual({ path: "org-1/campanhas/kit.webp", mime: "image/webp" });
  });

  it("deriva o mime quando o metadata não o trouxe", () => {
    expect(
      templateMediaDoMetadata({ template_media: { path: "org-1/campanhas/kit.png" } }),
    ).toEqual({ path: "org-1/campanhas/kit.png", mime: "image/png" });
  });

  it("devolve null para metadata vazio, torto ou sem path", () => {
    expect(templateMediaDoMetadata(null)).toBeNull();
    expect(templateMediaDoMetadata({})).toBeNull();
    expect(templateMediaDoMetadata({ template_media: "x" })).toBeNull();
    expect(templateMediaDoMetadata({ template_media: [] })).toBeNull();
    expect(templateMediaDoMetadata({ template_media: { path: "   " } })).toBeNull();
  });
});

describe("mimeDaMidiaDoTemplate", () => {
  it("mapeia extensões conhecidas e cai em octet-stream no resto", () => {
    expect(mimeDaMidiaDoTemplate("org/campanhas/a.JPEG")).toBe("image/jpeg");
    expect(mimeDaMidiaDoTemplate("org/campanhas/a.mp4")).toBe("video/mp4");
    expect(mimeDaMidiaDoTemplate("org/campanhas/a.pdf")).toBe("application/pdf");
    expect(mimeDaMidiaDoTemplate("org/campanhas/a.bin")).toBe("application/octet-stream");
  });
});
