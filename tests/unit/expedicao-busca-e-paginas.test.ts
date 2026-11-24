/**
 * Queixa do dono: digitou o número e "os outros ficaram aparecendo"; e não
 * sabia o que tinha marcado. Os dois defeitos eram de RENDER, não de dado.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const painel = ler("app/app/expedicao/[id]/_painel-pedidos.tsx");
const client = ler("app/app/expedicao/[id]/_client.tsx");

describe("painel de pedidos disponíveis", () => {
  it("a lista renderiza o filtro, não a fila inteira", () => {
    expect(painel).toContain("{filtrados.map((p) => {");
    expect(painel).not.toContain("{pedidos.map((p) => {");
  });

  it("mostra quantos resultados e estado vazio com ação", () => {
    expect(painel).toContain('${filtrados.length} ${t("resultados")}');
    expect(painel).toContain("Nenhum pedido com esse termo.");
    expect(painel).toContain('t("Limpar busca")');
  });

  it("busca numérica coloca o número exato no topo", () => {
    expect(painel).toMatch(/\^\\d\+\$/);
    expect(painel).toContain("p.numero === exato || p.numero_mercos === exato");
  });

  it("seleção visível: checkbox, linha marcada, contador e ação com número", () => {
    expect(painel).toContain('className="mt-0.5 h-5 w-5 shrink-0 accent-accent"');
    expect(painel).not.toContain("sr-only");
    expect(painel).toContain("border-accent bg-accent-soft/60");
    expect(painel).toContain('{selecionados.size} {t("selecionados")}');
    expect(painel).toContain('${t("Adicionar")} ${selecionados.size}');
  });
});

describe("três páginas de verdade", () => {
  it("cada seção renderiza só na sua rota", () => {
    expect(client).toContain('{secao === "paradas" && (');
    expect(client).toContain('{secao === "rota" && (');
    expect(client).toContain('{secao === "fechamento" && (');
  });

  it("navegação é link do Next com aria-current, não âncora/aba", () => {
    expect(client).toContain('aria-current={atual ? "page" : undefined}');
    expect(client).not.toContain('aria-label={t("Seções da expedição")}');
    expect(client).not.toContain("irParaEtapa(");
  });

  it("nenhum bloco escondido por CSS", () => {
    expect(client).not.toContain("hidden lg:block");
  });

  it("as três rotas passam a secao correta", () => {
    for (const [arquivo, secao] of [
      ["app/app/expedicao/[id]/page.tsx", 'secao="paradas"'],
      ["app/app/expedicao/[id]/rota/page.tsx", 'secao="rota"'],
      ["app/app/expedicao/[id]/fechamento/page.tsx", 'secao="fechamento"'],
    ] as const) {
      expect(ler(arquivo)).toContain(secao);
    }
  });
});
