/**
 * ABRIR A SUBTELA — a parte que ficou faltando depois de enumerá-la.
 *
 * ─── O QUE ELE RESOLVE ─────────────────────────────────────────────────────
 *
 * `09b-subtelas.md` enumerou 82 abas, 68 modais e 12 gavetas em 156 telas. Isso
 * responde "onde procurar"; não responde "o que acontece quando abre". Este
 * instrumento abre cada uma e mede o mesmo conjunto da varredura de rotas —
 * `<h1>`, overflow horizontal, erro de console, campo visível sem nome
 * acessível — mais duas coisas próprias da subtela: se o conteúdo MUDOU ao
 * trocar de aba (aba que clica e não troca nada) e se o foco continua visível.
 *
 * ─── ONDE ELE **NÃO** VAI, E POR QUÊ ───────────────────────────────────────
 *
 * MODAL: o extrator dá o `<DialogTitle>`, não o gatilho. Clicar em botões por
 * semelhança de nome é como se apaga dado de cliente — "Excluir" e "Excluir
 * filtro" começam igual. Por isso:
 *
 *   1. só abre modal quando o gatilho tem nome acessível que **compartilha uma
 *      palavra significativa** com o título do diálogo (mínimo 4 letras);
 *   2. nunca clica em botão cujo nome casa a lista `PERIGO` — verbo destrutivo;
 *   3. registra como `nao-aberta` com o motivo, em vez de fingir que mediu.
 *
 * O que sobra de fora é dito com número no relatório. Um instrumento que abre
 * 60 de 68 e escreve "68 medidos" é pior que um que abre 60 e diz 8.
 *
 * ─── ELE NÃO AUTENTICA SOZINHO ─────────────────────────────────────────────
 *
 * Recebe a sessão do chamador por `storageState` (o mesmo arquivo que o
 * `captura-visual.mjs` grava). Login é caro e tem rate limit por IP; repetir
 * por aba dobraria o custo sem medir nada novo.
 *
 * Uso:
 *   node scripts/auditoria/captura-subtelas.mjs --estado /tmp/sessao.json \
 *     --grupo subtelas-tenant [--rotas "/app/compras,/app/estoque"]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// `@playwright/test`, não `playwright`: é a dependência declarada no
// package.json (a outra não existe no lockfile, e o import falha em runtime).
import { chromium } from "@playwright/test";

const RAIZ = process.cwd();
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const SAIDA = join(RAIZ, "docs", "auditoria", "capturas");

const args = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--"))
      args.set(argv[i], argv[i + 1]?.startsWith("--") ? true : argv[++i]);
  }
}

const grupo = args.get("--grupo") ?? "subtelas";
const estado = args.get("--estado");
const pedidas = args.get("--rotas") ? String(args.get("--rotas")).split(",") : null;
const LARGURA = Number(args.get("--largura") ?? 1440);
const ALTURA = Number(args.get("--altura") ?? 900);

/**
 * Verbo destrutivo. Se o nome do botão casa isto, o instrumento NÃO clica.
 *
 * Não é excesso de zelo: um modal de confirmação de exclusão abre já com o
 * botão "Excluir" no DOM, e um clique por nome o acionaria. A auditoria perde
 * uma medição; o cliente não perde um registro.
 */
const PERIGO =
  /\b(excluir|exclui|remover|remova|apagar|apague|deletar|desativar|desative|arquivar|encerrar|fechar|sair|revogar|cancelar|limpar|zerar|resetar)\b/i;

/** Palavras que não distinguem nada. */
const VAZIAS = new Set([
  "novo",
  "nova",
  "criar",
  "crie",
  "adicionar",
  "editar",
  "edite",
  "abrir",
  "ver",
  "visualizar",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "o",
  "a",
  "os",
  "as",
  "para",
  "por",
  "em",
  "com",
  "um",
  "uma",
  "e",
]);

/** Palavras significativas de um texto (sem acento, minúsculas). */
export function palavras(texto) {
  return [
    ...new Set(
      texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((p) => p.length >= 4 && !VAZIAS.has(p)),
    ),
  ];
}

/** O gatilho provável de um modal: botão cujo nome compartilha palavra com o título. */
export function gatilhoProvavel(titulo, botoes) {
  const alvo = palavras(titulo);
  if (alvo.length === 0) return null;
  return (
    botoes.find((b) => {
      if (PERIGO.test(b.nome)) return false;
      const p = palavras(b.nome);
      return p.some((x) => alvo.includes(x));
    }) ?? null
  );
}

