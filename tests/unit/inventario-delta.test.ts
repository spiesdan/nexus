/**
 * O DELTA DO INVENTÁRIO TEM QUE FECHAR COM O CÓDIGO.
 *
 * "440 route.ts hoje vs 419 em 18/11" só é afirmação se os dois números vierem
 * de comando e as rotas novas estiverem nomeadas. Aqui o baseline é a lista
 * versionada de caminhos, o fim é contado do checkout, e o doc gerado precisa
 * casar com os dois — sem isso a tabela vira prosa envelhecida.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

function arquivos(dir: string, fim: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...arquivos(caminho, fim));
    else if (entrada.name.endsWith(fim)) saida.push(relative(process.cwd(), caminho));
  }
  return saida;
}

const baseline = readFileSync(
  "scripts/auditoria/inventario-baseline-1711.txt",
  "utf8",
)
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
const agora = arquivos("app/api", "route.ts").sort();
const doc = readFileSync("docs/auditoria/inventario-rotas.md", "utf8");
const secao = doc.slice(doc.indexOf("## Delta de handlers"), doc.indexOf("## Layouts"));

describe("recontagem de rotas da API", () => {
  it("o baseline é a lista medido de 17/11, não um número decorado", () => {
    expect(baseline).toHaveLength(419);
  });

  it("a contagem viva bate com o fim do delta no doc gerado", () => {
    expect(secao).toContain(`(${baseline.length} → ${agora.length})`);
    // 419 → 449: aceite do motorista, checkout, orcamentos-parados, relatorio
    // de gastos, a tela de colisoes do Mercos (0344) e o cron da reconciliação.

    expect(agora.length - baseline.length).toBe(30);
  });

  it("toda rota nova está nomeada no doc, com área e motivo", () => {
    const novas = agora.filter((caminho) => !baseline.includes(caminho));
    expect(novas).toHaveLength(30);
    for (const caminho of novas) {
      // O doc mostra a rota HTTP, não o caminho do arquivo; o sufixo é o que
      // distingue [id]/revoke, correcao/conversa/simular etc.
      const sufixo = caminho.replace(/^app\/api/, "").replace(/\/route\.ts$/, "");
      expect(secao, `rota nova sem linha no doc: ${caminho}`).toContain(sufixo.replace(/\[([^\]]+)\]/g, ":$1"));
    }
    expect(secao).toContain("Sentinel — conversa");
    expect(secao).toContain("Offline — credencial");
    expect(secao).toContain("Observabilidade — painel");
    expect(secao).toContain("Expedição — aceite do motorista");
    expect(secao).toContain("Prospecção — relatório");
    expect(secao).toContain("Mercos — colisões");
    expect(secao).toContain("Mercos — reconciliação");
    expect(secao).toContain("Prospecção — gastos da campanha");
    expect(secao).toContain("Configuração — formas de pagamento");
    expect(secao).toContain("/api/v1/payment-methods");
    expect(secao).toContain("Nenhuma rota removida");
  });
});
