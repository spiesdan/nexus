/*
 * SERVICE WORKER — o app continua abrindo sem internet.
 *
 * ─── O QUE ELE FAZ, E O QUE ELE NÃO FAZ ────────────────────────────────────
 *
 * O sistema é Next com dados no servidor: sem rede, a página não é montada de
 * novo. O que dá para garantir é o que o motorista precisa na rua: depois de
 * abrir a cabine UMA vez com internet, o HTML, o JS e o CSS daquela tela ficam
 * no aparelho. Sem sinal, o app abre a última versão visitada e a rota vem do
 * `localStorage` (o `_motorista` já cai em `lerRotaLocal`). A baixa continua
 * entrando na fila local e sobe quando o sinal volta.
 *
 * Ele NÃO intercepta POST nem `/api/auth` — login, logout e mutações nunca são
 * servidos de cache. E, quando o app está online, a navegação é sempre buscada
 * na rede: cache é só o plano B, para não servir tela velha depois de deploy.
 *
 * ─── PRIVACIDADE ────────────────────────────────────────────────────────────
 *
 * O HTML do servidor carrega dados do usuário. Por isso qualquer navegação
 * para `/login` ou `/api/auth/signout` apaga o cache inteiro — o próximo login
 * no mesmo aparelho não enxerga a tela de quem saiu.
 */
const CACHE = "nexus-app-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function ehNavegacao(request) {
  return request.mode === "navigate";
}

function podeCachear(response) {
  // `redirected`: sessão expirada responde 30x para /login; cachear isso sob a
  // URL da tela faria o app abrir no login para sempre, mesmo offline.
  return response && response.ok && response.type === "basic" && !response.redirected;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Sessão e logout nunca saem do cache — e apagam o que houver.
  if (url.pathname === "/login" || url.pathname.startsWith("/api/auth/")) {
    event.respondWith(
      caches.delete(CACHE).catch(() => false).then(() => fetch(request)),
    );
    return;
  }
  if (url.pathname.startsWith("/auth/")) return;

  // Assets do Next têm hash no nome: cache-first é seguro e é o que faz o app
  // abrir rápido (e offline).
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (podeCachear(res)) {
              const copia = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copia));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Navegação: rede primeiro; sem rede, a última versão daquela URL.
  if (ehNavegacao(request)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (podeCachear(res)) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copia));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(request);
          if (hit) return hit;
          return new Response(
            "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
              "<body style='font-family:system-ui;padding:24px;background:#0b1220;color:#e5e7eb'>" +
              "<h1 style='font-size:18px'>Sem internet</h1>" +
              "<p style='color:#9ca3af;font-size:14px'>Abra esta tela uma vez com sinal para ela ficar disponível offline.</p>" +
              "</body>",
            { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }),
    );
    return;
  }
});
