/**
 * COLETOR DO CATÁLOGO DE PRODUTOS DO MERCOS — `/produtos/`.
 *
 * ─── POR QUE ELE EXISTE ───────────────────────────────────────────────────
 *
 * O worker só lia `/pedidos/`. Consequência medida em produção (18/11/2026):
 * **616 itens** de pedido com `product_id IS NULL` em **72 códigos** — porque o
 * produto nunca apareceu em pedido nenhum, e o catálogo nunca foi lido do ERP.
 * O código `411` existe lá (`TOALHINHA 5KG`, 2010 itens), e mesmo assim o item
 * dele pode ficar sem vínculo se o produto não estiver no nosso catálogo na
 * hora da importação.
 *
 * ─── O CONTRATO COM A PÁGINA (e como ele é tratado) ───────────────────────
 *
 * A grade é uma `<table>`: código, nome, IPI, unidade, comissão, preço. O
 * extrator legado (`docs/legacy/mercos-scrape/extrair-catalogo.ts`) lê por
 * POSIÇÃO (2, 3, 7). Posição fixa quebra em silêncio quando o ERP reordena —
 * e o sintoma é preço virando nome, sem erro nenhum.
 *
 * Aqui o **cabeçalho manda**: as colunas são mapeadas pelo texto do `<thead>`.
 * Se o cabeçalho não for legível, o coletor cai no plano B declarado
 * (`COLUNAS_LEGADO`) e marca cada linha com `cabecalho_lido: false` para o
 * relatório mostrar o que foi feito no escuro.
 *
 * ─── O QUE ELE NÃO FAZ ────────────────────────────────────────────────────
 *
 * Não escreve no banco: grava JSONL incremental (retomável) e para. O upsert é
 * `catalogo.mjs`, que roda em dry-run por padrão.
 *
 * Uso:
 *   MERCOS_EMAIL=... MERCOS_SENHA=... node workers/mercos/produtos.mjs \
 *     --saida /tmp/mercos/produtos.jsonl [--limite 0] [--espera 2500]
 *
 *   # com os inativos (status=0): 847 em vez de 601
 *   ... node workers/mercos/produtos.mjs --todos --saida /tmp/mercos/todos.jsonl
 *
 * O modo não muda o formato da saída: as linhas ganham `ativo` (o que o próprio
 * botão da linha diz) e o resumo ganha `modo`, `total_no_erp` e
 * `produtos_inativos`.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { chromium } from "@playwright/test";

import {
  COLUNAS_LEGADO,
  coletaIncompleta,
  mapearColunas,
  motivoDoVazio,
  rotasDoCatalogo,
  STATUS_DA_GRADE,
} from "./catalogo-logica.mjs";

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : padrao;
};

const EMPRESA = process.env.MERCOS_EMPRESA || "338282";
const BASE = `https://app.mercos.com/${EMPRESA}`;

/**
 * A rota que o MENU autenticado aponta — descoberta, não adivinhação.
 *
 * O segmento do meio muda com o tipo de conta (`/industria/`, e há instalações
 * em `/distribuidor/`). Ler do menu evita transformar essa diferença num 404
 * silencioso de novo.
 */
async function rotaDoMenu(pagina) {
  return pagina
    .evaluate(() => {
      const link = [...document.querySelectorAll("a[href]")].find(
        (a) =>
          (a.textContent ?? "").replace(/\s+/g, " ").trim() === "Produtos" &&
          /produtos\/?$/i.test(a.getAttribute("href") ?? ""),
      );
      return link ? new URL(link.href, location.href).href : null;
    })
    .catch(() => null);
}

/**
 * Vai para a primeira rota que REALMENTE tem a grade.
 *
 * Medido em 18/11/2026: `/338282/produtos/` devolve 404 e o `goto` não lança —
 * a página de erro tem `<h1>` e texto, então o coletor "lê zero linhas" e
 * termina com sucesso. Aqui cada tentativa é registrada com HTTP e presença de
 * tabela, e nenhuma tabela é erro.
 */
