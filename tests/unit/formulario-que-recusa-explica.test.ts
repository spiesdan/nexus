/**
 * FORMULÁRIO QUE RECUSA TEM DE DIZER POR QUÊ — na página, não só no balão.
 *
 * ─── O QUE FOI MEDIDO ──────────────────────────────────────────────────────
 *
 * Em 16/11/2026, submetendo três formulários vazios com o instrumento de escrita
 * (`scripts/auditoria/escrita-e-validacao.mjs`), dois responderam assim:
 *
 *     token-sem-nome   recusou · mensagens: [] · ariaInvalid: 0 · :invalid: 1
 *     fonte-sem-nome   recusou · mensagens: [] · ariaInvalid: 0 · :invalid: 1
 *     convite-sem-email recusou · mensagens: ["Adicione ao menos um email."] · ariaInvalid: 1
 *
 * Os dois primeiros recusavam pelo `required` do HTML: o navegador mostra o
 * balão nativo, que (a) some ao sair do campo, (b) não usa a tipografia de erro
 * do produto, (c) não marca `aria-invalid`/`aria-describedby`, e (d) é a ÚNICA
 * voz — a página não diz nada. O terceiro usava o caminho próprio do produto
 * (`FormField erro=`), que faz as quatro coisas.
 *
 * O mesmo diálogo de token já validava ESCOPOS em JS (`erroEscopos`). O nome era
 * a metade que falava outra língua — inconsistência dentro do MESMO formulário.
 *
 * ─── A REGRA QUE FICA ──────────────────────────────────────────────────────
 *
 * Formulário do produto que tem `<FormField>` (ou `<Label htmlFor>` + `<Input
 * required>`) e recusa por campo obrigatório precisa de UMA destas duas coisas:
 *
 *   1. `erro=` no `FormField` / `<p role="alert">` ligado por
 *      `aria-describedby` — a mensagem na página; ou
 *   2. `noValidate` no `<form>` — quem valida é o JS, e aí a mensagem existe.
 *
 * O gate abaixo cobra o par mínimo: **`required` + `noValidate` + mensagem**, ou
 * **`required` + `erro`**. Ele não exige que TODO campo obrigatório tenha
 * mensagem própria — exige que o formulário que usa `noValidate` tenha onde
 * escrever, senão a recusa fica muda.
 *
 * ─── POR QUE ESTÁTICO, E NÃO SÓ O INSTRUMENTO ─────────────────────────────
 *
 * O instrumento roda em navegador, cobre três formulários e precisa de sessão.
 * Este gate lê TODOS os `<form>` do produto em segundos e impede que um
 * formulário novo nasça mudo — que é como os dois acima nasceram.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = path.resolve(__dirname, "../..");
const IGNORAR = new Set(["node_modules", ".next", ".git", "test-results", "playwright-report"]);

export interface FormularioAnalisado {
  arquivo: string;
  linha: number;
  noValidate: boolean;
  temRequired: boolean;
  /** Existe onde escrever a recusa: `erro=` no FormField ou `role="alert"`. */
  temMensagem: boolean;
}

function tsx(dir: string, achados: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    if (IGNORAR.has(item)) continue;
    const completo = path.join(dir, item);
    if (statSync(completo).isDirectory()) tsx(completo, achados);
    else if (/\.tsx$/.test(item) && !/\.test\.tsx$/.test(item)) achados.push(completo);
  }
  return achados;
}

/** Todo `<form>` do produto, com o que ele oferece para explicar a recusa. */
export function analisarFormularios(raiz = RAIZ): FormularioAnalisado[] {
  const arquivos = [...tsx(path.join(raiz, "app")), ...tsx(path.join(raiz, "components"))];
  const resultado: FormularioAnalisado[] = [];

  for (const arquivo of arquivos) {
    const rel = path.relative(raiz, arquivo).split(path.sep).join("/");
    if (rel.startsWith("components/ui/")) continue;
    const fonte = semComentarios(readFileSync(arquivo, "utf8"));

    for (const m of fonte.matchAll(/<form\b/g)) {
      const inicio = m.index!;
      const fimAbertura = fonte.indexOf(">", inicio);
      if (fimAbertura < 0) continue;
      const attrs = fonte.slice(inicio, fimAbertura + 1);
      const fechamento = fonte.indexOf("</form>", fimAbertura);
      if (fechamento < 0) continue;
      const corpo = fonte.slice(fimAbertura + 1, fechamento);

      resultado.push({
        arquivo: rel,
        linha: fonte.slice(0, inicio).split("\n").length,
        noValidate: /\bnoValidate\b/.test(attrs),
        temRequired: /\brequired\b/.test(corpo),
        temMensagem: /\berro=/.test(corpo) || /role="alert"/.test(corpo),
      });
    }
  }
  return resultado;
}

describe("formulário que recusa diz por quê", () => {
  it("quem usa noValidate tem onde escrever a recusa", () => {
    const mudos = analisarFormularios()
      .filter((f) => f.noValidate && f.temRequired && !f.temMensagem)
      .map((f) => `${f.arquivo}:${f.linha} — noValidate sem \`erro=\` nem role="alert"`);
    expect(
      mudos,
      "o formulário desliga a validação nativa e não escreve nada na página: " +
        "o clique em Enviar vira um no-op silencioso.",
    ).toEqual([]);
  });

  it("o analisador realmente varre o produto (não é vazio por não olhar)", () => {
    const todos = analisarFormularios();
    // Medido em 16/11/2026: 20 `<form>` em app/ + components/.
    expect(todos.length).toBeGreaterThan(10);
    // Controle positivo: existe pelo menos um com mensagem e um com noValidate.
    expect(todos.filter((f) => f.temMensagem).length).toBeGreaterThan(3);
    expect(todos.filter((f) => f.noValidate).length).toBeGreaterThan(0);
  });

  it("os dois formulários que recusavam em silêncio declaram mensagem", () => {
    // Regressão nomeada: token sem nome e fonte sem nome respondiam com
    // `mensagens: []` e `ariaInvalid: 0` — só o balão do navegador.
    const alvos = analisarFormularios().filter(
      (f) =>
        f.arquivo.includes("settings/api-tokens/_components/ApiTokensClient.tsx") ||
        f.arquivo.includes("webhooks/_components/CreateSourceDialog.tsx"),
    );
    expect(alvos.length).toBeGreaterThanOrEqual(2);
    for (const f of alvos) {
      expect(f.noValidate, `${f.arquivo} voltou a deixar o navegador falar primeiro`).toBe(true);
      expect(f.temMensagem, `${f.arquivo} não tem onde escrever a recusa`).toBe(true);
    }
  });
});
