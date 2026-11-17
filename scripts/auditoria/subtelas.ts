/**
 * SUBTELAS — as abas e os modais que a matriz de rotas não vê.
 *
 * ─── O QUE ESTE ARQUIVO RESOLVE ────────────────────────────────────────────
 *
 * `09-telas-estados.md` conta 156 `page.tsx`. Aba, modal, gaveta e fluxo de
 * escrita **não são rota**: não viram linha na matriz. A matriz marca a coluna
 * "abas" quando encontra `<Tabs` no segmento, mas não diz QUAL aba, nem onde
 * clicar — e auditoria que não sabe o nome da subtela não consegue abri-la.
 *
 * Em 16/11/2026, medido no repositório: `Dialog` em 53 arquivos, `Sheet` em 13,
 * `Tabs` em 26 (17 telas distintas). Nenhum desses estava enumerado.
 *
 * ─── O QUE ELE **NÃO** FAZ (para o número não ser lido como mais do que é) ──
 *
 * A extração é **estática**: lê o texto do segmento de rota e tira o rótulo do
 * `TabsTrigger`/`DialogTitle`. Ela não prova que a aba abre, nem que o modal
 * renderiza, nem que o rótulo está certo — isso é a Fase 2 em execução. O que
 * ela entrega é o **inventário com nome e arquivo**, para que a execução tenha
 * o que abrir e para que "subtela não enumerada" deixe de ser desculpa.
 *
 * ─── A REGRA QUE VALE A PENA ───────────────────────────────────────────────
 *
 * `<Dialog>` sem `<DialogTitle>` é defeito de acessibilidade, não detalhe de
 * marcação: o Radix anuncia "diálogo" sem nome e o leitor de tela não diz o que
 * abriu. O mesmo vale para `Sheet`. Por isso o inventário conta, por tela, os
 * modais **sem título** — a mesma classe da V-15 (rótulo que não rotula).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { arquivosDaTela, semComentarios } from "./segmento-de-rota";

export interface Subtela {
  /**
   * `aba`          — `<TabsTrigger>` do Radix: troca de estado na mesma rota.
   * `aba-caseira`  — `<button aria-current>`: troca de estado, barra feita à mão.
   * `nav-rota`     — `<Link/a aria-current>`: **outra rota**, não um estado.
   * `modal`, `gaveta` — sobreposição.
   */
  tipo: "aba" | "aba-caseira" | "nav-rota" | "modal" | "gaveta";
  rotulo: string;
  arquivo: string;
  linha: number;
}

export interface SubtelasDaTela {
  /** Rota, como `app/app/pedidos` → `/app/pedidos`. */
  rota: string;
  /** Abas de ESTADO: Radix + barras caseiras com `aria-current` em `<button>`. */
  abas: Subtela[];
  modais: Subtela[];
  gavetas: Subtela[];
  /** `aria-current` em `<Link>`: são rotas irmãs, já cobertas pela varredura de rotas. */
  rotasIrmaes: Subtela[];
  /** `<Dialog>`/`<Sheet>` sem `<DialogTitle>`/`<SheetTitle>` no mesmo arquivo. */
  semTitulo: number;
}

/** Remove `{...}` respeitando chaves aninhadas e strings dentro delas. */
export function semExpressoes(texto: string): string {
  let saida = "";
  let i = 0;
  while (i < texto.length) {
    if (texto[i] !== "{") {
      saida += texto[i];
      i++;
      continue;
    }
    let profundidade = 0;
    while (i < texto.length) {
      const c = texto[i]!;
      if (c === '"' || c === "'" || c === "`") {
        const aspa = c;
        i++;
        while (i < texto.length && texto[i] !== aspa) i += texto[i] === "\\" ? 2 : 1;
        i++;
        continue;
      }
      if (c === "{") profundidade++;
      else if (c === "}") {
        profundidade--;
        if (profundidade === 0) {
          i++;
          break;
        }
      }
      i++;
    }
    saida += " ";
  }
  return saida;
}

/** Linha (1-based) de um índice de caractere. */
function linhaDe(texto: string, indice: number): number {
  return texto.slice(0, indice).split("\n").length;
}

/**
 * Rótulo legível de um trecho de JSX.
 *
 * Ordem: literais de string (é onde o `t("…")` guarda o texto), depois o texto
 * solto, por último o nome do componente. Sem isso, `{t("De")}` viraria
 * `{t(...)}` e o inventário ficaria com 40 linhas ilegíveis.
 */
