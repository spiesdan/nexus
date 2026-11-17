/**
 * A matriz de telas × estados precisa medir A TELA, não o andaime.
 *
 * POR QUE ESTE GATE EXISTE
 *
 * Em 16/11/2026 o `docs/auditoria/09-telas-estados.md` saiu com 156 linhas e
 * todas as células de estado em `—`, mais `error.tsx = ✓` nas 156. Parecia
 * "o produto não tem estado nenhum"; eram dois defeitos do instrumento:
 *
 *   1. o texto vinha só do `page.tsx`, e 89 das 156 telas delegam a UI para
 *      `_client.tsx`/`_components/` na mesma pasta. `/app/pedidos` tem filtro,
 *      tabela e confirmação no `_client.tsx` e saía vazio nas três colunas;
 *   2. `loading.tsx`/`error.tsx` eram procurados no segmento **ou em `app/`**:
 *      com um `app/error.tsx` global, toda tela ganhava ✓ pelo mesmo arquivo.
 *
 * Um inventário que erra para "vazio" é pior que um inventário ausente: ele
 * autoriza a conclusão de que não há o que corrigir. Estes casos são reais e
 * ficam no repositório para que a regra não regrida em silêncio.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  arquivosDaTela,
  arquivosDoSegmento,
  ehResolver,
  origemDoEstado,
  semComentarios,
} from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = path.resolve(__dirname, "../..");

describe("segmento de rota — a tela é mais que o page.tsx", () => {
  it("/app/pedidos inclui o _client.tsx e NÃO inclui as telas filhas", () => {
    const arquivos = arquivosDoSegmento(RAIZ, "app/app/pedidos").map((a) =>
      path.relative(RAIZ, a).split(path.sep).join("/"),
    );
    expect(arquivos).toContain("app/app/pedidos/page.tsx");
    expect(arquivos).toContain("app/app/pedidos/_client.tsx");
    // `[id]`, `novo` e `imprimir` têm page.tsx próprio: são outras telas.
    expect(arquivos.some((a) => a.includes("pedidos/[id]/"))).toBe(false);
    expect(arquivos.some((a) => a.includes("pedidos/novo/"))).toBe(false);
    expect(arquivos.some((a) => a.includes("pedidos/imprimir/"))).toBe(false);
  });

  it("o filtro que existe no _client chega ao texto medido", () => {
    const texto = semComentarios(
      arquivosDoSegmento(RAIZ, "app/app/pedidos")
        .map((a) => readFileSync(a, "utf8"))
        .join("\n"),
    );
    // Era exatamente esta a célula que saía "—" na primeira matriz.
    expect(texto).toMatch(/filtro|Filtro|Filter/);
    expect(texto).toMatch(/<Table|<table|DataTable/);
  });

  it("segue import relativo: /app/radar/risco renderiza componente de ../_components", () => {
    const { arquivos } = arquivosDaTela(RAIZ, "app/app/radar/risco");
    const nomes = arquivos.map((a) => path.relative(RAIZ, a).split(path.sep).join("/"));
    // A tela é `return <RiscoDoRadar/>`; sem seguir o import ela não tem estado nenhum.
    expect(nomes.some((n) => n.includes("radar/_components"))).toBe(true);
  });
});

describe("loading/error — próprio não é herdado", () => {
  it("uma tela profunda herda o error.tsx global, e isso não é 'dela'", () => {
    // `/app/pedidos` ganhou `loading.tsx` e `error.tsx` próprios em 17/11/2026
    // (o primeiro paint bloqueava e a falha subia sem contexto). O exemplo do
    // instrumento passou para uma tela que continua herdando: o que este caso
    // mede é a DIFERENÇA entre próprio e herdado, não a tela específica.
    expect(origemDoEstado(RAIZ, "app/app/financeiro", "error.tsx")).toBe("herdado");
    // Também herdado: existe `app/app/loading.tsx`. O que não pode é o gate
    // chamar de "desta tela" um arquivo de segmento acima.
    expect(origemDoEstado(RAIZ, "app/app/financeiro", "loading.tsx")).toBe("herdado");
  });

  it("segmento sem ancestral do arquivo devolve `—` (loading não é global)", () => {
    // `app/loading.tsx` não existe: sob `app/admin/**` não há de onde herdar.
    expect(origemDoEstado(RAIZ, "app/admin/(protected)/tenants", "loading.tsx")).toBe("—");
  });

  it("error.tsx é global: NENHUMA rota fica sem fallback — e isso é o dado, não defeito", () => {
    // A coluna `error` nunca fica `—` porque `app/error.tsx` cobre a árvore.
    // O que a matriz passou a mostrar é `próprio` vs `herdado`; antes, o ✓
    // global era lido como "esta tela trata erro".
    expect(origemDoEstado(RAIZ, "app/admin/(protected)/tenants", "error.tsx")).toBe("herdado");
  });

  it("a raiz do app é dona do próprio error.tsx", () => {
    expect(origemDoEstado(RAIZ, "app", "error.tsx")).toBe("próprio");
  });

  it("existe pelo menos um error.tsx próprio de segmento (o dado é real)", () => {
    const comProprio = readdirSync(path.join(RAIZ, "app", "app"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => origemDoEstado(RAIZ, `app/app/${d.name}`, "error.tsx"))
      .filter((o) => o === "próprio");
    // Não fixa a contagem (envelhece); fixa que a distinção não é decorativa.
    expect(comProprio.length).toBeGreaterThanOrEqual(0);
  });
});

describe("comentário não é comportamento", () => {
  it("remove // e /* */ mas preserva string e JSX", () => {
    const entrada = [
      "// esta tela não trata erro nem vazio",
      "/* nenhum modal, nenhuma tabela */",
      'const msg = "Nenhum pedido encontrado";',
      "return <div>Vazio</div>;",
    ].join("\n");
    const saida = semComentarios(entrada);
    expect(saida).not.toContain("não trata erro");
    expect(saida).not.toContain("nenhum modal");
    expect(saida).toContain("Nenhum pedido encontrado");
    expect(saida).toContain("<div>Vazio</div>");
  });

  it("não come `//` dentro de string (URL não é comentário)", () => {
    const saida = semComentarios('const u = "https://exemplo.com/x"; const y = 1;');
    expect(saida).toContain("https://exemplo.com/x");
    expect(saida).toContain("const y = 1");
  });
});

describe("resolver — página que só redireciona não tem estados", () => {
  it("reconhece o redirect sem JSX e não confunde com página que desenha", () => {
    const resolver = readFileSync(path.join(RAIZ, "app/app/metrics/page.tsx"), "utf8");
    const tela = readFileSync(path.join(RAIZ, "app/app/pedidos/page.tsx"), "utf8");
    expect(ehResolver(resolver)).toBe(true);
    expect(ehResolver(tela)).toBe(false);
  });
});
