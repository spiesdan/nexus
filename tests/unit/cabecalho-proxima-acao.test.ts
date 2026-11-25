import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const client = ler("app/app/expedicao/[id]/_client.tsx");

describe("cabeçalho com próxima ação", () => {
  it("a ação está no cabeçalho, em um lugar só", () => {
    expect(client).toContain("data-testid=\"proxima-acao\"");
    expect(client).toContain("Próxima ação");
    const cartao = client.slice(client.indexOf("Próximo passo"));
    expect(cartao.split("passo.acao").length - 1).toBe(0);
  });

  it("contagem e estado no cabeçalho", () => {
    expect(client).toContain("${itens.length} ${t(\"pedidos\")}");
    expect(client).toContain("${concluidas.length} ${t(\"conferidos\")}");
    expect(client).toContain("${pendentes.length} ${t(\"pendentes\")}");
  });

  it("Resumo é rota própria e vem primeiro na navegação", () => {
    expect(fs.existsSync(path.join(RAIZ, "app/app/expedicao/[id]/resumo/page.tsx"))).toBe(true);
    expect(client).toContain("/resumo`");
    expect(ler("app/app/expedicao/[id]/resumo/page.tsx")).toContain('secao="resumo"');
  });

  it("Nova carga tem três passos com resumo persistente", () => {
    const nova = ler("app/app/expedicao/nova/_client.tsx");
    expect(nova).toContain("Passos da nova carga");
    expect(nova).toContain("Continuar: equipe e veículo");
    expect(nova).toContain("Revisão da carga");
    expect(nova).toContain("aria-current={passo === n ? \"step\" : undefined}");
  });
});