async function abrirCatalogo(rotas) {
  const tentadas = [];
  for (const url of rotas) {
    const resposta = await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await pagina.waitForTimeout(ESPERA_MS);
    const tabela = await pagina.evaluate(() => document.querySelectorAll("table tbody tr").length);
    tentadas.push({ url, http: resposta?.status() ?? null, linhas: tabela });
    log("rota_tentada", tentadas[tentadas.length - 1]);
    if (tabela > 0) return tentadas;
  }
  throw new Error(
    `nenhuma rota do catálogo tem tabela: ${tentadas.map((x) => `${x.url} (HTTP ${x.http}, ${x.linhas} linhas)`).join(" · ")}`,
  );
}
const EMAIL = process.env.MERCOS_EMAIL || "";
const SENHA = process.env.MERCOS_SENHA || "";
const SAIDA = arg("saida", "/tmp/mercos/produtos.jsonl");
const RESUMO = arg("resumo", "/tmp/mercos/produtos-resumo.json");
const LIMITE = Number(arg("limite", "0")) || Infinity;
/** 1,2 s entre páginas tomou 429 em 13/10/2026 (medido no coletor de pedidos). */
const ESPERA_MS = Number(arg("espera", process.env.MERCOS_ESPERA_MS || "2500"));
const MAX_PAGINAS = Number(arg("max-paginas", "500"));

/**
 * `--todos` = a lista COMPLETA, com os produtos inativos (`status=0`).
 *
 * Medido em 19/11/2026, no `crm-mercos-1`: a pílula de paginação da grade
 * carrega o filtro — `.?p=2&status=1&nome_codigo=` — e o contador de registros
 * (`/contar_produtos/<rep>/`) diz o que cada valor significa:
 *
 *   status=1 → **601** (só ativos; é o padrão da tela)
 *   status=0 → **847** (**todos**: 246 inativos no meio)
 *   status=2 → só os inativos
 *
 * As tentativas anteriores por `?situacao=inativos`, `?inativos=true`,
 * `?ativos=false`, `?situacao=todos` e `?status=inativos` não mudavam nada
 * porque o parâmetro é `status` e o valor é numérico. O menu de exportação
 * ("apenas ativos" × "todos") é o mesmo filtro — e entrega por e-mail; pela
 * grade não é preciso esperar e-mail nenhum.
 *
 * O contador também é o **teto**: se a coleta ler menos que o total informado,
 * ela falha. Foi assim que a execução de 19/11 parou na página 5 (75 de 601) e
 * na 33 (495 de 601) com `ok: true`.
 */
const TODOS = process.argv.includes("--todos");
/** `status` da grade: 1 = ativos (padrão), 0 = todos, 2 = só inativos. */
const STATUS = TODOS ? STATUS_DA_GRADE.todos : STATUS_DA_GRADE.ativos;

if (!EMAIL || !SENHA) {
  console.error("MERCOS_EMAIL/MERCOS_SENHA ausentes");
  process.exit(2);
}

const log = (evento, dados = {}) =>
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), coletor: "mercos-produtos", evento, ...dados }) +
      "\n",
  );

mkdirSync(dirname(SAIDA), { recursive: true });
// O JSONL é reescrito do zero a cada execução: catálogo é retrato, não ledger.
writeFileSync(SAIDA, "");

let navegador = null;
let pagina = null;

/** Só abre o navegador quem precisa dele: a planilha do e-mail não precisa. */
async function abrirNavegador() {
  navegador = await chromium.launch({ headless: true });
  const contexto = await navegador.newContext({
    locale: "pt-BR",
    viewport: { width: 1440, height: 900 },
  });
  pagina = await contexto.newPage();
}

async function entrar() {
  await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await pagina.fill('input[type="email"], input[name="email"]', EMAIL);
  await pagina.fill('input[type="password"], input[name="senha"]', SENHA);
  await pagina.click('button[type="submit"], input[type="submit"]');
  await pagina.waitForURL((u) => !String(u).includes("/login"), { timeout: 120_000 });
  log("login", { ok: true });
}

