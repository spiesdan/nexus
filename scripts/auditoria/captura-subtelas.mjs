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

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Localiza a aba pelo nome, tolerando o que a tela acrescenta.
 *
 * `TabsTrigger` do produto costuma concatenar contador:
 * `{t("Abertos")}{data ? ` (${data.open_count})` : ""}`. O nome acessível vira
 * "Abertos (3)" e um `exact: true` com "Abertos" não casa — foi o que fez 24
 * abas aparecerem como "não encontradas no DOM" em 16/11/2026, quando elas
 * estavam lá, com o número do lado.
 */
function localizarAba(pagina, rotulo, familia) {
  const papel = familia === "aba-caseira" ? "button" : "tab";
  const exato = pagina.getByRole(papel, { name: rotulo, exact: true }).first();
  return {
    exato,
    porTrecho: pagina.getByRole(papel, { name: new RegExp(escapeRe(rotulo), "i") }).first(),
  };
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
/**
 * Casa a rota PEDIDA com a do INVENTÁRIO.
 *
 * O inventário tem `/app/pedidos/[id]`; quem pede passa
 * `/app/pedidos/303befd2-…` (id real, de `ids-para-rotas-dinamicas.mjs`).
 * Igualdade seca não casaria e a varredura das telas dinâmicas sairia "0 telas".
 */
function casa(pedida, rotaInventario) {
  if (pedida === rotaInventario) return true;
  const padrao = new RegExp(
    "^" +
      rotaInventario
        .split("/")
        .map((p) => (/^\[.*\]$/.test(p) ? "[^/]+" : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        .join("/") +
      "$",
  );
  return padrao.test(pedida);
}

/**
 * Uma URL pedida pertence a UMA tela do inventário — a mais específica.
 *
 * O primeiro `casa()` deixou `/app/ai/agents/[id]` reivindicar
 * `/app/ai/agents/new` (o padrão `[^/]+` casa "new"): a passada do `dono` mediu
 * a tela de CRIAÇÃO e gravou como se fosse a de edição, produzindo 10 "abas não
 * encontradas" que não existiam. Ordem de precedência: rota exata primeiro,
 * padrão depois — e cada URL só pode ser consumida uma vez.
 */
const alvo = (() => {
  const telas = inventario.telas.filter(
    (t) => t.abas.length + t.modais.length + t.gavetas.length > 0,
  );
  if (!pedidas) return telas.map((t) => ({ ...t, url: t.rota }));
  const usadas = new Set();
  const saida = [];
  for (const t of telas) {
    const exata = pedidas.find((p) => p.trim() === t.rota);
    if (exata && !usadas.has(exata.trim())) {
      usadas.add(exata.trim());
      saida.push({ ...t, url: exata.trim() });
    }
  }
  for (const t of telas) {
    if (saida.some((s) => s.rota === t.rota)) continue;
    const casada = pedidas.find((p) => !usadas.has(p.trim()) && casa(p.trim(), t.rota));
    if (casada) {
      usadas.add(casada.trim());
      saida.push({ ...t, url: casada.trim() });
    }
  }
  return saida;
})();

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

  const url = `${BASE}${tela.url ?? tela.rota}`;
  let status = 0;
  try {
    const resp = await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    status = resp?.status() ?? 0;
  } catch (e) {
    resultados.push({ rota: tela.rota, tipo: "rota", erro: String(e).slice(0, 200) });
    await pagina.close();
    continue;
  }
  /**
   * Espera a tela TERMINAR de montar as abas.
   *
   * Medido em 16/11/2026 em `/app/products`: a lista de produtos chega depois do
   * primeiro paint, e as abas "Produtos e tabelas"/"Importar fotos" existem só
   * depois disso. Com 1.200 ms fixos o instrumento dizia "não encontrada" para
   * abas que apareciam em 2,5 s — de novo o instrumento acusando o produto.
   */
  for (let i = 0; i < 8; i++) {
    const temAba = await pagina
      .evaluate(() => document.querySelectorAll('[role="tab"], [aria-current]').length > 0)
      .catch(() => false);
    if (temAba) break;
    await pagina.waitForTimeout(500);
  }
  await pagina.waitForTimeout(600);
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
  const medidos = new Set();
  for (const item of tela.abas) {
    const rotulo = item.rotulo;
    if (!rotulo || rotulo.startsWith("(") || vistas.has(rotulo)) continue;
    vistas.add(rotulo);
    let { exato, porTrecho } = localizarAba(pagina, rotulo, item.tipo);
    let tab = (await exato.count()) > 0 ? exato : porTrecho;
    if ((await tab.count()) === 0) {
      // A aba pode ter DESAPARECIDO porque o laço anterior trocou de painel:
      // em `/app/products`, clicar em "Tabelas de preço" esconde os botões
      // "Produtos e tabelas"/"Importar fotos", que vivem no painel de trás.
      // Recarregar devolve o estado inicial e a aba aparece — medido em
      // 16/11/2026, era isso e não ausência de produto.
      await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
      await pagina.waitForTimeout(1_500);
      ({ exato, porTrecho } = localizarAba(pagina, rotulo, item.tipo));
      tab = (await exato.count()) > 0 ? exato : porTrecho;
    }
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
    // Ler atributo de um locator que acabou de sumir (o reload pode não ter
    // devolvido a aba) estourava com "Timeout 30000ms exceeded" e derrubava o
    // lote inteiro. Instrumento de auditoria não pode morrer por causa de uma
    // aba: registra e segue.
    let jaAtiva = false;
    try {
      // `aria-current` vale "page" nas barras do produto e "true" nas listas
      // filtradas (`CaseList`). Exigir só "page" marcava como "clicou e não
      // selecionou" uma aba que estava selecionada — medido em 16/11/2026.
      const corrente = await tab.getAttribute("aria-current", { timeout: 3_000 });
      jaAtiva = (await tab.getAttribute("aria-selected", { timeout: 3_000 })) === "true" || Boolean(corrente);
    } catch {
      jaAtiva = false;
    }
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
    medidos.add(`${tela.rota}|${rotulo}`);
    // `null` = NÃO DETERMINADO, e isso é diferente de `false`.
    //
    // Aba cujo rótulo ganha contador ao ativar ("Importar fotos" → "Importar
    // fotos (12)") recria o elemento: o locator resolvido antes do clique
    // aponta para o nó que saiu do DOM, a leitura estoura, e registrar `false`
    // inventava "clicou e não selecionou". Medido em 16/11/2026 em 390 px.
    // Quem não conseguiu ler diz que não conseguiu — não acusa.
    let ativaDepois = null;
    try {
      const correnteDepois = await tab.getAttribute("aria-current", { timeout: 3_000 });
      ativaDepois =
        (await tab.getAttribute("aria-selected", { timeout: 3_000 })) === "true" ||
        Boolean(correnteDepois);
    } catch {
      ativaDepois = null;
    }
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
  //
  // Duas passadas. A primeira tenta o gatilho por NOME (o botão que compartilha
  // palavra com o `<DialogTitle>`). A segunda EXPLORA os botões da tela: clica,
  // vê se abriu diálogo, mede e fecha. Só a segunda alcança o caso comum — o
  // botão "Novo" que abre o diálogo "Cadastrar fornecedor" não compartilha
  // palavra nenhuma com o título.
  //
  // A guarda é a mesma nas duas: `PERIGO` (verbo destrutivo) nunca é clicado.
  // Explorar uma tela clicando em tudo é como se apaga dado de cliente.
  const naoAbertos = [];
  const abertos = new Set();

  /**
   * Abas DENTRO do modal — subtela aninhada.
   *
   * Medido em 16/11/2026: "Pessoa jurídica" e "Pessoa física" são
   * `<TabsTrigger>` de `NewContactDialog`. Elas não existem na página; existem
   * depois de abrir o diálogo. A varredura contava 2 abas "não encontradas" e o
   * produto estava certo — faltava abrir a caixa.
   */
  /**
   * Abas que APARECERAM depois de um clique, dentro de um painel.
   *
   * A ficha do produto não é diálogo: ela entra inline quando a pessoa clica em
   * "Novo produto", e só então as cinco abas existem. A exploração antiga só
   * olhava `[role=dialog]`, então nunca as via — e o relatório dizia "não
   * encontradas" para abas que estavam a um clique de distância.
   *
   * Aqui o critério é o que se pode MEDIR: quantas abas visíveis existem agora,
   * e quais ainda não foram medidas nesta tela.
   */
  async function abasQueApareceram(contexto, prefixo) {
    const escopo = contexto ?? pagina;
    const nomes = await escopo
      .getByRole("tab")
      .evaluateAll((els) =>
        els.map((el) => (el.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean),
      );
    for (const nome of [...new Set(nomes)].slice(0, 10)) {
      if (vistas.has(nome) || medidos.has(`${tela.rota}|${nome}`)) continue;
      const tab = escopo.getByRole("tab", { name: new RegExp(escapeRe(nome), "i") }).first();
      if ((await tab.count()) === 0) continue;
      try {
        await tab.click({ timeout: 4_000 });
        await pagina.waitForTimeout(450);
      } catch {
        continue;
      }
      const med = await medir(pagina);
      resultados.push({
        rota: tela.rota,
        tipo: "aba-painel",
        // O nome da aba vem primeiro; o clique que a revelou é dado separado.
        // Juntar os dois em `subtela` produzia rótulo errado: a aba aparecia
        // porque "Cadastrar produto" foi clicado antes, e o registro dizia
        // "Dispensar aviso › Informações gerais".
        subtela: nome,
        depoisDe: prefixo || null,
        status,
        ...med,
        console: [...consoleErros],
      });
      consoleErros.length = 0;
      vistas.add(nome);
      medidos.add(`${tela.rota}|${nome}`);
    }
  }

  async function abasDoModal(tituloModal) {
    const dentro = pagina.locator('[role="dialog"]:not([aria-hidden="true"])');
    const nomes = await dentro
      .getByRole("tab")
      .evaluateAll((els) =>
        els.map((el) => (el.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean),
      );
    for (const nome of [...new Set(nomes)].slice(0, 8)) {
      const tab = dentro.getByRole("tab", { name: new RegExp(escapeRe(nome), "i") }).first();
      if ((await tab.count()) === 0) continue;
      try {
        await tab.click({ timeout: 5_000 });
        await pagina.waitForTimeout(500);
      } catch {
        continue;
      }
      const med = await medir(pagina);
      resultados.push({
        rota: tela.rota,
        tipo: "aba-modal",
        subtela: `${tituloModal} › ${nome}`,
        status,
        ...med,
        console: [...consoleErros],
      });
      consoleErros.length = 0;
    }
  }

  async function medirModal(titulo, gatilho) {
    const med = await medir(pagina);
    if (med.dialogos === 0) return false;
    resultados.push({
      rota: tela.rota,
      tipo: "modal",
      subtela: titulo,
      gatilho,
      status,
      ...med,
      console: [...consoleErros],
    });
    consoleErros.length = 0;
    abertos.add(titulo);
    await abasDoModal(titulo);
    await pagina.keyboard.press("Escape").catch(() => undefined);
    await pagina.waitForTimeout(400);
    return true;
  }

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
          }))
          .filter((b) => b.nome !== ""),
      );
    const gatilho = gatilhoProvavel(titulo, botoes);
    if (!gatilho) continue; // a exploração abaixo cobre
    try {
      await pagina
        .getByRole("button", { name: gatilho.nome, exact: true })
        .first()
        .click({ timeout: 6_000 });
      await pagina.waitForTimeout(700);
    } catch {
      continue;
    }
    await medirModal(titulo, gatilho.nome);
  }

  // Exploração: para cada modal ainda não aberto, tenta os botões da tela.
  const pendentes = tela.modais
    .map((m) => m.rotulo)
    .filter((r) => r && !r.startsWith("(") && !PERIGO.test(r) && !abertos.has(r));
  if (pendentes.length > 0) {
    // O `evaluateAll` roda no NAVEGADOR: `PERIGO` é regex de Node e não existe
    // lá. O bloqueio de verbo destrutivo é aplicado aqui, depois de voltar.
    const nomes = (
      await pagina
        .locator('button:visible, [role="button"]:visible')
        .evaluateAll((els) =>
          els
            .map((el) =>
              (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim(),
            )
            .filter((n) => n !== ""),
        )
    ).filter((n) => !PERIGO.test(n));
    for (const clicavel of [...new Set(nomes)].slice(0, 40)) {
      const restantes = pendentes.filter((t) => !abertos.has(t));
      if (restantes.length === 0) break;
      const botao = pagina.getByRole("button", { name: clicavel, exact: true }).first();
      if ((await botao.count()) === 0) continue;
      try {
        await botao.click({ timeout: 4_000 });
        await pagina.waitForTimeout(600);
      } catch {
        continue;
      }
      const med = await medir(pagina);
      if (med.dialogos === 0) {
        // Não abriu diálogo — mas pode ter aberto um PAINEL com abas próprias
        // (a ficha de produto entra inline). Medir é barato; ignorar é o que
        // deixou 5 abas fora do relatório.
        await abasQueApareceram(null, clicavel);
        continue;
      }
      // Qual título entre os pendentes está no DOM? `[role=dialog]` sem aria-hidden.
      const texto = (
        await pagina
          .locator('[role="dialog"]:not([aria-hidden="true"])')
          .first()
          .innerText()
          .catch(() => "")
      ).replace(/\s+/g, " ");
      const alvo = restantes.find((t) => texto.includes(t)) ?? restantes[0];
      resultados.push({
        rota: tela.rota,
        tipo: "modal",
        subtela: alvo,
        gatilho: clicavel,
        porExploracao: true,
        status,
        ...med,
        console: [...consoleErros],
      });
      consoleErros.length = 0;
      abertos.add(alvo);
      await abasDoModal(alvo);
      await pagina.keyboard.press("Escape").catch(() => undefined);
      await pagina.waitForTimeout(400);
    }
  }

  for (const titulo of pendentes) {
    if (!abertos.has(titulo)) {
      naoAbertos.push({
        titulo,
        motivo:
          "nenhum botão visível abriu este diálogo (exploração com bloqueio de verbo destrutivo)",
      });
    }
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
