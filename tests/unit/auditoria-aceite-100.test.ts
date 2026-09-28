import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Auditoria de aceite §100 — camada de FONTE do checklist dos 11 itens.
 * A camada de DOM vive em `tests/e2e/auditoria-aceite-11-itens.spec.ts`
 * (varredura das rotas em 1280: navegação, tabelas, cores inline, transições
 * lentas, glass, família de fonte). Aqui fica o que só se prova no código:
 * legado que não volta, portas de biblioteca justificadas e literais fora da
 * escala. Toda allowlist é exceção JÁ declarada no inventário — o teste
 * existe para a exceção não virar hábito.
 */
const RAIZ = path.resolve(__dirname, "../..");
const RAIZES = ["app", "components", "lib", "hooks"];

function arquivosVarridos(dir: string): string[] {
  const alvos: string[] = [];
  for (const entrada of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entrada.name);
    if (rel.includes(".test.")) continue;
    if (entrada.isDirectory()) alvos.push(...arquivosVarridos(rel));
    else if (rel.endsWith(".ts") || rel.endsWith(".tsx")) alvos.push(rel);
  }
  return alvos;
}

const arquivos = RAIZES.flatMap(arquivosVarridos);

function onde(achou: RegExp): string[] {
  return arquivos.filter((rel) => achou.test(fs.readFileSync(path.join(RAIZ, rel), "utf8")));
}

describe("itens 1-2 — visual legado e componentes antigos não voltam", () => {
  it("nenhum arquivo importa os primitivos mortos da Fase 1", () => {
    const legado = /from ["']@\/components\/(uimaxxing|ui\/(gradient-button|orb-button|pill-button|typing-field|select-menu))/;
    expect(onde(legado)).toEqual([]);
  });

  it("os arquivos mortos da Fase 1 seguem apagados", () => {
    const mortos = [
      "components/uimaxxing",
      "components/ui/gradient-button.tsx",
      "components/ui/orb-button.tsx",
      "components/ui/pill-button.tsx",
      "components/ui/typing-field.tsx",
      "components/ui/select-menu.tsx",
    ];
    expect(mortos.filter((rel) => fs.existsSync(path.join(RAIZ, rel)))).toEqual([]);
  });

  it("`window.confirm(` só aparece na documentação do substituto", () => {
    // O ConfirmacaoProvider cita a chamada antiga no JSDoc (linha 17) para
    // explicar a troca; nenhum outro arquivo pode sequer referenciá-la.
    expect(onde(/window\.confirm\(/)).toEqual(["components/nexus-ui/forms/ConfirmacaoProvider.tsx"]);
  });

  it("`sonner` cru só nas 3 portas documentadas", () => {
    // layout = <Toaster/> de infraestrutura; nexus-toast = a porta única;
    // deliver = runtime de servidor que não roda no browser.
    const permitidos = new Set([
      "app/layout.tsx",
      "components/nexus-ui/feedback/nexus-toast.ts",
      "lib/notifications/deliver.ts",
    ]);
    expect(onde(/from ["']sonner["']/).filter((rel) => !permitidos.has(rel))).toEqual([]);
  });
});

describe("item 4 — tabelas cruas só nas exceções declaradas", () => {
  it("nenhum `<table>` novo fora de `ui/table`, impressão e galeria", () => {
    // `<table` minúsculo = elemento HTML cru; `<Table` (case-sensitive) é a
    // primitiva canônica. Exceções do inventário §3: visual de impressão e
    // a galeria de tokens do /design.
    const permitidos = new Set([
      "components/ui/table.tsx",
      "app/app/pedidos/imprimir/_imprimir.tsx",
      "app/design/sections/SectionTokens.tsx",
    ]);
    expect(onde(/<table/).filter((rel) => !permitidos.has(rel))).toEqual([]);
  });
});

describe("itens 10-11 — espaçamento e cores sem literais fora da escala", () => {
  it("nenhum valor arbitrário de espaçamento (`p-[`, `m-[`, `gap-[`)", () => {
    // escala única §15 = classes da grade Tailwind (múltiplos de 4px);
    // `text-[`/`bg-[` não entram aqui: tipografia tem papel próprio e o
    // seletor de cor da marca é o dado, medido na spec de DOM.
    // Exceção: `env(safe-area-inset-bottom)` não é escolha de espaçamento —
    // é o inset dinâmico do iOS, que nenhum valor da escala expressa.
    const arbitrarios = onde(
      /\b(?:p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y)-\[([^\]]*)\]/,
    ).filter((rel) => {
      const fonte = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      for (const m of fonte.matchAll(
        /\b(?:p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y)-\[([^\]]*)\]/g,
      )) {
        if (!m[1]?.startsWith("env(")) return true;
      }
      return false;
    });
    expect(arbitrarios).toEqual([]);
  });

  it("nenhum hex literal embutido em classe", () => {
    expect(onde(/\b(bg|text|border|ring|fill|stroke|outline|shadow)-#/)).toEqual([]);
  });
});

describe("item 8 — animação só do catálogo (§16: nunca atrase o usuário)", () => {
  it("nenhuma `animate-` fora do catálogo Tailwind nem keyframe arbitrário", () => {
    // Exceção declarada: o avatar do assistente tem dois keyframes próprios
    // em `globals.css` (`assistente-pulo` 0.38s, `assistente-pisca` 0.16s) —
    // curtos, sutis e do produto (o FAB flutuante); a regra existe para
    // keyframe arbitrário NÃO virar padrão em novas telas.
    const comKeyframeProprio = new Set(["components/assistente/AssistenteAvatar.tsx"]);
    const catalogo =
      /^(none|spin|ping|pulse|bounce|fade|slide|zoom|accordion|in|out)(-[a-z]+)*$/;
    const culpados: string[] = [];
    for (const rel of arquivos) {
      if (comKeyframeProprio.has(rel)) continue;
      const fonte = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      if (/animate-\[/.test(fonte)) culpados.push(`${rel} (keyframe arbitrário)`);
      for (const m of fonte.matchAll(/animate-([a-z-]+)/g)) {
        if (!catalogo.test(m[1] ?? "")) culpados.push(`${rel} (animate-${m[1]})`);
      }
    }
    expect(culpados).toEqual([]);
  });
});
