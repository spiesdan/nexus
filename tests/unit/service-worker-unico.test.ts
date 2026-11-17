/**
 * UM ESCOPO, UM SERVICE WORKER.
 *
 * ─── O DEFEITO, MEDIDO EM 17/11/2026 ──────────────────────────────────────
 *
 * O app registrava DOIS workers no escopo `/`: `/sw.js` (cache offline) e
 * `/notify-sw.js` (bandeja + Web Push). Um escopo só admite um worker: ao
 * ativar notificações, o segundo substituía o primeiro e o offline morria em
 * silêncio — a tela não avisa, o app apenas deixa de abrir sem rede.
 *
 * A correção foi fundir os tratadores no `sw.js`. Este gate impede a volta:
 *
 *   1. só existe UM arquivo de service worker em `public/`;
 *   2. o `sw.js` trata `push` e `notificationclick` (o que substituiu o antigo);
 *   3. o módulo de registro aponta para `/sw.js`, nunca para outro caminho.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const PUBLIC = join(RAIZ, "public");
const SW = readFileSync(join(PUBLIC, "sw.js"), "utf8");
const REGISTRO = readFileSync(join(RAIZ, "lib", "notifications", "service_worker.ts"), "utf8");
const URL_DO_SW = readFileSync(join(RAIZ, "lib", "service-worker", "url.ts"), "utf8");

describe("service worker", () => {
  it("existe UM só em public/ — dois no mesmo escopo se substituem", () => {
    const workers = readdirSync(PUBLIC).filter((f) => f.endsWith(".js") && /sw\.js$/.test(f));
    expect(workers).toEqual(["sw.js"]);
  });

  it("o worker único cuida do cache E da bandeja", () => {
    for (const tratador of ['addEventListener("fetch"', 'addEventListener("push"', 'addEventListener("notificationclick"']) {
      expect(SW, `sw.js não trata ${tratador}`).toContain(tratador);
    }
  });

  it("o registro usa a URL versionada, nunca o caminho cru", () => {
    // `/sw.js?v=<versão>` é o que faz o navegador ver um worker NOVO a cada
    // atualização. Registrar `/sw.js` puro faria o arquivo byte-idêntico nunca
    // reinstalar — e o cache `v1` nunca morrer.
    expect(REGISTRO).toContain("urlDoServiceWorker");
    expect(URL_DO_SW).toContain("/sw.js?v=");
    const codigo = REGISTRO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toContain("notify-sw");
  });

  it("o cache é nomeado pela versão e só as versões antigas morrem", () => {
    expect(SW).toContain('searchParams.get("v")');
    expect(SW).toContain("nexus-app-");
    // O `activate` não pode apagar cache de outra coisa no mesmo escopo.
    expect(SW).toContain("startsWith(PREFIXO)");
  });
});