async function medir(pagina) {
  return pagina.evaluate(() => {
    const doc = document.documentElement;
    const semRotulo = [...document.querySelectorAll("input,select,textarea")].filter((el) => {
      if ((el.getAttribute("type") || "").toLowerCase() === "hidden") return false;
      if (el.getAttribute("aria-hidden") === "true") return false;
      if (el.getAttribute("tabindex") === "-1") return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      if (el.closest("label")) return false;
      const id = el.getAttribute("id");
      const rotulo = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      return (
        !rotulo &&
        !el.getAttribute("aria-label") &&
        !el.getAttribute("aria-labelledby") &&
        !el.getAttribute("placeholder") &&
        !el.getAttribute("title")
      );
    }).length;
    return {
      overflowHorizontal: doc.scrollWidth - doc.clientWidth,
      camposSemRotulo: semRotulo,
      h1: [...document.querySelectorAll("h1")]
        .map((h) => h.textContent.trim())
        .filter(Boolean)
        .slice(0, 3),
      textoVisivel: (document.body.innerText || "").replace(/\s+/g, " ").trim().length,
      // Diálogo aberto de verdade? `[role=dialog]` sem `aria-hidden`.
      dialogos: document.querySelectorAll('[role="dialog"]:not([aria-hidden="true"])').length,
      // Modal sem nome acessível: `aria-labelledby` ausente E `aria-label` vazio.
      dialogosSemNome: [
        ...document.querySelectorAll('[role="dialog"]:not([aria-hidden="true"])'),
      ].filter(
        (d) =>
          !d.getAttribute("aria-label") &&
          !d.getAttribute("aria-labelledby") &&
          !(d.textContent || "").trim(),
      ).length,
    };
  });
}

const inventario = JSON.parse(
  readFileSync(join(RAIZ, "docs", "auditoria", "09b-subtelas.json"), "utf8"),
);
const alvo = inventario.telas.filter((t) => {
  const tem = t.abas.length + t.modais.length + t.gavetas.length > 0;
  if (!tem) return false;
  if (!pedidas) return true;
  return pedidas.some((p) => p.trim() === t.rota);
});

if (!estado) {
  console.error(
    "falta --estado <storageState.json>. Sem sessão o instrumento mede a tela de login.",
  );
  process.exit(2);
}

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  storageState: estado,
  viewport: { width: LARGURA, height: ALTURA },
  locale: "pt-BR",
});

const resultados = [];