/**
 * Lê a tabela da página atual.
 *
 * Devolve as linhas CRUAS (texto de cada célula, pelo índice mapeado) e o
 * cabeçalho lido — quem decide o que é divergente é a lógica pura, não o
 * navegador.
 */
async function lerTabela() {
  return pagina.evaluate(() => {
    const tabela = document.querySelector("table");
    if (!tabela) return { cabecalho: [], linhas: [], total: 0 };

    const cabecalho = [...tabela.querySelectorAll("thead th")].map((th) =>
      (th.textContent ?? "").replace(/\s+/g, " ").trim(),
    );

    const linhas = [...tabela.querySelectorAll("tbody tr")].map((tr) => {
      const tds = [...tr.querySelectorAll("td")];
      const img = tr.querySelector("td img");
      const src = img ? img.currentSrc || img.src || "" : "";
      /*
       * A LINHA DIZ SE O PRODUTO ESTÁ ATIVO.
       *
       * Cada `<tr>` traz dois botões: `js-produto-ativo` (visível quando está
       * ativo) e `js-produto-inativo hidden` (visível quando está inativo). É o
       * ERP dizendo o estado — não uma inferência nossa a partir do filtro.
       */
      const inativo = tr.querySelector("a.js-produto-inativo");
      return {
        ativo: inativo ? inativo.className.includes("hidden") : null,
        celulas: tds.map((td) => (td.innerText ?? "").replace(/\s+/g, " ").trim()),
        foto:
          /^https?:/.test(src) && !/logo|megafone|sem_imagem|carregando/i.test(src) ? src : null,
      };
    });

    return { cabecalho, linhas, total: linhas.length };
  });
}

/**
 * O TETO INFORMADO PELO ERP — `/contar_produtos/<representada>/?&status=N`.
 *
 * A tela tem o botão "Contar registros" e a `div` que o dispara carrega a rota
 * inteira no `onclick`. A gente lê a rota de lá (em vez de montar), troca o
 * `status` pelo nosso e pede: devolve `{\"total\": N}`.
 *
 * É o que transforma "parou de paginar" em **falha**: sem teto, uma grade que
 * para na página 5 é indistinguível de um catálogo de 75 itens — foi o que
 * aconteceu em 19/11/2026 (75 de 601 e 495 de 601, os dois com `ok: true`).
 *
 * `null` = não deu para perguntar (botão ausente, resposta estranha). A coleta
 * segue, e o resumo diz que o teto é desconhecido — não inventa completude.
 */
async function totalNoErp() {
  const rota = await pagina.evaluate(() => {
    const el = document.querySelector("#contarRegistro");
    const onclick = el?.getAttribute("onclick") ?? "";
    return /'(\/[^']*contar_produtos[^']*)'/.exec(onclick)?.[1] ?? null;
  });
  if (!rota) return null;

  const url = new URL(rota, "https://app.mercos.com");
  url.searchParams.set("status", STATUS);
  try {
    const resposta = await pagina.request.get(url.href, { timeout: 60_000 });
    const dados = await resposta.json();
    const total = Number(dados?.total);
    log("total_informado", {
      url: url.pathname + url.search,
      total: Number.isFinite(total) ? total : null,
    });
    return Number.isFinite(total) ? total : null;
  } catch (erro) {
    log("total_indisponivel", { detalhe: String(erro).slice(0, 160) });
    return null;
  }
}

/**
 * A IMPRESSÃO DIGITAL DA PÁGINA — o `id` da primeira linha (`produto_<id>`).
 *
 * O `innerText` do corpo serviu até 19/11/2026 e **mentiu**: comparar 2.000
 * caracteres de texto considerava "não avançou" quando a grade demorava a
 * trocar, e a coleta parava na página 5 com `ok: true` (75 de 601 produtos).
 * O id da linha é único e muda exatamente quando a página muda.
 */
