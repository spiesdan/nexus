/**
 * COD: rótulo visível → nome acessível.
 *
 * ─── O PROBLEMA, MEDIDO ────────────────────────────────────────────────────
 *
 * Em 16/11/2026, abrindo a aba "Motoristas" de `/app/frota` com o instrumento de
 * subtelas, dois campos apareceram sem nome acessível. A causa não era o
 * `<Input>`: era o `<Label>` ao lado, sem `htmlFor` — e a lista completa, medida
 * com o mesmo critério em `app/` e `components/`, deu **90** `<Label>` sem
 * `htmlFor` e sem controle dentro. Em **55** deles o campo fica sem NOME
 * NENHUM: quem usa leitor de tela ouve "campo de texto" e não sabe o que digita.
 *
 * O gate antigo (`rotulo-de-campo-aponta-para-controle`) não via nada disso
 * porque só lia `<label>` literal — `<Label>` é o primitivo de `ui/label`, que
 * renderiza `<label>` em runtime.
 *
 * ─── O QUE ESTE SCRIPT FAZ ─────────────────────────────────────────────────
 *
 * Para cada `<Label ...>texto</Label>` sem `htmlFor` e sem controle dentro:
 *
 *   1. acha o PRÓXIMO controle na mesma vizinhança (Input, Textarea, Select→
 *      SelectTrigger, Checkbox, Switch, NativeSelect, `<select>`/`<input>`);
 *   2. se esse controle já tem `id`, `aria-label` ou `aria-labelledby`, **pula**
 *      — ele tem nome; o que falta ali é alinhar texto visível e nome, caso a
 *      caso, e sobrescrever às cegas seria pior;
 *   3. senão injeta `aria-label` no controle com o TEXTO DO RÓTULO, preservando
 *      a expressão (`{t("Qtd.")}` → `aria-label={t("Qtd.")}`).
 *
 * Por que `aria-label` e não `htmlFor`+`id`: `id` único exige `useId()` dentro
 * do componente, e injetar hook por regex é como se quebra um arquivo inteiro.
 * `aria-label` é atributo, não muda o DOM nem o layout, e o nome acessível fica
 * EXATAMENTE o texto que a pessoa lê — que é o que a V-15 pediu.
 *
 * Uso:
 *   node scripts/auditoria/cod-rotulo-acessivel.mjs            # dry-run
 *   node scripts/auditoria/cod-rotulo-acessivel.mjs --aplicar  # escreve
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const APLICAR = process.argv.includes("--aplicar");
const IGN = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage"]);

/** Controles que recebem nome acessível. `Select` do Radix NÃO: quem recebe é o Trigger. */
const CONTROLES = ["Input", "input", "Textarea", "textarea", "NativeSelect", "Checkbox", "Switch"];
const COM_BLOCO = ["Select", "SelectTrigger"];

function fontes(dir, out = []) {
  for (const item of readdirSync(dir)) {
    if (IGN.has(item)) continue;
    const completo = path.join(dir, item);
    if (statSync(completo).isDirectory()) fontes(completo, out);
    else if (/\.tsx$/.test(item) && !/\.test\.tsx$/.test(item)) out.push(completo);
  }
  return out;
}

