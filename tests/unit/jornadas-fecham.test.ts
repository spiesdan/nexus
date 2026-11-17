/**
 * AS 16 JORNADAS DO PROMPT TÊM ENDEREÇO — toda spec é de uma jornada ou diz por que não é.
 *
 * ─── O QUE ESTE GATE IMPEDE ────────────────────────────────────────────────
 *
 * A Fase 2 do prompt exige mapear **16 jornadas** e "confirmar no código quais
 * jornadas existem e seu estado real". O modo fácil de parecer que isso foi
 * feito é escrever uma tabela bonita em `13-jornadas.md` citando alguns nomes de
 * spec. O modo honesto é o mapa ser **total**: cada uma das 99 specs do disco
 * aparece em uma jornada ou em `TRANSVERSAIS`, com motivo escrito.
 *
 * Sem isso, uma spec nova entra (ou uma antiga é renomeada) e a tabela continua
 * verde descrevendo um produto que não existe — cobertura parcial que se lê
 * como total. Foi exatamente o defeito que o gate do `e2e.yml`
 * (`FORA_DO_CI` com motivo) já evita para o CI, e aqui é o mesmo princípio
 * aplicado à jornada.
 *
 * ─── O QUE ELE **NÃO** PROVA ──────────────────────────────────────────────
 *
 * Que a jornada está coberta. Estar mapeada é ter endereço; cobertura é o que a
 * seção de cada jornada diz, com o que cada spec declara medir — e o que fica
 * descoberto está escrito lá, não deduzido daqui.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { JORNADAS, TRANSVERSAIS, contarNoSpec, tabela } from "../../scripts/auditoria/jornadas";

const RAIZ = path.resolve(__dirname, "../..");

const NO_DISCO = readdirSync(path.join(RAIZ, "tests/e2e"))
  .filter((f) => f.endsWith(".spec.ts"))
  .map((f) => f.replace(".spec.ts", ""))
  .sort();

describe("as 16 jornadas do prompt fecham com as specs do disco", () => {
  it("o prompt pede 16 jornadas e o mapa tem 16, numeradas J1..J16", () => {
    expect(JORNADAS.length).toBe(16);
    expect(JORNADAS.map((j) => j.id)).toEqual(Array.from({ length: 16 }, (_, i) => `J${i + 1}`));
  });

  it("toda spec citada numa jornada existe no disco", () => {
    const citadas = JORNADAS.flatMap((j) => j.specs);
    const fantasmas = citadas.filter((s) => !NO_DISCO.includes(s));
    // Spec citada que não existe é o erro mais fácil de cometer ao organizar a
    // tabela à mão: o nome "parece" certo, e o leitor do documento acredita.
    expect(fantasmas).toEqual([]);
  });

  it("toda spec do disco tem jornada ou motivo escrito em TRANSVERSAIS", () => {
    const mapeadas = new Set([
      ...JORNADAS.flatMap((j) => j.specs),
      ...JORNADAS.flatMap((j) => j.outroWorkflow?.specs ?? []),
      ...Object.keys(TRANSVERSAIS),
    ]);
    const semEndereco = NO_DISCO.filter((s) => !mapeadas.has(s));
    expect(
      semEndereco,
      "spec sem jornada e sem motivo. Ponha em JORNADAS.specs (se ela exercita uma das 16) " +
        "ou em TRANSVERSAIS com o motivo escrito — cobertura parcial silenciosa se lê como total.",
    ).toEqual([]);
  });

  it("todo motivo de TRANSVERSAIS é motivo, não o nome da spec de novo", () => {
    for (const [spec, motivo] of Object.entries(TRANSVERSAIS)) {
      expect(motivo.length, `motivo curto demais para ${spec}`).toBeGreaterThan(10);
      expect(motivo.toLowerCase().trim()).not.toBe(spec.toLowerCase());
    }
  });

  it("nenhuma jornada está vazia — jornada sem spec é jornada não mapeada", () => {
    const vazias = JORNADAS.filter((j) => j.specs.length === 0 && !j.outroWorkflow);
    expect(vazias.map((j) => j.id)).toEqual([]);
  });

  it("spec de outro workflow declara workflow E motivo (não basta estar fora)", () => {
    const fora = JORNADAS.filter((j) => j.outroWorkflow);
    expect(fora.length).toBeGreaterThan(0);
    for (const j of fora) {
      expect(j.outroWorkflow!.workflow.length).toBeGreaterThan(5);
      expect(j.outroWorkflow!.motivo.length).toBeGreaterThan(20);
    }
  });

  it("a contagem de declarados bate com o arquivo (o gerador lê, não estima)", () => {
    // Controle positivo: se `contarNoSpec` parar de casar, ele devolve 0 e a
    // tabela inteira ficaria com "0 declarados" sem nenhum vermelho.
    const auth = contarNoSpec(RAIZ, "auth");
    expect(auth).not.toBeNull();
    expect(auth!.declarados).toBeGreaterThan(2);

    const total = JORNADAS.flatMap((j) => j.specs).reduce(
      (a, s) => a + (contarNoSpec(RAIZ, s)?.declarados ?? 0),
      0,
    );
    // Medido em 16/11/2026: 264 testes declarados nos 96 specs do full.
    expect(total).toBeGreaterThan(200);
  });

  it("a tabela do documento é a tabela do gerador", () => {
    const gerada = tabela(RAIZ).filter((l) => l.startsWith("| "));
    const doc = readFileSync(path.join(RAIZ, "docs/auditoria/13-jornadas.md"), "utf8");
    const inicio = doc.indexOf("<!-- TABELA:INICIO -->");
    const fim = doc.indexOf("<!-- TABELA:FIM -->");
    expect(inicio, "marcador TABELA:INICIO ausente").toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
    const noDoc = doc
      .slice(inicio, fim)
      .split("\n")
      .filter((l) => l.startsWith("| ") && !l.includes("---"));
    const semResultado = gerada.filter((l) => !l.includes("---"));
    // Sem `--log` o gerador imprime "—" nas colunas de resultado; o documento
    // tem os números da execução. Compara-se o que é estável: id, título,
    // nº de specs e nº de declarados.
    // Comparação por CÉLULA, sem espaço: o Prettier alinha as colunas do
    // markdown com padding, e `" # "` ≠ `"#"` reprovava por formatação — não
    // por conteúdo. O que o gate vigia é o conteúdo da tabela.
    const chave = (l: string) =>
      l
        .split("|")
        .slice(1, 5)
        .map((c) => c.trim())
        .join("|");
    expect(noDoc.map(chave)).toEqual(semResultado.map(chave));
  });
});
