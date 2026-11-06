/**
 * O VALOR DE UM SLOT DE MÍDIA — uma régua só, para a tela e para o motor.
 *
 * Um template com cabeçalho de imagem/vídeo/documento espera UM valor por
 * slot. Esse valor pode ser:
 *
 *   1. um link `https://` público — a Meta baixa o arquivo;
 *   2. uma referência `bucket://whatsapp-media/…` devolvida pelo upload da
 *      campanha, assinada no momento do envio (ver
 *      `lib/prospeccao/midia-da-campanha.ts`).
 *
 * O formato da referência mora AQUI, e não em dois lugares: a validação da
 * campanha, a tela e a assinatura precisam concordar sobre o mesmo prefixo. Se
 * cada lado tivesse a sua regex, um deles aceitaria o que o outro não resolve, e
 * o defeito só apareceria na Meta — depois de a mensagem ser cobrada.
 */

export const BUCKET_DE_MIDIA = "whatsapp-media";

const PREFIXO = `bucket://${BUCKET_DE_MIDIA}/`;

const CAMINHO_SEGURO = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;

/** O slot leva arquivo (link ou referência), não texto. */
export function ehSlotDeMidia(expects: string): boolean {
  return expects === "image" || expects === "video" || expects === "document";
}

/** `org/campanhas/arquivo.jpg` → `bucket://whatsapp-media/org/campanhas/arquivo.jpg`. */
export function referenciaDeMidia(caminho: string): string {
  const limpo = caminho.replace(/^\/+/, "");
  if (!CAMINHO_SEGURO.test(limpo) || limpo.includes("..")) {
    throw new Error("midia_do_template: caminho inválido");
  }
  return `${PREFIXO}${limpo}`;
}

/** O caminho de storage dentro da referência, ou `null` se não for referência. */
export function caminhoDaReferencia(valor: string): string | null {
  const v = valor.trim();
  if (!v.startsWith(PREFIXO)) return null;
  const caminho = v.slice(PREFIXO.length);
  if (!CAMINHO_SEGURO.test(caminho) || caminho.includes("..")) return null;
  return caminho;
}

/**
 * O valor de um slot de mídia é aceitável?
 *
 * Texto solto e `http://` são recusados AQUI: a Meta exige HTTPS e devolveria
 * 131053/132012 depois de aceitar o POST — ou seja, depois de cobrar.
 */
export function valorDeMidiaAceito(valor: string): boolean {
  if (caminhoDaReferencia(valor) !== null) return true;
  const v = valor.trim();
  if (!v) return false;
  try {
    const url = new URL(v);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}
