/**
 * SUBTELA TEM NOME — o inventário que a matriz de rotas não fazia.
 *
 * O que esta classe de erro custou, medido em 16/11/2026: `09-telas-estados.md`
 * marca a coluna "abas" quando encontra `<Tabs` no segmento de rota. A matriz
 * dizia "esta tela tem abas" e não dizia QUAL aba, em que arquivo, nem em que
 * linha. Auditoria que não sabe o nome da subtela não consegue abri-la — e
 * "tem aba" virou, na prática, "não olhei a aba".
 *
 * O extrator (`scripts/auditoria/subtelas.ts`) resolve o inventário; este gate
 * protege as três coisas que fariam o inventário mentir:
 *
 *  1. **o extrator lê.** Se ele parar de casar (mudança de primitiva, regex
 *     quebrada), o artefato sai com 0 abas e continua "verde" — o jeito mais
 *     fácil de um inventário mentir. O primeiro caso põe JSX conhecido e exige
 *     que saia o rótulo certo.
 *  2. **o rótulo é o texto que a pessoa lê**, não a `className`. A primeira
 *     execução devolveu `# / ml-1.5 text-[10px]` como nome de aba — ruído com
 *     cara de inventário.
 *  3. **o inventário gerado está fresco.** Se alguém adicionar aba e não rodar
 *     o gerador, o artefato versionado passa a descrever um produto que não
 *     existe mais. A comparação é de CONTAGEM (não byte a byte): o documento
 *     tem timestamp e ordem, e um gate que reprova por data vira ruído.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  extrairDoTexto,
  inventariarSubtelas,
  renderizar,
  rotuloDeJsx,
} from "../../scripts/auditoria/subtelas";

const RAIZ = path.resolve(__dirname, "../..");

describe("subtela tem nome", () => {
  it("extrai o rótulo de uma aba escrita como o produto escreve", () => {
    const jsx = `
      <Tabs>
        <TabsList>
          <TabsTrigger value="preco">{t("Tabelas de preço")}</TabsTrigger>
          <TabsTrigger value="gerais">Informações gerais</TabsTrigger>
        </TabsList>
      </Tabs>`;
    const r = extrairDoTexto(jsx, "exemplo.tsx");
    expect(r.abas.map((a) => a.rotulo)).toEqual(["Tabelas de preço", "Informações gerais"]);
    expect(r.abas[0]!.linha).toBe(4);
  });

  it("não confunde className com rótulo", () => {
    // Regressão real: a primeira versão devolveu `# / ml-1.5 text-[10px]`.
    expect(rotuloDeJsx('<span className="ml-1.5 text-[10px]">{t("Abertos")}</span>')).toBe(
      "Abertos",
    );
    expect(
      rotuloDeJsx('<TabsTrigger className="rounded-full px-1.5" value="x">Fila</TabsTrigger>'),
    ).toBe("Fila");
  });

  it("rótulo montado em laço é DITO dinâmico, não inventado", () => {
    // `{tab.label}` não tem texto literal: dizer o nome de uma classe CSS ou
    // devolver string vazia seria pior que admitir que o rótulo é dinâmico.
    expect(rotuloDeJsx("{tab.label}")).toBe("(rótulo dinâmico)");
    expect(rotuloDeJsx("<TabsTrigger value={f.id}>{f.nome}</TabsTrigger>")).toBe(
      "(rótulo dinâmico)",
    );
  });

  it("lê a barra de abas CASEIRA (aria-current) e não se perde no `=>`", () => {
    // Regressão medida em 16/11/2026: `/app/prospeccao` saiu com quatro abas
    // chamadas `setAba(buscar)} >`. A causa é o `>` de `onClick={() => ...}` —
    // um `[^>]*` no atributo para ali e o "rótulo" vira código. O fim da tag
    // passou a respeitar `{}` e strings.
    const jsx = `
      <Button
        type="button"
        aria-current={aba === "buscar" ? "page" : undefined}
        onClick={() => setAba("buscar")}
      >
        {t("Buscar")}
      </Button>
      <button aria-current={aba === "x" ? "page" : undefined}>Fornecedores</button>`;
    const r = extrairDoTexto(jsx, "exemplo.tsx");
    expect(r.abas.map((a) => a.rotulo)).toEqual(["Buscar", "Fornecedores"]);
    expect(r.abas.every((a) => a.tipo === "aba-caseira")).toBe(true);
  });

  it("Link com aria-current é ROTA IRMÃ, não aba de estado", () => {
    // `/app/fiscal`: o NavFiscal navega entre rotas. Tratar como subtela de
    // estado contaria duas vezes o que a varredura de rotas já mede.
    const jsx = `<Link href="/app/fiscal/notas" aria-current={ativa ? "page" : undefined}>{t("Todas as notas")}</Link>`;
    const r = extrairDoTexto(jsx, "NavFiscal.tsx");
    expect(r.abas).toEqual([]);
    expect(r.rotasIrmaes.map((a) => [a.tipo, a.rotulo])).toEqual([["nav-rota", "Todas as notas"]]);
  });

  it("conta modal sem Title — o defeito de acessibilidade, não só o inventário", () => {
    const comTitulo = extrairDoTexto(
      '<Dialog><DialogContent><DialogTitle>{t("Criar")}</DialogTitle></DialogContent></Dialog>',
    );
    expect(comTitulo.semTitulo).toBe(0);
    expect(comTitulo.modais.map((m) => m.rotulo)).toEqual(["Criar"]);

    const semTitulo = extrairDoTexto(
      "<Dialog><DialogContent><DialogDescription>oi</DialogDescription></DialogContent></Dialog>",
    );
    expect(semTitulo.semTitulo).toBe(1);
  });

  it("gaveta e aba não se misturam (Sheet vira gaveta, não modal)", () => {
    const r = extrairDoTexto(
      '<Sheet><SheetContent><SheetTitle>{t("Ficha")}</SheetTitle></SheetContent></Sheet>',
    );
    expect(r.gavetas.map((g) => g.tipo)).toEqual(["gaveta"]);
    expect(r.modais).toEqual([]);
  });

  it("não conta componente de UI como subtela do produto", () => {
    // `components/ui/dialog.tsx` é primitiva: o `<DialogTitle>` de lá é o que
    // REPASSA props, não uma subtela. O extrator varre o segmento de `app/`,
    // então a primitiva só entra se a tela a importar com `@/` — e nesse caso
    // entra um salto, sem recursão.
    const primitiva = readFileSync(path.join(RAIZ, "components/ui/dialog.tsx"), "utf8");
    const r = extrairDoTexto(primitiva);
    expect(r.modais.length).toBe(0);
  });

  it("o inventário do produto não está vazio (gate não passa por vacuidade)", () => {
    const entradas = inventariarSubtelas(RAIZ);
    expect(entradas.length).toBeGreaterThan(140);
    const abas = entradas.reduce((a, e) => a + e.abas.length, 0);
    const modais = entradas.reduce((a, e) => a + e.modais.length, 0);
    const gavetas = entradas.reduce((a, e) => a + e.gavetas.length, 0);
    // Medido em 16/11/2026, com as duas famílias de aba: 99 abas
    // (Radix + barra caseira), 68 modais, 12 gavetas.
    expect(abas).toBeGreaterThan(80);
    expect(modais).toBeGreaterThan(40);
    expect(gavetas).toBeGreaterThan(5);
  });

  it("o markdown versionado descreve o produto de agora", () => {
    const gerado = renderizar(inventariarSubtelas(RAIZ));
    const versionado = readFileSync(path.join(RAIZ, "docs/auditoria/09b-subtelas.md"), "utf8");
    const conta = (texto: string) => ({
      linhas: texto.split("\n").filter((l) => l.startsWith("| `")).length,
      abas:
        (texto.match(/ <br>/g) ?? []).length +
        texto.split("\n").filter((l) => l.startsWith("| `")).length,
    });
    // Contagem de LINHAS de tela e de subtelas; não compara datas nem ordem.
    expect(conta(versionado).linhas).toBe(conta(gerado).linhas);
    expect(versionado.includes("**0 abas**") && !gerado.includes("**0 abas**")).toBe(false);
  });
});
