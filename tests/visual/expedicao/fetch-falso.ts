/**
 * O `fetch` DA BANCADA — responde o que a API responderia, sem servidor.
 *
 * A bancada existe para fotografar os componentes REAIS (`Roteirizador` →
 * `MapaRota`, `PainelRecuperacao`) sem subir app, Supabase ou banco. O único
 * ponto que precisa ser falso é a borda HTTP — e ela é falsa de propósito, no
 * formato exato que o `apiClient` espera (`{ data: ... }`).
 *
 * Toda URL não mapeada devolve `{ data: {} }` com 200: a bancada fotografa o
 * estado de repouso, e uma chamada inesperada não pode virar tela de erro por
 * um motivo que não é o que se quer provar.
 */
import { FROTA, RECUPERACOES, ROTA } from "./fixtures";

function resposta(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export function instalarFetchFalso() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    if (url.includes("/rota/recuperacoes")) return resposta({ data: RECUPERACOES });
    if (/\/shipments\/[^/]+\/rota$/.test(url)) return resposta({ data: ROTA });
    if (url.includes("/api/v1/fleet")) return resposta({ data: FROTA });
    if (url.includes("/rota/posicao")) return resposta({ data: { posicoes: [] } });
    // Rede de segurança: o resto continua indo para o servidor de verdade, se
    // houver um. Na bancada não há.
    if (url.startsWith("/api/")) return resposta({});
    return original(entrada, init);
  }) as typeof fetch;
}
