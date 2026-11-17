/**
 * TÍTULO DE TELA TEM UM TAMANHO SÓ — a régua que pegou o meu próprio erro.
 *
 * ─── O QUE ACONTECEU, MEDIDO ───────────────────────────────────────────────
 *
 * Em 16/11/2026 a varredura de aceite (`auditoria-aceite-11-itens.spec.ts`, §100)
 * reprovou com seis famílias de título:
 *
 *     H1 24px (97):  quase todo o produto      ← canônico (NexusPageHeader)
 *     H1 sem-h1 (1): /app/ai/agents/new        ← editor de agente SEM título
 *     H1 16px (11):  sr-only (inbox, onboarding)
 *     H1 18px (1):   /app/pedidos/imprimir     ← EU criei, corrigindo a V-08
 *     H1 20px (1):   /app/campanhas            ← text-xl
 *     H1 22px (1):   /design                   ← showcase do DS, escala própria
 *
 * A lição não é "a spec é rígida demais": é que **consertar a ausência de um
 * título é o momento em que alguém inventa um tamanho**. Escrever
 * `<h1 className="text-lg">` no estado vazio parecia certo e introduziu a
 * quarta família do produto. Quem pegou foi uma régua de navegador que já
 * existia — e é caro: ela abre 112 rotas e leva 1,3 min.
 *
 * ─── POR QUE UM GATE ESTÁTICO, E NÃO SÓ A VARREDURA ───────────────────────
 *
 * A varredura roda no full (37 min) e cobre as rotas da lista dela; uma tela
 * nova fora da lista não é medida. Este gate roda em segundos em `test:unit`,
 * olha o CÓDIGO de toda `page.tsx` e de todo componente de tela, e reprova um
 * `<h1>` com tamanho que não seja o canônico — antes de virar família nova.
 *
 * ─── O QUE ELE PERMITE, E POR QUÊ ─────────────────────────────────────────
 *
 *  1. `sr-only`: não é tipografia. Um `<h1>` recortado (`position:absolute`,
 *     1×1 px) existe para o leitor de tela; o `font-size` dele é o herdado.
 *     Medir o tamanho de um texto que ninguém vê seria medir nada — e é o que
 *     explica o bucket de 16 px (inbox, onboarding).
 *  2. `app/design/**`: o showcase do design system, que existe para MOSTRAR a
 *     escala — inclusive a de título. Tem 22 px de propósito e está fora do
 *     produto (a varredura já o trata como exceção em `TABELA_EXCULSA`).
 *  3. `NexusPageHeader` e primitivas: o tamanho canônico mora ali.
 *
 * Tudo o mais — `text-xl`, `text-lg`, `text-[26px]` — reprova. Se um caso
 * legítimo aparecer, ele entra aqui **com o motivo escrito**, e não como
 * exceção anônima.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = path.resolve(__dirname, "../..");

/** O tamanho canônico do título de tela — o de `NexusPageHeader`. */
const TAMANHO_CANONICO = "text-2xl";

/** Classes de tamanho de fonte que o Tailwind aplica a um `<h1>`. */
const CLASSES_DE_TAMANHO = /\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|\[\d+px\])\b/g;

const IGNORAR_DIR = new Set(["node_modules", ".next", ".git", "test-results", "playwright-report"]);

export interface TituloAnalisado {
  arquivo: string;
  linha: number;
  classes: string;
  /** `sr-only` não é tipografia: o texto não é renderizado. */
  soLeitorDeTela: boolean;
  /** Disciplinado pelo tamanho canônico? */
  canonico: boolean;
}

function componentesTsx(dir: string, achados: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    if (IGNORAR_DIR.has(item)) continue;
    const completo = path.join(dir, item);
    if (statSync(completo).isDirectory()) componentesTsx(completo, achados);
    else if (/\.tsx$/.test(item) && !/\.test\.tsx$/.test(item)) achados.push(completo);
  }
  return achados;
}

/**
 * Todo `<h1>` do produto, com o tamanho declarado.
 *
 * Lê `app/` (telas) e `components/` (componentes que desenham título), sem
 * comentários — senão um comentário que CITA `<h1 className="text-lg">` (como o
 * que eu escrevi na V-08) viraria violação.
 */
/**
 * Telas do PRODUTO AUTENTICADO. Ficam de fora, e o motivo é medido, não estético:
 *
 * - `app/(public)/**`, `app/team/**`, `app/o/**`, `app/onboarding/**`: layouts
 *   próprios, fora do shell. A varredura de navegador mede `/login` e `/signup`
 *   em 24 px; as demais são dinâmicas e não entram na régua.
 * - `app/global-error.tsx`, `app/error.tsx`, `app/not-found.tsx`: fronteiras de
 *   erro, que vestem a marca e não o produto.
 * - `app/design/**`: o showcase do design system, que existe para mostrar a
 *   escala — inclusive a de título.
 */
