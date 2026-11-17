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

  it("o registro aponta para /sw.js", () => {
    expect(REGISTRO).toContain('register("/sw.js"');
    // O comentário do módulo cita o arquivo antigo de propósito (explica o
    // defeito); o que não pode citá-lo é o CÓDIGO.
    const codigo = REGISTRO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toContain("notify-sw");
  });
});
