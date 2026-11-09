/**
 * A MÍDIA QUE O CLIENTE MANDOU, no canal oficial.
 *
 * ─── Por que existe este arquivo ────────────────────────────────────────────
 *
 * A Meta NÃO anuncia um link para a mídia recebida: o webhook traz um `id` e o
 * `mime_type`, e o binário só sai depois de duas chamadas autenticadas à Graph
 * (`GET /{id}` devolve uma URL temporária; `GET` nela devolve os bytes). O seam
 * de canais, porém, fala em URL — e o `media_url` da mensagem é o ponteiro que
 * o worker de persistência lê para saber que há algo a baixar.
 *
 * Então a ingestão grava aqui, em `media_url`, o endpoint estável da Graph que
 * RESOLVE a mídia daquele id. O adapter reconhece o formato e faz as duas
 * chamadas; quem olha a coluna vê um endereço, não um id solto.
 *
 * ─── Por que não guardar o `lookaside.fbsbx.com` ───────────────────────────
 *
 * Porque a URL temporária que a Graph devolve EXPIRA em poucos minutos — a
 * própria doc manda baixar na hora. Campanha e worker recorrem à mensagem
 * minutos (ou dias) depois; guardar a URL vencida produziria um defeito que só
 * aparece no dia seguinte, que é o pior tipo.
 */

const BASE = "https://graph.facebook.com";

/** Versão da Graph. Mesma régua de `lib/channels/meta/credentials.ts`. */
function graphVersion(): string {
  return process.env.META_GRAPH_VERSION ?? "v22.0";
}

/** `media-id` → endpoint que devolve metadados + URL assinada do binário. */
export function endpointDaMidia(mediaId: string): string {
  return `${BASE}/${graphVersion()}/${encodeURIComponent(mediaId)}`;
}

/**
 * O id de mídia dentro de um endpoint da Graph.
 *
 * `null` para qualquer outra URL — inclusive as que a Meta já mandou prontas no
 * webhook (aí o download é direto, sem a primeira chamada).
 */
export function idDaMidia(endpoint: string): string | null {
  const m = endpoint.match(/^https:\/\/graph\.facebook\.com\/[^/]+\/([^/?#]+)\/?$/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}
