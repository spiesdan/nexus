/**
 * LINK PARA ARQUIVO ESTÁTICO PRECISA EXISTIR EM `public/`.
 *
 * POR QUE ESTE GATE EXISTE
 *
 * Em 16/11/2026 a captura de `/admin/platform-admins` registrou, nas duas
 * larguras, `Failed to load resource: 404` — e o 404 era real:
 *
 *     GET /runbook/platform-admin-management.md → 404
 *
 * O aviso `DBAOnlyNotice` oferece "Ver runbook →" apontando para um caminho que
 * nunca existiu no repositório (`public/runbook/` não existia). A tela não
 * quebra — ela só oferece, em destaque, um link que não leva a lugar nenhum.
 * Nenhum teste olhava para isso porque nenhum teste abre a tela e clica.
 *
 * O QUE ELE VIGIA
 *
 * Todo `href="/algo.ext"` com EXTENSÃO é arquivo servido de `public/`: se o
 * arquivo não está lá, o link é 404 no produto. Rota da aplicação (`/app/...`,
 * `/admin/...`) é responsabilidade do App Router e não entra aqui — cobrar isso
 * exigiria reimplementar o roteador no teste.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");

const IGNORAR = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage"]);

function arquivosFonte(dir: string, achados: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    if (IGNORAR.has(item)) continue;
    const completo = path.join(dir, item);
    const st = statSync(completo);
    if (st.isDirectory()) arquivosFonte(completo, achados);
    else if (/\.(tsx|ts)$/.test(item) && !/\.test\.(tsx|ts)$/.test(item)) achados.push(completo);
  }
  return achados;
}

/** `href="/x/y.ext"` e `src="/x/y.ext"` — só o que tem extensão de arquivo. */
const LINK_DE_ARQUIVO = /(?:href|src)=["'](\/[^"'?#]*\.[a-z0-9]{2,5})["'?#]/gi;

export interface LinkDeArquivo {
  arquivo: string;
  link: string;
  existe: boolean;
}

export function linksDeArquivoEstatico(): LinkDeArquivo[] {
  const fontes = [
    ...arquivosFonte(path.join(RAIZ, "app")),
    ...arquivosFonte(path.join(RAIZ, "components")),
  ];
  const vistos = new Map<string, LinkDeArquivo>();
  for (const fonte of fontes) {
    const texto = readFileSync(fonte, "utf8");
    LINK_DE_ARQUIVO.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_DE_ARQUIVO.exec(texto)) !== null) {
      const link = m[1]!;
      if (vistos.has(link)) continue;
      vistos.set(link, {
        arquivo: path.relative(RAIZ, fonte).split(path.sep).join("/"),
        link,
        existe: existsSync(path.join(RAIZ, "public", link.replace(/^\//, ""))),
      });
    }
  }
  return [...vistos.values()];
}

describe("link para arquivo estático", () => {
  it("todo href/src com extensão existe em public/", () => {
    const quebrados = linksDeArquivoEstatico().filter((l) => !l.existe);
    expect(quebrados).toEqual([]);
  });

  it("o runbook do platform-admin existe e é o que a tela aponta", () => {
    // O caso que abriu este gate. Se alguém mover o arquivo, o teste acusa.
    expect(existsSync(path.join(RAIZ, "public/runbook/platform-admin-management.md"))).toBe(true);
    const links = linksDeArquivoEstatico();
    expect(links.map((l) => l.link)).toContain("/runbook/platform-admin-management.md");
  });

  it("não conta caminho de rota da aplicação como link de arquivo", () => {
    // `/app/pedidos` não tem extensão: é rota, não arquivo.
    expect(linksDeArquivoEstatico().map((l) => l.link)).not.toContain("/app/pedidos");
  });
});
