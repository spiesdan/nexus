/**
 * O SHELL OFFLINE TAMBÉM É TELA — e o leitor de tela precisa saber o que é
 * cada campo.
 *
 * Medido no emulador em 18/11/2026 com TalkBack: os inputs de busca/observação
 * do novo pedido só tinham `placeholder`, e a árvore de acessibilidade expunha
 * `hint` sem nome de campo. O leitor de tela lia o exemplo, não o rótulo.
 *
 * Este gate é estático de propósito: o shell não tem React/test-id, e a
 * garantia que importa é a do HTML que é empacotado no APK.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");

function ler(arquivo: string): string {
  return readFileSync(path.join(RAIZ, "mobile", arquivo), "utf8");
}

function inputs(html: string): string[] {
  return [...html.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
}

describe("shell offline — nomes e estados para leitor de tela", () => {
  it("todo input visível tem nome acessível (aria-label ou label for)", () => {
    for (const arquivo of ["index.html", "novo-pedido.html"]) {
      const html = ler(arquivo);
      for (const tag of inputs(html)) {
        if (/type="hidden"/.test(tag)) continue;
        const temAria = /aria-label="[^"]+"/.test(tag);
        // `codigo` tem `<label for="codigo">` no index.
        const temLabelFor = /id="codigo"/.test(tag);
        expect(temAria || temLabelFor, `${arquivo}: input sem nome — ${tag}`).toBe(true);
      }
    }
  });

  it("a contagem da fila é texto e região viva", () => {
    const html = ler("index.html");
    expect(html).toMatch(/id="conta-fila"[^>]*aria-live="polite"/);
    expect(html).toMatch(/Fila de envio/);
  });

  it("estados que mudam (cliente/total) são anunciados como status", () => {
    const html = ler("novo-pedido.html");
    expect(html).toMatch(/id="cliente-escolhido"[^>]*role="status"/);
    expect(html).toMatch(/id="total"[^>]*role="status"/);
  });

  it("todo botão/link de ação tem texto visível", () => {
    for (const arquivo of ["index.html", "novo-pedido.html"]) {
      const html = ler(arquivo);
      for (const m of html.matchAll(/<(button|a)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
        const texto = m[2]!
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        expect(texto.length, `${arquivo}: ação sem nome — ${m[0].slice(0, 80)}`).toBeGreaterThan(0);
      }
    }
  });
});
