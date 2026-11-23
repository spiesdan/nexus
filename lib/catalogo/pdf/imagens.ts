/**
 * FONTE DAS IMAGENS DO PDF — o mesmo storage que a tela já usa.
 *
 * Bucket `product-images` é público e grava-se o CAMINHO, nunca a URL. Fotos
 * legadas em disco (`local:`) são lidas do mesmo diretório da rota de imagem
 * e viram data URI: o renderer roda no servidor, sem cookie, e não poderia
 * pedir a rota autenticada. O caminho é conferido contra a raiz (sem `..`).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { urlPublicaDaFoto } from "@/lib/storage/foto";

export async function fonteDaImagem(storagePath: string | null | undefined): Promise<string | null> {
  const caminho = storagePath?.trim();
  if (!caminho) return null;
  if (!caminho.startsWith("local:")) return urlPublicaDaFoto(caminho);

  const raiz = path.resolve(process.env.PRODUCT_IMAGES_DIR ?? "/data/product-images");
  const alvo = path.resolve(raiz, caminho.slice("local:".length));
  if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) return null;
  try {
    const dados = await readFile(alvo);
    const ext = path.extname(alvo).slice(1).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${dados.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Extensões/tamanho aceitos no upload da logo do catálogo (mesmo bucket). */
export const LOGO_TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp"] as const;
export const LOGO_TAMANHO_MAXIMO = 2 * 1024 * 1024;

export function logoValida(tipo: string, tamanho: number): boolean {
  return (
    (LOGO_TIPOS_ACEITOS as readonly string[]).includes(tipo) &&
    tamanho > 0 &&
    tamanho <= LOGO_TAMANHO_MAXIMO
  );
}

/** Caminho não-enumerável e isolado por tenant. */
export function caminhoDaLogo(organizationId: string, nomeArquivo: string): string {
  const seguro = nomeArquivo.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const sufixo = Math.random().toString(36).slice(2, 10);
  return `${organizationId}/catalogo/logo-${sufixo}-${seguro}`;
}
