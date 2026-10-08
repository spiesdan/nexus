/**
 * A URL que o `<img>` pede tem que existir NA SUA INSTALAÇÃO.
 *
 * O defeito que este teste fecha: o componente fazia
 * `url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/")`
 * — um caminho que só o Supabase **Cloud** serve. No self-host o storage-api
 * responde `404 … Route GET:/render/image/public/… not found`, o `<img>` recebia
 * 404 e a coluna de fotos ficava vazia enquanto TODA a API respondia 200.
 *
 * Por que um teste de URL: os testes que já existiam mediam o status da API, e
 * ela respondia 200. O que quebrava era o arquivo que o navegador ia buscar
 * DEPOIS disso. Teste que só olha a resposta passa por cima do defeito inteiro.
 */
import { describe, expect, it } from "vitest";

import { urlDeExibicaoDaFoto, urlPublicaDaFoto } from "@/lib/storage/foto";

describe("urlDeExibicaoDaFoto", () => {
  it("não usa o caminho de redimensionamento por padrão — ele não existe no self-host", () => {
    const url = urlDeExibicaoDaFoto("org/produto/foto.jpg");
    expect(url).not.toContain("/render/image/");
    expect(url).toContain("/storage/v1/object/public/product-images/org/produto/foto.jpg");
  });

  it("redireciona para o redimensionador só com SUPABASE_IMAGE_TRANSFORM=on", async () => {
    const { env } = await import("@/lib/env");
    const original = env.SUPABASE_IMAGE_TRANSFORM;
    try {
      // `env` é o objeto já validado; mexer nele é o jeito de exercitar o
      // outro ramo sem recarregar o módulo inteiro (e o zod no topo dele).
      (env as { SUPABASE_IMAGE_TRANSFORM: string }).SUPABASE_IMAGE_TRANSFORM = "on";
      const url = urlDeExibicaoDaFoto("org/produto/foto.jpg");
      expect(url).toContain("/storage/v1/render/image/public/product-images/org/produto/foto.jpg");
      expect(url).toContain("width=96");
    } finally {
      (env as { SUPABASE_IMAGE_TRANSFORM: string }).SUPABASE_IMAGE_TRANSFORM = original;
    }
  });

  it("a URL crua não muda com a transformação — ela serve para download", async () => {
    const { env } = await import("@/lib/env");
    const original = env.SUPABASE_IMAGE_TRANSFORM;
    try {
      const antes = urlPublicaDaFoto("org/p/f.jpg");
      (env as { SUPABASE_IMAGE_TRANSFORM: string }).SUPABASE_IMAGE_TRANSFORM = "on";
      expect(urlPublicaDaFoto("org/p/f.jpg")).toBe(antes);
    } finally {
      (env as { SUPABASE_IMAGE_TRANSFORM: string }).SUPABASE_IMAGE_TRANSFORM = original;
    }
  });

  it("não duplica barra, nem na base nem no caminho", () => {
    const url = urlDeExibicaoDaFoto("/org//produto/foto.jpg");
    expect(url).not.toContain("//storage");
    expect(url).toContain("/product-images/org//produto/foto.jpg");
  });
});

/**
 * Foto em DISCO não é foto do bucket. Medido na org real: o upload do produto
 * grava em `storage_path` com prefixo `local:`, o bucket público não conhece
 * esse caminho e respondia **400** — com a lista de produtos inteira
 * aparecendo e nenhum erro no log.
 *
 * A rota que serve esse arquivo exige o ID DA FOTO (não o `storage_path`),
 * então a URL só pode ser montada com o par de ids. Sem ele, a função recusa
 * em vez de devolver um caminho que o browser não consegue abrir.
 */
describe("foto local", () => {
  it("vira a rota da API, com o id da foto — não o caminho em disco", () => {
    const url = urlDeExibicaoDaFoto("local:16f950/abc/prod/8e49bcd2.jpg", {
      productId: "prod-1",
      fotoId: "8e49bcd2",
    });
    expect(url).toBe("/api/v1/products/prod-1/images/8e49bcd2");
    expect(url).not.toContain("storage/v1");
    expect(url).not.toContain("16f950");
  });

  it("sem os ids, recusa em vez de devolver caminho que o browser nao abre", () => {
    expect(() => urlDeExibicaoDaFoto("local:org/prod/foto.jpg")).toThrowError(
      /precisa de productId e fotoId/,
    );
  });

  it("foto do bucket continua indo para o storage, sem passar pela API", () => {
    const url = urlDeExibicaoDaFoto("org/prod/foto.jpg");
    expect(url).toContain("/storage/v1/object/public/product-images/org/prod/foto.jpg");
  });
});
