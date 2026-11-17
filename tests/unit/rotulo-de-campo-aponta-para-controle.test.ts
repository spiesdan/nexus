/**
 * `<label>` PRECISA APONTAR PARA O CAMPO — ou embrulhá-lo.
 *
 * POR QUE ESTE GATE EXISTE
 *
 * Em 16/11/2026 a captura contra build de produção mediu, em `/app/audit`, dois
 * `input[type=datetime-local]` de 204×40 px sem nenhum nome acessível:
 *
 *     <label className="block ...">{t("De")}</label>
 *     <Input type="datetime-local" value={from} onChange={...} />
 *
 * O texto estava certo na tela. O que faltava era o vínculo: `<label>` sem
 * `htmlFor` e `<input>` sem `id` são dois elementos vizinhos, não um campo
 * rotulado. Um leitor de tela anuncia "campo de data" e quem navega por
 * formulário com teclado não ouve "De" nem "Até".
 *
 * Nenhum teste via isso: o campo é desenhado, o label é desenhado, e a tela
 * "está bonita". Só abrindo a página com um leitor de tela — ou contando a
 * árvore de acessibilidade, que foi o que a captura fez.
 *
 * O QUE ELE VIGIA
 *
 * Toda tag `<label` em `app/` e `components/` precisa de UMA das três coisas:
 *
 *   1. `htmlFor="..."` — associação explícita;
 *   2. um controle DENTRO dela — `<label><input /></label>`, que rotula por
 *      embrulhamento (padrão legítimo e usado no produto);
 *   3. `id` + um controle que aponte para esse `id` com `aria-labelledby` —
 *      o caso de `Select` do Radix, cujo controle é um `<button role=combobox>`
 *      e não aceita `htmlFor` de forma confiável entre leitores de tela.
 *
 * NÃO ENTRA
 *
 * - `app/design/**`: maquete estática do design system, não superfície do produto.
 * - `components/ui/label.tsx`: é o primitivo que repassa `htmlFor` por `{...props}`.
 * - comentários: o gate apaga comentários antes de ler, senão um comentário que
 *   CITA `<label>` vira violação (aconteceu na primeira versão).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");

const IGNORAR_DIR = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  "__snapshots__",
]);

/** Arquivos que LEGITIMAMENTE desenham `<label>` sem saber o alvo. */
const IGNORAR_ARQUIVO = new Set(["components/ui/label.tsx"]);

/** O que conta como "controle rotulável" dentro de um `<label>`. */
const CONTROLE =
  /<(Input|input|select|textarea|Textarea|Select|SelectTrigger|Checkbox|Switch|RadioGroup|RadioGroupItem|NativeSelect)\b/;

