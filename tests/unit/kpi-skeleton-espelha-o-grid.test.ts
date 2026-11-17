/**
 * O ESQUELETO DO KPI TEM DE OCUPAR O MESMO ESPAÇO DO KPI.
 *
 * ─── O DEFEITO, MEDIDO ─────────────────────────────────────────────────────
 *
 * Em `/app/financeiro`, o carregamento desenhava `Skeleton h-24` dentro de
 * `grid grid-cols-2 gap-3 lg:grid-cols-4`: **204 px** no celular. Quando o
 * número chegava, o `NexusKpiGrid` (`grid-cols-1 sm:grid-cols-2
 * xl:grid-cols-4`) media **490 px** — os cartões reais são `p-5` com três
 * linhas de texto. A tela pulava 286 px, e o CLS medido com CPU 4× e rede de
 * 1,6 Mbps foi **0,128**, acima do limite de 0,1 do Core Web Vitals.
 *
 * ─── O QUE ESTE GATE COBRA ─────────────────────────────────────────────────
 *
 * Layout não se mede em jsdom, então o gate cobra a CAUSA do desalinhamento:
 * o esqueleto e o cartão compartilham o quadro e as três linhas de texto (uma
 * definição, dois usos), o esqueleto não crava altura em pixel, e nenhuma tela
 * com `NexusKpiGrid` volta a montar esqueleto de KPI à mão. A medida de CLS
 * antes/depois vive no relatório (V-34), com o artefato ao lado.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const KPI = "components/nexus-ui/kpi/nexus-kpi.tsx";
const INDICE = "components/nexus-ui/index.ts";

const fonte = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf8");
const codigo = fonte(KPI);
const esqueleto = codigo.slice(codigo.indexOf("export function NexusKpiSkeleton"));
const cartao = codigo.slice(
  codigo.indexOf("export function NexusKpi("),
  codigo.indexOf("export function NexusKpiGrid("),
);

/** `const NOME = "...";` — a definição única de uma classe compartilhada. */
const definicao = (nome: string) =>
  codigo.match(new RegExp(`const ${nome} = "([^"]+)";`))?.[1] ?? "";

/** Todos os `.tsx` de `app/` e `components/`, recursivo. */
function arquivosTsx(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(join(RAIZ, dir))) {
    const relativo = join(dir, nome);
    const absoluto = join(RAIZ, relativo);
    if (statSync(absoluto).isDirectory()) {
      if (nome === "node_modules" || nome.startsWith(".")) continue;
      saida.push(...arquivosTsx(relativo));
    } else if (nome.endsWith(".tsx")) {
      saida.push(relativo);
    }
  }
  return saida;
}

describe("NexusKpiSkeleton espelha o cartão de KPI", () => {
  it("o quadro do cartão é UM só — definido e usado pelo valor e pelo esqueleto", () => {
    const quadro = definicao("QUADRO_DO_KPI");
    // `p-5` é o que dá os 40 px de padding que o esqueleto tem de reservar.
    expect(quadro).toContain("p-5");
    // Escrito à mão no esqueleto, o quadro volta a divergir sem ninguém notar.
    expect(codigo.split(quadro).length - 1).toBe(1);
    expect(cartao).toContain("QUADRO_DO_KPI");
    expect(esqueleto).toContain("QUADRO_DO_KPI");
  });

  it.each(["TEXTO_DO_ROTULO", "TEXTO_DO_VALOR", "TEXTO_DO_RODAPE"])(
    "%s: uma definição, usada pelo cartão real e pelo esqueleto",
    (nome) => {
      const classe = definicao(nome);
      expect(classe.length, `${nome} não definida`).toBeGreaterThan(0);
      expect(codigo.split(classe).length - 1, `${nome} repetida à mão`).toBe(1);
      expect(cartao, `o cartão real não usa ${nome}`).toContain(nome);
      expect(esqueleto, `o esqueleto não usa ${nome}`).toContain(nome);
    },
  );

  it("não crava altura de linha em pixel — a métrica vem da fonte", () => {
    // `h-5`/`h-8` foram a primeira tentativa e erraram 3 px por cartão
    // (102 px contra 99 px): retângulo com altura fixa não adivinha `line-height`.
    expect(esqueleto).not.toMatch(/\bh-\d+(\.\d+)?\b/);
    expect(esqueleto).not.toMatch(/\bh-\[[^\]]+\]/);
  });

  it("a linha de comparação só entra quando o cartão real tem", () => {
    expect(esqueleto).toContain("comRodape = false");
    expect(esqueleto).toMatch(/\{comRodape \? \(/);
  });

  it("é decorativo para leitor de tela e está exportado no índice", () => {
    expect(esqueleto).toContain("aria-hidden");
    expect(fonte(INDICE)).toContain("NexusKpiSkeleton,");
  });
});

describe("nenhuma tela com NexusKpiGrid faz esqueleto de KPI à mão", () => {
  const todos = arquivosTsx("app").concat(arquivosTsx("components"));

  it("há telas usando o grid (o teste não está passando por vacuidade)", () => {
    const comGrid = todos.filter((arquivo) => /\bNexusKpiGrid\b/.test(fonte(arquivo)));
    expect(comGrid.length).toBeGreaterThan(0);
  });

  it.each(todos)("%s", (arquivo) => {
    const fonte_ = fonte(arquivo);
    if (!/\bNexusKpiGrid\b/.test(fonte_)) return;
    // O grid divergente do defeito: 2 colunas no celular com `h-24`.
    const temEsqueletoAntigo =
      /grid-cols-2 gap-3 lg:grid-cols-4/.test(fonte_) && /Skeleton[^>]*h-24/.test(fonte_);
    expect(temEsqueletoAntigo, `${arquivo}: esqueleto de KPI com grid divergente`).toBe(false);
    // Quem carrega grid de KPI precisa do esqueleto do próprio grid.
    if (/<Skeleton\b/.test(fonte_)) {
      expect(fonte_, `${arquivo}: usa Skeleton mas não NexusKpiSkeleton`).toContain(
        "NexusKpiSkeleton",
      );
    }
  });
});
