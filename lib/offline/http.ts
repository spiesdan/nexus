/**
 * O TRANSPORTE DO SHELL — CapacitorHttp no aparelho, `fetch` no navegador.
 *
 * ─── Por que não é só `fetch` ──────────────────────────────────────────────
 *
 * A página do shell roda em `https://localhost` (origem do Capacitor). Um
 * `fetch` dali para `https://crm.cliente.com` é cross-origin: o WebView aplica
 * CORS, e o servidor do cliente normalmente não devolve
 * `Access-Control-Allow-Origin: https://localhost`. O CapacitorHttp faz a
 * requisição no lado NATIVO — sem CORS, com timeout próprio e sem cookie de
 * sessão (que o shell não tem de qualquer jeito).
 *
 * No navegador (teste e2e, `vite dev`), `fetch` é o caminho: o e2e intercepta a
 * rota e mede o comportamento da tela, não a ponte nativa — que só um aparelho
 * prova. Essa distinção está registrada como limite no doc da frente.
 *
 * ─── O que nunca vai junto ─────────────────────────────────────────────────
 *
 * O token só no header `Authorization`. Nunca na URL: URL aparece em log de
 * proxy, em histórico e em relatório de erro. Sem cookie, sem query string.
 */

export interface RespostaDoShell {
  status: number;
  corpo: () => Promise<unknown>;
}

export type BuscarDoShell = (
  url: string,
  init?: { method: string; body?: string },
) => Promise<RespostaDoShell>;

const TEMPO_LIMITE_MS = 30_000;

function ehNativo(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
        ?.isNativePlatform?.() === true
    );
  } catch {
    return false;
  }
}

function respostaDeJson(status: number, dados: unknown): RespostaDoShell {
  return {
    status,
    // Mantém o contrato dos adaptadores do dreno/catálogo: `corpo()` devolve o
    // objeto já parseado. Se o nativo entregar string, parseia uma vez.
    corpo: async () => {
      if (typeof dados !== "string") return dados;
      try {
        return JSON.parse(dados) as unknown;
      } catch {
        return null;
      }
    },
  };
}

/**
 * Uma requisição autenticada pelo token do aparelho.
 *
 * `token` é obrigatório de propósito: a rota `/device/*` recusa sem ele, e um
 * parâmetro opcional convidaria a chamar sem — o defeito apareceria só no
 * aparelho, com 401 silencioso.
 */
export async function requisitar(
  url: string,
  init: { method: string; body?: string },
  token: string,
): Promise<RespostaDoShell> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  if (ehNativo()) {
    const { CapacitorHttp } = await import("@capacitor/core");
    const r = await CapacitorHttp.request({
      url,
      method: init.method,
      headers,
      data: init.body,
      connectTimeout: TEMPO_LIMITE_MS,
      readTimeout: TEMPO_LIMITE_MS,
      responseType: "json",
    });
    return respostaDeJson(r.status, r.data);
  }

  const controlador = new AbortController();
  const relogio = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);
  try {
    const r = await fetch(url, {
      method: init.method,
      headers,
      body: init.body,
      signal: controlador.signal,
    });
    // Lê uma vez e devolve a closure: o chamador pode perguntar duas vezes sem
    // consumir o stream (o `fetch` real não permite reler).
    const texto = await r.text();
    let dados: unknown = null;
    if (texto) {
      try {
        dados = JSON.parse(texto) as unknown;
      } catch {
        dados = null;
      }
    }
    return respostaDeJson(r.status, dados);
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Adaptador no formato que `drenarFila` espera (`FetchDoSync`): recebe caminho
 * relativo, prefixa com a URL da instalação e autentica.
 */
export function buscarComDispositivo(urlBase: string, token: string): BuscarDoShell {
  const base = urlBase.replace(/\/+$/, "");
  // Sem `init` é GET — é o que o catálogo (paginado) usa. O dreno passa POST
  // explícito. O default fica aqui, e não em quem chama, para o adaptador
  // continuar servindo às duas assinaturas (`GetJson` e `FetchDoSync`).
  return (caminho, init) => requisitar(`${base}${caminho}`, init ?? { method: "GET" }, token);
}