async function impressaoDaGrade() {
  return pagina.evaluate(() => {
    const primeira = document.querySelector("table tbody tr");
    const ativa = document.querySelector(
      '[aria-current="page"], .pagination .active, .pager .active, li.active',
    );
    return `${primeira?.id ?? ""}|${(ativa?.textContent ?? "").trim()}`;
  });
}

/** Espera a grade mudar de verdade; `false` se ela não mudou no prazo. */
async function esperarGradeMudar(antes) {
  try {
    await pagina.waitForFunction(
      (anterior) => {
        const primeira = document.querySelector("table tbody tr");
        return `${primeira?.id ?? ""}` !== anterior.split("|")[0];
      },
      antes,
      { timeout: 30_000 },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Avança uma página.
 *
 * `false` = **não existe próxima** (fim real da grade). Deu para distinguir isso
 * de "cliquei e a página não trocou": o segundo caso agora **lança**, porque
 * antes ele virava fim de coleta e o relatório dizia sucesso com metade do
 * catálogo. Duas tentativas antes de desistir — a grade do ERP às vezes leva
 * mais que os 2,5 s de espera para renderizar.
 */
async function proximaPagina() {
  const proxima = pagina.getByRole("link", { name: /pr[oó]xima/i }).first();
  let alvo = null;

  if ((await proxima.count()) > 0) {
    alvo = proxima;
  } else {
    // Grade sem "próxima" explícita: tenta o número seguinte ao atual.
    const atual = Number(
      await pagina.evaluate(() => {
        const ativo = document.querySelector(
          '[aria-current="page"], .pagination .active, .pager .active, li.active',
        );
        return (ativo?.textContent ?? "").trim();
      }),
    );
    if (!Number.isFinite(atual) || atual <= 0) return false;
    const link = pagina.getByRole("link", { name: new RegExp(`^${atual + 1}$`) }).first();
    if ((await link.count()) === 0) return false;
    alvo = link;
  }

  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    const antes = await impressaoDaGrade();
    await alvo.click();
    if (await esperarGradeMudar(antes)) {
      await pagina.waitForTimeout(200); // deixa o resto das linhas pintar
      return true;
    }
    log("pagina_nao_avancou", { tentativa, impressao: antes });
  }

  throw new Error(
    'a grade não avançou depois de clicar em "Próxima" duas vezes — a coleta para aqui ' +
      "para não relatar catálogo incompleto como sucesso",
  );
}

let totalLido = 0;
let paginas = 0;
let cabecalhoLido = false;
let mapeamento = { mapa: COLUNAS_LEGADO, completo: false, faltando: ["codigo", "nome"] };
let modo = "ativos";
let totalErp = null;
let inativosLidos = 0;
let tentadas = [];
let rotaUsada = null;

function gravar(registro) {
  appendFileSync(SAIDA, JSON.stringify(registro) + "\n");
  totalLido += 1;
  if (registro.ativo === false) inativosLidos += 1;
}

/** Grade: descobre a rota, pagina, e grava conforme o cabeçalho manda. */
async function coletarGrade() {
  await abrirNavegador();
  await entrar();

  const doMenu = await rotaDoMenu(pagina);
  const doMenuComFiltro = doMenu ? `${doMenu}?p=1&status=${STATUS}&nome_codigo=` : null;
  const rotas = [
    ...new Set([
      ...(doMenuComFiltro ? [doMenuComFiltro] : []),
      ...rotasDoCatalogo(EMPRESA, STATUS),
    ]),
  ];
  tentadas = await abrirCatalogo(rotas);
  rotaUsada = tentadas.find((x) => x.linhas > 0)?.url ?? null;
  totalErp = await totalNoErp();

  for (let pag = 1; pag <= MAX_PAGINAS; pag += 1) {
    const { cabecalho, linhas } = await lerTabela();

    if (pag === 1) {
      const m = mapearColunas(cabecalho);
      mapeamento = m;
      cabecalhoLido = m.completo;
      if (!m.completo) {
        log("cabecalho_incompleto", { cabecalho, faltando: m.faltando, plano_b: COLUNAS_LEGADO });
      }
    }

    if (linhas.length === 0) break;

    const mapa = mapeamento.mapa;
    for (const linha of linhas) {
      if (totalLido >= LIMITE) break;
      const celula = (chave) => {
        const i = mapa[chave];
        return i === null || i === undefined ? null : (linha.celulas[i] ?? null);
      };
      gravar({
        codigo: celula("codigo"),
        nome: celula("nome"),
        unidade: celula("unidade"),
        preco: celula("preco"),
        ipi: celula("ipi"),
        comissao: celula("comissao"),
        estoque: celula("estoque"),
        foto: fotoDoProduto(linha.foto, celula("nome")),
        // O que o próprio botão da linha diz. `null` = não deu para ler.
        ativo: linha.ativo,
        cabecalho_lido: cabecalhoLido,
        pagina: pag,
      });
    }
    paginas = pag;

    if (totalLido >= LIMITE) break;

    const avancou = await proximaPagina();
    if (!avancou) break;
  }
}

try {
  modo = TODOS ? "todos" : "ativos";
  await coletarGrade();

  const resumo = {
    modo,
    produtos_lidos: totalLido,
    total_no_erp: totalErp,
    paginas,
    cabecalho_lido: cabecalhoLido,
    faltando_no_cabecalho: mapeamento.faltando ?? [],
    rota: rotaUsada,
    arquivo: SAIDA,
    produtos_inativos: inativosLidos,
  };
  writeFileSync(RESUMO, JSON.stringify(resumo, null, 2) + "\n");

  /*
   * ZERO NÃO É SUCESSO. Medido em produção: `{"produtos_lidos":0,"paginas":0,
   * "cabecalho_lido":false}` saía com exit 0 — o mesmo silêncio que o coletor
   * existe para eliminar. Só é sucesso se alguma página foi lida E alguma linha
   * entrou; o resto é falha declarada, com o motivo e as rotas tentadas.
   */
  /*
   * LEU MENOS QUE O ERP DISSE? ENTÃO NÃO TERMINOU.
   *
   * O contador do próprio ERP é a régua: 601 com `status=1`, 847 com `status=0`.
   * Se a coleta parar antes (paginação que não avança, aba que dorme), o número
   * não bate e isto falha — antes, saía `ok: true` com metade do catálogo.
   * `--limite` é a única razão legítima para ler menos.
   */
  if (coletaIncompleta({ lidos: totalLido, totalNoErp: totalErp, limite: LIMITE })) {
    log("coleta_incompleta", { lidos: totalLido, total_no_erp: totalErp });
    process.stdout.write(
      `\nFALHA: a coleta leu ${totalLido} de ${totalErp} produtos que o ERP diz ter.\n` +
        "  Ela parou antes do fim; o relatório NÃO deve ser usado como catálogo completo.\n",
    );
    process.exitCode = 1;
  }

  const motivo = motivoDoVazio({ paginas, produtosLidos: totalLido });
  if (motivo) {
    log("fim", { ...resumo, ok: false });
    log("sem_catalogo", {
      motivo,
      rotas_tentadas: tentadas,
      cabecalho: cabecalhoLido ? "lido" : "nao lido",
    });
    process.stdout.write(
      "\nFALHA: o catálogo voltou vazio.\n" +
        `  rotas tentadas: ${tentadas.map((x) => `${x.url} (HTTP ${x.http}, ${x.linhas} linhas)`).join(" | ") || "— (planilha)"}\n` +
        `  páginas lidas: ${paginas} · produtos: ${totalLido}\n` +
        "  nada foi gravado além do JSONL vazio; o banco não é tocado por este script.\n",
    );
    if (!process.exitCode) process.exitCode = 1;
  } else {
    log("fim", { ...resumo, ok: true });
  }
} catch (erro) {
  log("erro", { detalhe: String(erro).slice(0, 400) });
  process.exitCode = 1;
} finally {
  if (navegador) await navegador.close();
}

/** A foto da linha só vale se houver célula de produto — o resto é ícone de UI. */
function fotoDoProduto(foto, nome) {
  return foto && nome ? foto : null;
}
