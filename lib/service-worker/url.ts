/**
 * O ENDEREÇO DO SERVICE WORKER — com a versão do build na query.
 *
 * ─── O DEFEITO QUE ISTO CORRIGE ────────────────────────────────────────────
 *
 * O `sw.js` guardava tudo em `CACHE = "nexus-app-v1"` — um literal. A cada
 * `update.sh` o arquivo do worker chega **byte-idêntico** (ele não é compilado),
 * então o navegador não reinstalava, o `activate` não rodava e o `v1` nunca
 * morria: chunks antigos acumulavam sem teto e quem não abria online depois do
 * deploy continuava vendo a versão anterior offline.
 *
 * ─── POR QUE A VERSÃO VAI NA QUERY, E NÃO DENTRO DO ARQUIVO ────────────────
 *
 * `public/*` não passa pelo compilador: `process.env` não é inlineado ali. Um
 * `?v=<versão>` muda a URL de registro, o navegador trata como worker NOVO,
 * instala e ativa — e o `sw.js` lê o próprio `location.search` para batizar o
 * cache. Nenhum passo manual e nenhum arquivo gerado.
 *
 * A versão vem de `/api/v1/system/version` (a mesma que a tela de atualização
 * mostra) e fica no `sessionStorage`: uma requisição por sessão, não por
 * carregamento. Falha de rede cai em `dev` — que é o comportamento de hoje,
 * nunca pior.
 */
const CHAVE = "nexus-sw-versao";

export async function urlDoServiceWorker(): Promise<string> {
  const guardada =
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem(CHAVE) : null;
  if (guardada) return `/sw.js?v=${encodeURIComponent(guardada)}`;

  let versao = "dev";
  try {
    const r = await fetch("/api/v1/system/version", { cache: "no-store" });
    if (r.ok) {
      const corpo = (await r.json()) as { data?: { current_version?: string | null } };
      versao = String(corpo.data?.current_version ?? "dev").trim() || "dev";
    }
  } catch {
    // sem rede: `dev` mantém o worker funcionando; a próxima sessão tenta de novo
  }
  try {
    sessionStorage.setItem(CHAVE, versao);
  } catch {
    // sessionStorage bloqueado (modo privado): a versão não é cacheada, só isso
  }
  return `/sw.js?v=${encodeURIComponent(versao)}`;
}