export function rotuloDeJsx(trecho: string): string {
  // `className="text-sm ml-2"` e `${...}` NÃO são rótulo. Na primeira execução
  // deste extrator eles viravam "aba" com nome `# / ml-1.5 text-[10px]` — ruído
  // que parece inventário. Limpar antes de procurar o texto é o que separa os
  // dois.
  const limpo = trecho
    .replace(/\bclassName\s*=\s*"[^"]*"/g, " ")
    .replace(/\bclassName\s*=\s*\{[^}]*\}/g, " ")
    .replace(/\$\{[^}]*\}/g, " ");

  // 1) chamada de tradução: é onde o texto mora neste produto.
  const traduzido = [...limpo.matchAll(/\b(?:t|traduzir)\(\s*["'`]([^"'`]{1,48})["'`]/g)].map((m) =>
    m[1]!.trim(),
  );
  const uteis = traduzido.filter((l) => l !== "");
  if (uteis.length > 0) return [...new Set(uteis)].slice(0, 2).join(" / ");

  // 2) texto solto no JSX: `<DialogTitle>Nova compra</DialogTitle>`.
  //    Braces são removidos com PROFUNDIDADE: `{a === "x" && <span>{rotulo}</span>}`
  //    tem chaves aninhadas, e um `\{[^}]*\}` para na primeira e deixa `)} )}`
  //    como "rótulo" — foi o que saiu em `/app/notas` em 16/11/2026.
  const texto = semExpressoes(limpo)
    .replace(/<[^>]+>/g, " ")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Sobrou só pontuação? Então o rótulo é expressão pura — dizer "dinâmico" é
  // honesto; devolver `)} )}` parece inventário e não é.
  if (/[A-Za-zÀ-ÿ]{2,}/.test(texto)) return texto.slice(0, 48);

  // 3) literal cru (sem `t()`) e, por último, o rótulo é dinâmico — dizer isso
  // é melhor que devolver o nome de uma classe CSS.
  // Literal cru só vale FORA de expressão: `{a === "notas"}` não é rótulo, é
  // comparação — e virava "notas" como nome de aba.
  const crus = [...semExpressoes(limpo).matchAll(/["'`]([^"'`]{1,48})["'`]/g)]
    .map((m) => m[1]!.trim())
    .filter((l) => l !== "" && !l.startsWith("/") && !/\s-\s|^[a-z-]+:/.test(l));
  if (crus.length > 0) return [...new Set(crus)].slice(0, 2).join(" / ");
  return "(rótulo dinâmico)";
}

/**
 * Fim da tag de abertura, respeitando `{}` e strings.
 *
 * `onClick={() => setAba("buscar")}` tem um `>` DENTRO do atributo — o `=>`. Um
 * `[^>]*` para no meio e o "rótulo" sai `setAba(buscar)} >`, como saiu na
 * primeira versão. Medido em 16/11/2026 em `/app/prospeccao`: quatro abas com
 * nome de código em vez de nome de tela.
 */
function fimDaTagAbertura(fonte: string, inicio: number): number {
  let i = inicio;
  let chaves = 0;
  while (i < fonte.length) {
    const c = fonte[i]!;
    if (c === '"' || c === "'" || c === "`") {
      const aspa = c;
      i++;
      while (i < fonte.length) {
        if (fonte[i] === "\\") {
          i += 2;
          continue;
        }
        if (fonte[i] === aspa) {
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

/** Extrai o conteúdo entre `<Tag ...>` e `</Tag>` a partir de `inicio`. */
function conteudoDaTag(fonte: string, inicio: number, tag: string): string | null {
  const fechaAbertura = fimDaTagAbertura(fonte, inicio);
  if (fechaAbertura < 0) return null;
  if (fonte[fechaAbertura - 1] === "/") return null; // auto-fechado
  const fim = fonte.indexOf(`</${tag}>`, fechaAbertura);
  if (fim < 0) return null;
  return fonte.slice(fechaAbertura + 1, fim);
}

function coletar(fonte: string, arquivo: string, tag: string, tipo: Subtela["tipo"]): Subtela[] {
  const achados: Subtela[] = [];
  const re = new RegExp(`<${tag}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte)) !== null) {
    const interno = conteudoDaTag(fonte, m.index, tag);
    if (interno === null) continue;
    const rotulo = rotuloDeJsx(interno);
    if (!rotulo) continue;
    achados.push({ tipo, rotulo, arquivo, linha: linhaDe(fonte, m.index) });
  }
  return achados;
}

/**
 * Barra de abas CASEIRA — `<button aria-current="page">` / `<Link aria-current>`.
 *
 * O extractor só achava `<TabsTrigger>` do Radix, e por isso `/app/compras`
 * aparecia com **zero** abas quando tem duas ("Pedidos" e "Fornecedores"), e
 * `/app/products`, `/app/prospeccao`, `/app/fiscal` (NavFiscal) e
 * `/app/expedicao/[id]` também. Medido em 16/11/2026: 6 telas com barra
 * caseira, nenhuma enumerada.
 *
 * A distinção que importa está no ELEMENTO, não no nome: `aria-current` num
 * `<button>` troca estado na mesma rota (subtela de verdade); num `<a>`/`Link`
 * navega para outra rota (já medida pela varredura de rotas — abrir de novo
 * seria contar duas vezes).
 */
function coletarAriaCurrent(
  fonte: string,
  arquivo: string,
): { estado: Subtela[]; rota: Subtela[] } {
  const estado: Subtela[] = [];
  const rota: Subtela[] = [];
  for (const m of fonte.matchAll(/<(button|Link|a|Button)\b/g)) {
    const tag = m[1]!;
    // Não confundir `<a>` com `<abbr>`/`<aside>`: exige fronteira.
    if (!/[\s/>]/.test(fonte[m.index! + tag.length + 1] ?? " ")) continue;
    const fim = fimDaTagAbertura(fonte, m.index!);
    if (fim < 0) continue;
    const attrs = fonte.slice(m.index! + tag.length + 1, fim);
    if (!/\baria-current\b/.test(attrs)) continue;
    const interno = conteudoDaTag(fonte, m.index!, tag);
    const rotulo = interno === null ? "" : rotuloDeJsx(interno);
    if (!rotulo) continue;
    const item: Subtela = {
      tipo: tag === "button" || tag === "Button" ? "aba-caseira" : "nav-rota",
      rotulo,
      arquivo,
      linha: linhaDe(fonte, m.index!),
    };
    // `href` decide, mesmo em `<Button asChild>`: se navega, é rota.
    if (/\bhref\b/.test(attrs) || item.tipo === "nav-rota") rota.push(item);
    else estado.push(item);
  }
  return { estado, rota };
}

/** Conta `<Dialog`/`<Sheet` sem o Title correspondente no MESMO arquivo. */
function modaisSemTitulo(fonte: string): number {
  let faltando = 0;
  for (const [abre, titulo] of [
    ["Dialog", "DialogTitle"],
    ["Sheet", "SheetTitle"],
    ["Drawer", "DrawerTitle"],
    ["AlertDialog", "AlertDialogTitle"],
  ] as const) {
    const aberturas = [...fonte.matchAll(new RegExp(`<${abre}(?![A-Za-z])`, "g"))].length;
    if (aberturas === 0) continue;
    const titulos = [...fonte.matchAll(new RegExp(`<${titulo}(?![A-Za-z])`, "g"))].length;
    faltando += Math.max(0, aberturas - titulos);
  }
  return faltando;
}

/**
 * Extrai abas, modais e gavetas de UM arquivo. Puro: não toca em disco além de
 * ler o que recebeu — é o que torna o extrator testável.
 */
export function extrairDoTexto(
  textoBruto: string,
  arquivo = "(memória)",
): Omit<SubtelasDaTela, "rota"> {
  const fonte = semComentarios(textoBruto);
  const radix = coletar(fonte, arquivo, "TabsTrigger", "aba");
  const caseiras = coletarAriaCurrent(fonte, arquivo);
  const modais = coletar(fonte, arquivo, "DialogTitle", "modal");
  const gavetas = coletar(fonte, arquivo, "SheetTitle", "gaveta");
  return {
    abas: [...radix, ...caseiras.estado],
    modais,
    gavetas,
    rotasIrmaes: caseiras.rota,
    semTitulo: modaisSemTitulo(fonte),
  };
}

/** Rota legível a partir da pasta da página, relativa a `app/`. */
export function rotaDaPasta(pasta: string, raiz: string): string {
  const rel = relative(join(raiz, "app"), pasta).split(sep).join("/");
  if (rel === "") return "/";
  // Grupos de rota `(protected)` não entram na URL.
  const limpa = rel
    .split("/")
    .filter((p) => !p.startsWith("(") || !p.endsWith(")"))
    .join("/");
  return "/" + limpa;
}

/** Uma entrada por `page.tsx` do produto. */
export function inventariarSubtelas(raiz: string): SubtelasDaTela[] {
  const pastas: string[] = [];
  const andar = (dir: string): void => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.name === "node_modules" || item.name.startsWith(".")) continue;
      const completo = join(dir, item.name);
      if (item.isDirectory()) andar(completo);
      else if (item.name === "page.tsx") pastas.push(dir);
    }
  };
  andar(join(raiz, "app"));

  const porPasta = new Map<string, SubtelasDaTela>();
  for (const pasta of pastas.sort()) {
    // `arquivosDaTela` faz `join(raiz, pasta)`: passar caminho absoluto devolve
    // ZERO arquivos e o inventário sai vazio sem erro — foi o que aconteceu na
    // primeira execução (156 telas, 0 subtelas). Caminho relativo, sempre.
    const { arquivos } = arquivosDaTela(raiz, relative(raiz, pasta));
    const entrada: SubtelasDaTela = {
      rota: rotaDaPasta(pasta, raiz),
      abas: [],
      modais: [],
      gavetas: [],
      rotasIrmaes: [],
      semTitulo: 0,
    };
    for (const arquivo of arquivos) {
      const rel = relative(raiz, arquivo).split(sep).join("/");
      const parcial = extrairDoTexto(readFileSync(arquivo, "utf8"), rel);
      entrada.abas.push(...parcial.abas);
      entrada.modais.push(...parcial.modais);
      entrada.gavetas.push(...parcial.gavetas);
      entrada.rotasIrmaes.push(...parcial.rotasIrmaes);
      entrada.semTitulo += parcial.semTitulo;
    }
    porPasta.set(pasta, entrada);
  }
  return [...porPasta.values()];
}

/** Markdown do inventário, para versionar como artefato. */
export function renderizar(entradas: SubtelasDaTela[]): string {
  const comSubtela = entradas.filter((e) => e.abas.length + e.modais.length + e.gavetas.length > 0);
  const totalAbas = entradas.reduce((a, e) => a + e.abas.length, 0);
  const totalModais = entradas.reduce((a, e) => a + e.modais.length, 0);
  const totalGavetas = entradas.reduce((a, e) => a + e.gavetas.length, 0);
  const semTitulo = entradas.reduce((a, e) => a + e.semTitulo, 0);

  const lista = (itens: Subtela[]): string =>
    itens.length === 0
      ? "—"
      : itens.map((s) => `${s.rotulo || "(sem rótulo)"} \`${s.arquivo}:${s.linha}\``).join("<br>");

  const linhas = [
    "# Subtelas — abas, modais e gavetas por tela",
    "",
    "> **Gerado por comando**: `pnpm exec tsx scripts/auditoria/subtelas.ts`.",
    "> Fonte: segmento de rota (`page.tsx` + arquivos locais + imports relativos),",
    "> com comentários removidos. Não editar à mão.",
    "",
    `**${entradas.length} telas** medidas; **${comSubtela.length}** têm ao menos uma subtela.`,
    `Total: **${totalAbas} abas**, **${totalModais} modais**, **${totalGavetas} gavetas**.`,
    "",
    "> **O que este número é.** Inventário **estático** com nome e arquivo — o que abrir.",
    "> **O que não é.** Prova de que a subtela abre, renderiza ou está correta: isso exige",
    "> execução e é o que a Fase 2 faz tela a tela. Aba construída em laço",
    "> (`items.map(...)`) aparece uma vez com o literal do template, não com os N nomes reais.",
    "",
    `**Modais sem título de acessibilidade: ${semTitulo}.**` +
      (semTitulo === 0
        ? " Todo `<Dialog>`/`<Sheet>` do produto declara `<DialogTitle>`/`<SheetTitle>`."
        : ' `<Dialog>`/`<Sheet>` sem `Title` é anunciado como "diálogo" sem nome pelo leitor de tela — mesma classe da V-15.'),
    "",
    "| Tela | Abas | Modais | Gavetas |",
    "|---|---|---|---|",
  ];

  for (const e of comSubtela.sort((a, b) => a.rota.localeCompare(b.rota))) {
    linhas.push(`| \`${e.rota}\` | ${lista(e.abas)} | ${lista(e.modais)} | ${lista(e.gavetas)} |`);
  }

  return linhas.join("\n") + "\n";
}

if (process.argv[1]?.endsWith("subtelas.ts")) {
  const raiz = process.cwd();
  const entradas = inventariarSubtelas(raiz);
  const md = renderizar(entradas);
  writeFileSync(join(raiz, "docs", "auditoria", "09b-subtelas.md"), md);
  // JSON ao lado do markdown: o instrumento de captura precisa da lista para
  // ABRIR cada aba, e parsear tabela markdown seria frágil de propósito errado.
  writeFileSync(
    join(raiz, "docs", "auditoria", "09b-subtelas.json"),
    JSON.stringify({ geradoEm: new Date().toISOString(), telas: entradas }, null, 2) + "\n",
  );
  const abas = entradas.reduce((a, e) => a + e.abas.length, 0);
  const modais = entradas.reduce((a, e) => a + e.modais.length, 0);
  const gavetas = entradas.reduce((a, e) => a + e.gavetas.length, 0);
  const semTitulo = entradas.reduce((a, e) => a + e.semTitulo, 0);
  process.stdout.write(
    `ok: ${entradas.length} telas · ${abas} abas · ${modais} modais · ${gavetas} gavetas · ` +
      `${semTitulo} sem título → docs/auditoria/09b-subtelas.md\n`,
  );
}
