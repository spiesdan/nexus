/**
 * TODO COMPONENTE IMPORTADO NO LAYOUT É RENDERIZADO?
 *
 * ─── O defeito que este teste existe para impedir ───────────────────────────
 *
 * `SincronizadorOffline` foi escrito, importado no layout e **nunca
 * renderizado** (`aaff0b51`, 10/10/2026). A consequência não foi um detalhe de
 * estilo: a fila de pedidos capturados sem sinal nunca subia sozinha, porque o
 * único dreno do produto era um componente que não estava na árvore. E o
 * `eslint` não reprovou — `no-unused-vars` é **warning** neste repo, e warning
 * não derruba `pnpm lint`.
 *
 * Os testes que existiam mediam a biblioteca (`lib/offline/*`) e o shell
 * (Playwright do vite) — nenhum media a LIGAÇÃO entre os dois. É exatamente o
 * tipo de furo que um teste de unidade de comportamento não pega: a peça
 * funciona; ninguém a instalou.
 *
 * ─── Por que o teste é textual ─────────────────────────────────────────────
 *
 * O layout é um Server Component assíncrono: `cookies()`, `headers()`,
 * Supabase e redirect. Montá-lo no jsdom exigiria dublar o Next inteiro, e o
 * teste passaria a medir os dublês. A pergunta aqui é estática — "o nome
 * importado aparece na árvore?" — e a resposta está no texto do arquivo. É a
 * mesma técnica de `tests/unit/branding.test.ts`, que lê a fonte para vigiar
 * regressão de marca.
 *
 * O alcance é deliberadamente estreito: só imports de `./_components/`. Os
 * outros imports do layout são funções (`cssDaMarca`, `marcaDaInstalacao`),
 * valores de configuração e tipos, e cobrar JSX deles seria falso positivo.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LAYOUT = path.join(process.cwd(), "app/app/layout.tsx");

/** Nomes importados de `./_components/...`, na ordem em que aparecem. */
function componentesDoLayout(fonte: string): { nome: string; origem: string }[] {
  const saida: { nome: string; origem: string }[] = [];
  const re = /import\s*\{([^}]+)\}\s*from\s*"\.\/_components\/([^"]+)"/g;
  for (const m of fonte.matchAll(re)) {
    const nomes = (m[1] ?? "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    for (const bruto of nomes) {
      const nome = bruto.replace(/^type\s+/, "").split(/\s+as\s+/)[0]?.trim() ?? "";
      if (nome) saida.push({ nome, origem: m[2] ?? "" });
    }
  }
  return saida;
}

describe("layout de /app", () => {
  const fonte = fs.readFileSync(LAYOUT, "utf8");

  it("lista os componentes importados de ./_components", () => {
    // Guarda contra o regex deixar de casar (ex.: aspas simples): se a lista
    // vier vazia, o teste abaixo passaria sem medir nada.
    const nomes = componentesDoLayout(fonte).map((c) => c.nome);
    expect(nomes).toContain("AppShell");
    expect(nomes).toContain("RegistrarServiceWorker");
  });

  it("renderiza cada componente importado de ./_components", () => {
    const semMontar = componentesDoLayout(fonte).filter(
      (c) => !new RegExp(`<${c.nome}[\\s/>]`).test(fonte),
    );
    // A mensagem carrega a origem porque o conserto é no import, não aqui.
    expect(
      semMontar.map((c) => `${c.nome} (${c.origem}) importado e nunca renderizado`),
    ).toEqual([]);
  });

  it("monta o sincronizador da fila offline", () => {
    // A regressão específica de aaff0b51: sem esta linha, pedido capturado sem
    // sinal fica no aparelho para sempre — sem erro, sem aviso, sem retry.
    expect(fonte).toMatch(/<SincronizadorOffline\s*\/>/);
  });
});
