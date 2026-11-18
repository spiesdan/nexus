/**
 * A DENSIDADE TEM DOIS LUGARES — E ELES NÃO PODEM DIVERGIR.
 *
 * ─── O QUE FOI MEDIDO (18/11/2026) ────────────────────────────────────────
 *
 * `grep -rn "var(--density-\*)" app components lib` devolve **zero** no produto:
 * as quatro variáveis de densidade do `app/globals.css` (`--density-row/gap/
 * px/py`) não são lidas por componente nenhum. Quem decide a densidade de
 * verdade é `lib/nexus/tokens.ts` (`tableRowHeight: 56`, `tableGap: 24`,
 * `tablePaddingX: 20`, `tablePaddingY: 16`) e as classes dos componentes.
 *
 * Isso deixa duas opções ruins e uma boa:
 *
 *   - apagar as variáveis: a densidade deixa de ser legível junto dos outros
 *     tokens no único arquivo onde alguém procura por ela;
 *   - deixá-las soltas: é o defeito que este repositório já pagou com
 *     `--color-border-strong`, que era LITERALMENTE igual a `--color-border` —
 *     um token sem efeito que parecia hierarquia;
 *   - declará-las como ESPELHO e vigiar o par. É esta.
 *
 * O teste compara, número por número: mudar a densidade no CSS sem mudar o TS
 * (ou o contrário) reprova aqui, em vez de virar duas verdades que só divergem
 * quando alguém mede a tela. Mesmo padrão de `lib/branding/regua-do-produto.ts`.
 *
 * ─── POR QUE TAMBÉM O Z-INDEX ─────────────────────────────────────────────
 *
 * Pelo mesmo motivo: `--z-*` também não tem consumidor em CSS — quem ordena
 * camada é `nexusTokens.zIndex` e os utilitários `z-10/z-20/...`. Se um dos
 * dois lados mudar sozinho, a escala de camadas passa a ter duas versões.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { nexusTokens } from "@/lib/nexus/tokens";

const RAIZ = process.cwd();
const CSS = fs.readFileSync(path.join(RAIZ, "app", "globals.css"), "utf8");

function bloco(seletor: string): string {
  const rx = new RegExp(`^${seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m");
  const i = CSS.search(rx);
  if (i < 0) throw new Error(`não achei \`${seletor}\` em globals.css`);
  return CSS.slice(i, CSS.indexOf("\n}", i));
}

/** `--nome: 56px;` (ou `--nome: 30;` para z-index) → { nome: valor }. */
function pxDoBloco(texto: string, prefixo: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const achado of texto.matchAll(
    new RegExp(`(${prefixo}[a-z-]+)\\s*:\\s*([0-9]+)(?:px)?\\s*;`, "g"),
  )) {
    m.set(achado[1]!, Number(achado[2]));
  }
  return m;
}

const RAIZ_CSS = bloco(":root");

describe("densidade: o CSS é espelho do TypeScript", () => {
  const densidade = pxDoBloco(RAIZ_CSS, "--density-");

  it("as quatro variáveis existem (guarda de vacuidade)", () => {
    expect(densidade.size).toBe(4);
  });

  it("cada valor bate com `nexusTokens`", () => {
    expect(densidade.get("--density-row")).toBe(nexusTokens.tableRowHeight);
    expect(densidade.get("--density-gap")).toBe(nexusTokens.tableGap);
    expect(densidade.get("--density-px")).toBe(nexusTokens.tablePaddingX);
    expect(densidade.get("--density-py")).toBe(nexusTokens.tablePaddingY);
  });

  it("nenhum componente lê `var(--density-*)` — é espelho, e o teste diz isso", () => {
    // Se um dia um componente passar a consumir a variável, este caso falha e
    // obriga a atualizar o comentário do `globals.css`: o token deixa de ser
    // espelho e vira mecanismo. Falhar aqui é o aviso, não um defeito.
    const fontes: string[] = [];
    const andar = (dir: string) => {
      for (const nome of fs.readdirSync(path.join(RAIZ, dir))) {
        if (nome === "node_modules" || nome.startsWith(".")) continue;
        const rel = path.join(dir, nome);
        const abs = path.join(RAIZ, rel);
        if (fs.statSync(abs).isDirectory()) andar(rel);
        else if (/\.(tsx|ts|css)$/.test(nome) && !nome.includes(".test.")) fontes.push(rel);
      }
    };
    andar("app");
    andar("components");
    andar("lib");

    const consumidores = fontes.filter((f) =>
      /var\(\s*--density-/.test(fs.readFileSync(path.join(RAIZ, f), "utf8")),
    );
    // `app/globals.css` declara, não consome. O showcase (`app/design`) usa as
    // PRÓPRIAS variáveis (`--density-row-h`), que são outras.
    expect(consumidores.filter((f) => f !== "app/globals.css" && !f.startsWith("app/design"))).toEqual(
      [],
    );
  });
});

describe("z-index: o CSS é espelho do TypeScript", () => {
  it("cada camada declarada bate com `nexusTokens.zIndex`", () => {
    const z = pxDoBloco(RAIZ_CSS, "--z-");
    expect(z.size).toBeGreaterThan(0);
    for (const [nome, valor] of z) {
      const chave = nome.replace("--z-", "") as keyof typeof nexusTokens.zIndex;
      expect(nexusTokens.zIndex[chave], `${nome} não existe em nexusTokens.zIndex`).toBe(valor);
    }
  });
});