/** Texto de rótulo → atributo JSX. */
export function comoAtributo(conteudo) {
  const limpo = conteudo.replace(/\s+/g, " ").trim();
  if (limpo.startsWith("{") && limpo.endsWith("}")) {
    const expr = limpo.slice(1, -1).trim();
    // Expressão composta (`{a} {b}`) não é um nome só: melhor não inventar.
    if (expr.includes("}") && expr.includes("{")) return null;
    return `{${expr}}`;
  }
  if (limpo.includes("{") || limpo.includes("}")) return null;
  const semAspas = limpo.replace(/^["'`]|["'`]$/g, "");
  if (!semAspas) return null;
  return JSON.stringify(semAspas);
}

/** Fim de uma tag de abertura, respeitando strings e chaves. */
function fimDaTag(texto, inicio) {
  let i = inicio;
  let chaves = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '"' || c === "'" || c === "`") {
      const aspa = c;
      i++;
      while (i < texto.length) {
        if (texto[i] === "\\") {
          i += 2;
          continue;
        }
        if (texto[i] === aspa) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === "{") chaves++;
    else if (c === "}") chaves--;
    else if (c === ">" && chaves === 0) return i;
    i++;
  }
  return -1;
}

/**
 * O controle IRMÃO IMEDIATO — e só ele.
 *
 * A primeira versão pegava "o próximo controle em até 900 caracteres" e
 * carimbava o rótulo do GRUPO no primeiro campo do grupo:
 *
 *     <Label>Janelas de envio</Label>
 *     {janelas.map(...)}            ← um Input por janela
 *
 * Nomear o primeiro horário de "Janelas de envio" seria pior que deixá-lo sem
 * nome: o leitor de tela passaria a MENTIR. Entre `</Label>` e o controle só
 * cabe espaço em branco, ou no máximo a abertura de um `<div>` que o embrulha.
 */
function proximoControle(fonte, inicio) {
  const janela = fonte.slice(inicio, inicio + 900);
  // O bloco do irmão: até o `</div>` que fecha o wrapper do rótulo.
  const fimIrmao = janela.search(/<\/(div|section|fieldset)>/);
  const bloco = fimIrmao > 0 ? janela.slice(0, fimIrmao) : janela;

  // Quem vem PRIMEIRO decide: `Select` (Radix) ou um controle simples. Contar
  // os dois e exigir "um só" reprovava `PainelDeProvedores`, onde o `<Select>`
  // abre um bloco grande e há outro `<Input>` depois do `</div>` do irmão.
  const iSelect = bloco.search(/<Select\b/);
  const iSimples = bloco.search(/<(Input|input|Textarea|textarea|NativeSelect|Checkbox|Switch)\b/);

  if (iSelect >= 0 && (iSimples < 0 || iSelect < iSimples)) {
    const trigger = /<SelectTrigger\b/.exec(bloco.slice(iSelect));
    if (!trigger) return null;
    const pos = inicio + iSelect + trigger.index;
    const fim = fimDaTag(fonte, pos);
    return fim < 0 ? null : { inicio: pos, fim, tag: "SelectTrigger" };
  }
  if (iSimples >= 0) {
    const m = /<(Input|input|Textarea|textarea|NativeSelect|Checkbox|Switch)\b/.exec(bloco);
    const pos = inicio + m.index;
    const fim = fimDaTag(fonte, pos);
    if (fim < 0) return null;
    // Dois controles simples no bloco = grupo (lista de janelas, de itens).
    const quantos = [
      ...bloco.matchAll(/<(Input|input|Textarea|textarea|NativeSelect|Checkbox|Switch)\b/g),
    ].length;
    if (quantos !== 1) return null;
    return { inicio: pos, fim, tag: m[1] };
  }
  return null;
}

/**
 * Planeja as mudanças. Puro na leitura: devolve o que faria, sem escrever.
 *
 * O gate `tests/unit/rotulo-visivel-vira-nome-acessivel.test.ts` importa esta
 * função e exige lista vazia — a mesma régua que conserta é a que vigia, então
 * não existe o caso "o gate passa e o problema continua".
 */
export function planejar(raiz = RAIZ) {
  const mudancas = [];
  const escritos = new Map();
  let rotulosLidos = 0;
  for (const arquivo of [
    ...fontes(path.join(raiz, "app")),
    ...fontes(path.join(raiz, "components")),
  ]) {
    const rel = path.relative(raiz, arquivo).split(path.sep).join("/");
    if (rel.startsWith("components/ui/")) continue;
    let fonte = readFileSync(arquivo, "utf8");
    const original = fonte;

    // De trás para frente: mexer no fim não invalida as posições anteriores.
    const labels = [...fonte.matchAll(/<Label\b/g)].reverse();
    for (const m of labels) {
      const inicio = m.index;
      const fimAbertura = fimDaTag(fonte, inicio);
      if (fimAbertura < 0) continue;
      const attrs = fonte.slice(inicio, fimAbertura + 1);
      if (/\bhtmlFor=/.test(attrs)) continue;
      const fechamento = fonte.indexOf("</Label>", fimAbertura);
      if (fechamento < 0) continue;
      rotulosLidos++;
      const conteudo = fonte.slice(fimAbertura + 1, fechamento);
      if (
        /<(Input|input|select|textarea|Textarea|Select|SelectTrigger|Checkbox|Switch|NativeSelect)\b/.test(
          conteudo,
        ) ||
        /\{children\}/.test(conteudo)
      )
        continue;

      const atributo = comoAtributo(conteudo);
      if (!atributo) continue;

      const controle = proximoControle(fonte, fechamento + "</Label>".length);
      if (!controle) continue;
      const aberturaControle = fonte.slice(controle.inicio, controle.fim + 1);
      if (/\baria-label=|\baria-labelledby=|\bid=/.test(aberturaControle)) continue;

      const ponto = controle.inicio + 1 + controle.tag.length;
      fonte = fonte.slice(0, ponto) + ` aria-label=${atributo}` + fonte.slice(ponto);
      mudancas.push({
        arquivo: rel,
        linha: original.slice(0, inicio).split("\n").length,
        rotulo: conteudo.replace(/\s+/g, " ").trim().slice(0, 48),
        controle: controle.tag,
      });
    }

    if (fonte !== original) escritos.set(arquivo, fonte);
  }
  return { mudancas, escritos, rotulosLidos };
}

const executandoComoScript = process.argv[1]?.endsWith("cod-rotulo-acessivel.mjs") ?? false;
const { mudancas, escritos, rotulosLidos } = executandoComoScript
  ? planejar(RAIZ)
  : { mudancas: [], escritos: new Map(), rotulosLidos: 0 };
if (APLICAR && executandoComoScript)
  for (const [arquivo, fonte] of escritos) writeFileSync(arquivo, fonte);
const porArquivo = new Map();
for (const m of mudancas) porArquivo.set(m.arquivo, (porArquivo.get(m.arquivo) ?? 0) + 1);
if (executandoComoScript) {
  process.stdout.write(
    `${APLICAR ? "APLICADO" : "dry-run"}: ${mudancas.length} de ${rotulosLidos} <Label> precisam de nome (${porArquivo.size} arquivos)\n`,
  );
}
for (const [a, n] of [...porArquivo.entries()].sort((x, y) => y[1] - x[1])) {
  process.stdout.write(`  ${String(n).padStart(2)}  ${a}\n`);
}
if (executandoComoScript && !APLICAR) {
  for (const m of mudancas.slice(0, 10)) {
    process.stdout.write(`  · ${m.arquivo}:${m.linha} "${m.rotulo}" → ${m.controle}\n`);
  }
}