/** Apaga comentários preservando as quebras de linha (para o relatório acertar a linha). */
export function semComentarios(texto: string): string {
  let saida = "";
  let i = 0;
  const n = texto.length;
  while (i < n) {
    const c = texto[i];
    const d = texto[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && texto[i] !== "\n") {
        saida += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && d === "*") {
      saida += "  ";
      i += 2;
      while (i < n && !(texto[i] === "*" && texto[i + 1] === "/")) {
        saida += texto[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < n) {
        saida += "  ";
        i += 2;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const aspa = c;
      saida += c;
      i++;
      while (i < n) {
        if (texto[i] === "\\") {
          saida += texto.slice(i, i + 2);
          i += 2;
          continue;
        }
        saida += texto[i];
        if (texto[i] === aspa) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    saida += c;
    i++;
  }
  return saida;
}

function fontes(dir: string, achados: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    if (IGNORAR_DIR.has(item)) continue;
    const completo = path.join(dir, item);
    if (statSync(completo).isDirectory()) {
      if (path.relative(RAIZ, completo).split(path.sep).join("/") === "app/design") continue;
      fontes(completo, achados);
    } else if (/\.tsx$/.test(item) && !/\.test\.tsx$/.test(item)) {
      const rel = path.relative(RAIZ, completo).split(path.sep).join("/");
      if (!IGNORAR_ARQUIVO.has(rel)) achados.push(completo);
    }
  }
  return achados;
}

export interface RotuloAnalisado {
  arquivo: string;
  linha: number;
  texto: string;
  /** Como o rótulo se liga ao campo. */
  vinculo: "htmlFor" | "embrulha" | "aria-labelledby" | "nenhum";
}

/** Analisa TODOS os `<label>` do produto e diz como cada um se liga ao campo. */
export function analisarRotulos(): RotuloAnalisado[] {
  const arquivos = [...fontes(path.join(RAIZ, "app")), ...fontes(path.join(RAIZ, "components"))];
  const resultado: RotuloAnalisado[] = [];

  for (const arquivo of arquivos) {
    const bruto = readFileSync(arquivo, "utf8");
    const fonte = semComentarios(bruto);
    const rel = path.relative(RAIZ, arquivo).split(path.sep).join("/");

    const re = /<label\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fonte)) !== null) {
      const inicio = m.index;
      const fimTag = fonte.indexOf(">", inicio);
      if (fimTag < 0) continue;
      const attrs = fonte.slice(inicio, fimTag + 1);
      const linha = fonte.slice(0, inicio).split("\n").length;

      // Corpo do label: até o `</label>` balanceado.
      let corpo = "";
      if (!/\/>$/.test(attrs)) {
        let i = fimTag + 1;
        let profundidade = 1;
        while (i < fonte.length && profundidade > 0) {
          const abre = fonte.indexOf("<label", i);
          const fecha = fonte.indexOf("</label>", i);
          if (fecha < 0) break;
          if (abre >= 0 && abre < fecha) {
            profundidade++;
            i = abre + 6;
            continue;
          }
          if (profundidade === 1) corpo += fonte.slice(i, fecha);
          profundidade--;
          i = fecha + 8;
        }
      }

      const idDoLabel = /\bid="([^"]+)"/.exec(attrs)?.[1] ?? null;
      let vinculo: RotuloAnalisado["vinculo"] = "nenhum";
      if (/\bhtmlFor=/.test(attrs)) vinculo = "htmlFor";
      else if (CONTROLE.test(corpo)) vinculo = "embrulha";
      else if (idDoLabel && fonte.includes(`aria-labelledby="${idDoLabel}"`))
        vinculo = "aria-labelledby";

      resultado.push({
        arquivo: rel,
        linha,
        texto: corpo.replace(/\s+/g, " ").trim().slice(0, 60),
        vinculo,
      });
    }
  }
  return resultado;
}

describe("rótulo de campo aponta para o controle", () => {
  it("todo <label> tem htmlFor, embrulha o campo ou é alvo de aria-labelledby", () => {
    const soltos = analisarRotulos()
      .filter((r) => r.vinculo === "nenhum")
      .map((r) => `${r.arquivo}:${r.linha} — "${r.texto}"`);
    expect(soltos).toEqual([]);
  });

  it("o analisador realmente lê os rótulos (gate não é vazio)", () => {
    // Sem isto, uma mudança que quebrasse o scanner deixaria o teste acima
    // verde com zero rótulos lidos — o jeito mais fácil de um gate mentir.
    // Medido em 16/11/2026: 101 rótulos em 53 arquivos — 73 por embrulhamento,
    // 26 por `htmlFor`, 2 por `aria-labelledby`. Os pisos abaixo ficam folgados
    // de propósito: eles provam que o scanner lê, não congelam o inventário.
    const todos = analisarRotulos();
    expect(todos.length).toBeGreaterThan(80);
    expect(todos.filter((r) => r.vinculo === "embrulha").length).toBeGreaterThan(50);
    expect(todos.filter((r) => r.vinculo === "htmlFor").length).toBeGreaterThan(15);
  });

  it("o comentário que cita <label> não vira violação", () => {
    // Regressão da primeira versão do gate: `app/pedidos/_periodo.tsx` explica
    // o padrão num comentário (`<label>` de verdade cada campo diz o que é) e
    // era acusado como rótulo solto.
    const periodo = analisarRotulos().filter((r) => r.arquivo === "app/app/pedidos/_periodo.tsx");
    expect(periodo.every((r) => r.vinculo !== "nenhum")).toBe(true);
  });
});