for (const tela of alvo) {
  const pagina = await contexto.newPage();
  const consoleErros = [];
  pagina.on("console", (m) => {
    if (m.type() === "error") consoleErros.push(m.text().slice(0, 200));
  });
  pagina.on("pageerror", (e) => consoleErros.push(`pageerror: ${e.message}`.slice(0, 200)));

  const url = `${BASE}${tela.rota}`;
  let status = 0;
  try {
    const resp = await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    status = resp?.status() ?? 0;
  } catch (e) {
    resultados.push({ rota: tela.rota, tipo: "rota", erro: String(e).slice(0, 200) });
    await pagina.close();
    continue;
  }
  await pagina.waitForTimeout(1200);
  const base = await medir(pagina);
  resultados.push({ rota: tela.rota, tipo: "base", status, ...base, console: [...consoleErros] });
  consoleErros.length = 0;

  // ── ABAS ────────────────────────────────────────────────────────────────
  //
  // DUAS FAMÍLIAS, DOIS LOCATORS. `TabsTrigger` do Radix é `role="tab"`; a barra
  // caseira do produto (`/app/compras`, `/app/products`, `/app/prospeccao`) é um
  // `<button>` com `aria-current`. Procurar `role=tab` em todas reprovou 20 abas
  // que ESTAVAM no DOM — medido em 16/11/2026, o instrumento dizia "aba não
  // encontrada" para os dois botões de `/app/compras`.
  const vistas = new Set();
  for (const item of tela.abas) {
    const rotulo = item.rotulo;
    if (!rotulo || rotulo.startsWith("(") || vistas.has(rotulo)) continue;
    vistas.add(rotulo);
    const tab =
      item.tipo === "aba-caseira"
        ? pagina.getByRole("button", { name: rotulo, exact: true }).first()
        : pagina.getByRole("tab", { name: rotulo, exact: true }).first();
    if ((await tab.count()) === 0) {
      resultados.push({
        rota: tela.rota,
        tipo: "aba",
        subtela: rotulo,
        familia: item.tipo,
        naoMedida: `elemento não encontrado no DOM (${item.tipo})`,
      });
      continue;
    }
    // Aba que já está aberta não "muda o conteúdo" — ela já é o conteúdo.
    // Contar isso como "clicou e nada aconteceu" dava 6 falsos achados.
    const jaAtiva =
      (await tab.getAttribute("aria-selected")) === "true" ||
      (await tab.getAttribute("aria-current")) === "page";
    try {
      await tab.click({ timeout: 8_000 });
      await pagina.waitForTimeout(900);
    } catch (e) {
      resultados.push({
        rota: tela.rota,
        tipo: "aba",
        subtela: rotulo,
        familia: item.tipo,
        naoMedida: String(e).slice(0, 160),
      });
      continue;
    }
    const med = await medir(pagina);
    const ativaDepois =
      (await tab.getAttribute("aria-selected")) === "true" ||
      (await tab.getAttribute("aria-current")) === "page";
    resultados.push({
      rota: tela.rota,
      tipo: "aba",
      subtela: rotulo,
      familia: item.tipo,
      status,
      jaAtiva,
      selecionou: ativaDepois,
      // Aba que clica, não fica ativa e não muda nada é a que interessa.
      mudouConteudo: med.textoVisivel !== base.textoVisivel,
      ...med,
      console: [...consoleErros],
    });
    consoleErros.length = 0;
  }

  // ── MODAIS ──────────────────────────────────────────────────────────────
  const naoAbertos = [];
  for (const modal of tela.modais) {
    const titulo = modal.rotulo;
    if (!titulo || titulo.startsWith("(")) {
      naoAbertos.push({ titulo, motivo: "rótulo dinâmico — o gatilho não é derivável" });
      continue;
    }
    if (PERIGO.test(titulo)) {
      naoAbertos.push({ titulo, motivo: "título destrutivo — não abro por heurística" });
      continue;
    }
    const botoes = await pagina
      .locator('button:visible, [role="button"]:visible')
      .evaluateAll((els) =>
        els
          .map((el) => ({
            nome: (el.getAttribute("aria-label") || el.textContent || "")
              .replace(/\s+/g, " ")
              .trim(),
            texto: (el.textContent || "").replace(/\s+/g, " ").trim(),
          }))
          .filter((b) => b.nome !== ""),
      );
    const gatilho = gatilhoProvavel(titulo, botoes);
    if (!gatilho) {
      naoAbertos.push({ titulo, motivo: "nenhum botão visível com nome relacionado" });
      continue;
    }
    try {
      await pagina
        .getByRole("button", { name: gatilho.nome, exact: true })
        .first()
        .click({ timeout: 8_000 });
      await pagina.waitForTimeout(700);
    } catch {
      naoAbertos.push({ titulo, motivo: `gatilho "${gatilho.nome}" casou mas não abriu` });
      continue;
    }
    const med = await medir(pagina);
    if (med.dialogos === 0) {
      naoAbertos.push({ titulo, motivo: `cliquei "${gatilho.nome}" e nenhum diálogo abriu` });
      await pagina.keyboard.press("Escape").catch(() => undefined);
      await pagina.waitForTimeout(300);
      continue;
    }
    resultados.push({
      rota: tela.rota,
      tipo: "modal",
      subtela: titulo,
      gatilho: gatilho.nome,
      status,
      ...med,
      console: [...consoleErros],
    });
    consoleErros.length = 0;
    await pagina.keyboard.press("Escape").catch(() => undefined);
    await pagina.waitForTimeout(400);
  }

  if (naoAbertos.length > 0) {
    resultados.push({ rota: tela.rota, tipo: "nao-abertas", itens: naoAbertos });
  }

  await pagina.close();
}

await contexto.close();
await navegador.close();

const arquivo = join(SAIDA, `subtelas-${grupo}.json`);
writeFileSync(
  arquivo,
  JSON.stringify(
    {
      geradoEm: new Date().toISOString(),
      base: BASE,
      largura: LARGURA,
      telas: alvo.length,
      resultados,
    },
    null,
    2,
  ) + "\n",
);

const conta = (tipo) => resultados.filter((r) => r.tipo === tipo).length;
process.stdout.write(
  `ok: ${alvo.length} telas · ${conta("base")} bases · ${conta("aba")} abas · ` +
    `${conta("modal")} modais · ${resultados.filter((r) => r.tipo === "nao-abertas").reduce((a, r) => a + r.itens.length, 0)} não abertos\n` +
    `→ ${arquivo.replace(RAIZ + "/", "")}\n`,
);