const ESCOPO = ["app/app/", "app/admin/"];

/**
 * Exceções NOMEADAS, com motivo. Cada uma é uma tela cujo `<h1>` não é
 * cabeçalho de página no sentido do `NexusPageHeader`.
 */
const EXCECOES: Record<string, string> = {
  "app/app/ai/followups/[id]/_components/PublishBar.tsx":
    "o editor de fluxo de follow-up é um canvas com barra compacta por desenho; " +
    "o h1 é o nome do fluxo nessa barra. O prompt manda não padronizar " +
    "mecanicamente onde o editor tem composição intencional.",
};

export function analisarTitulos(raiz = RAIZ): TituloAnalisado[] {
  const arquivos = [
    ...componentesTsx(path.join(raiz, "app")),
    ...componentesTsx(path.join(raiz, "components")),
  ];
  const resultado: TituloAnalisado[] = [];

  for (const arquivo of arquivos) {
    const rel = path.relative(raiz, arquivo).split(path.sep).join("/");
    if (!ESCOPO.some((prefixo) => rel.startsWith(prefixo))) continue;
    if (EXCECOES[rel]) continue;
    if (rel.startsWith("components/ui/")) continue;

    const fonte = semComentarios(readFileSync(arquivo, "utf8"));
    for (const m of fonte.matchAll(/<h1\b([^>]*)>/g)) {
      const attrs = m[1] ?? "";
      const classes = [...attrs.matchAll(CLASSES_DE_TAMANHO)].map((c) => c[0]);
      const soLeitorDeTela = /\bsr-only\b/.test(attrs);
      // `<h1 className={cn("text-2xl", x)}>` também conta: o literal está lá.
      //
      // SEM classe de tamanho NÃO é violação: o título herda o tamanho do
      // contexto (ex.: `/app/expedicao`, que mede 24 px em execução). O gate
      // julga o que está DECLARADO — herança é resolvida pelo navegador, e a
      // varredura de 112 rotas é quem mede o valor final.
      const canonico = soLeitorDeTela || classes.length === 0 || classes.includes(TAMANHO_CANONICO);
      resultado.push({
        arquivo: rel,
        linha: fonte.slice(0, m.index).split("\n").length,
        classes: classes.join(" "),
        soLeitorDeTela,
        canonico,
      });
    }
  }
  return resultado;
}

describe("título de tela tem um tamanho só", () => {
  it("todo <h1> visível usa text-2xl (o tamanho do NexusPageHeader)", () => {
    const fora = analisarTitulos()
      .filter((t) => !t.canonico)
      .map((t) => `${t.arquivo}:${t.linha} — "${t.classes || "(sem classe de tamanho)"}"`);
    expect(
      fora,
      "título com tamanho fora do canônico. Consertar a AUSÊNCIA de título não " +
        "autoriza inventar um tamanho: use NexusPageHeader, ou text-2xl, ou " +
        "declare sr-only se o título é só para leitor de tela.",
    ).toEqual([]);
  });

  it("o analisador realmente lê os títulos (gate não passa por vacuidade)", () => {
    const todos = analisarTitulos();
    // Medido em 16/11/2026: 24 `<h1>` nas telas de `app/app` + `app/admin`, dos
    // quais 2 são `sr-only` (inbox da organização e inbox da plataforma).
    expect(todos.length).toBeGreaterThan(15);
    expect(todos.filter((t) => t.soLeitorDeTela).length).toBeGreaterThanOrEqual(2);
  });

  it("o editor de agente tem h1 — era a única tela do produto sem título", () => {
    // Regressão nomeada: `H1 sem-h1 (1): /app/ai/agents/new`. O editor usava
    // `<h2 className="text-xl">` como cabeçalho da TELA inteira.
    const form = analisarTitulos().filter((t) =>
      t.arquivo.includes("ai/agents/[id]/_components/AgentForm.tsx"),
    );
    expect(form).toHaveLength(1);
    expect(form[0]!.classes).toContain(TAMANHO_CANONICO);
  });

  it("o conserto da V-08 não reintroduz a quarta família (text-lg)", () => {
    // A primeira versão da correção do estado vazio de `/app/pedidos/imprimir`
    // usou `text-lg`. Este caso existe para o erro não voltar por descuido.
    const imprimir = analisarTitulos().filter((t) =>
      t.arquivo.includes("pedidos/imprimir/_imprimir.tsx"),
    );
    expect(imprimir.every((t) => t.canonico)).toBe(true);
  });
});
