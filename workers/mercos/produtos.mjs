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
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { chromium } from "@playwright/test";

import { mapearColunas, COLUNAS_LEGADO } from "./catalogo-logica.mjs";

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : padrao;
};

const EMPRESA = process.env.MERCOS_EMPRESA || "338282";
const BASE = `https://app.mercos.com/${EMPRESA}`;
const EMAIL = process.env.MERCOS_EMAIL || "";
const SENHA = process.env.MERCOS_SENHA || "";
const SAIDA = arg("saida", "/tmp/mercos/produtos.jsonl");
const RESUMO = arg("resumo", "/tmp/mercos/produtos-resumo.json");
const LIMITE = Number(arg("limite", "0")) || Infinity;
/** 1,2 s entre páginas tomou 429 em 13/10/2026 (medido no coletor de pedidos). */
const ESPERA_MS = Number(arg("espera", process.env.MERCOS_ESPERA_MS || "2500"));
const MAX_PAGINAS = Number(arg("max-paginas", "500"));

if (!EMAIL || !SENHA) {
  console.error("MERCOS_EMAIL/MERCOS_SENHA ausentes");
  process.exit(2);
}

const log = (evento, dados = {}) =>
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), coletor: "mercos-produtos", evento, ...dados }) + "\n",
  );

mkdirSync(dirname(SAIDA), { recursive: true });
// O JSONL é reescrito do zero a cada execução: catálogo é retrato, não ledger.
writeFileSync(SAIDA, "");

const navegador = await chromium.launch({ headless: true });
const contexto = await navegador.newContext({ locale: "pt-BR", viewport: { width: 1440, height: 900 } });
const pagina = await contexto.newPage();

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
      return {
        celulas: tds.map((td) => (td.innerText ?? "").replace(/\s+/g, " ").trim()),
        foto: /^https?:/.test(src) && !/logo|megafone|sem_imagem|carregando/i.test(src) ? src : null,
      };
    });

    return { cabecalho, linhas, total: linhas.length };
  });
}

/** Avança uma página; `false` quando não há próxima (ou a página repetiu). */
async function proximaPagina(assinaturaAnterior) {
  const proxima = pagina.getByRole("link", { name: /pr[oó]xima/i }).first();
  if ((await proxima.count()) > 0) {
    await proxima.click();
  } else {
    // Grade sem "próxima" explícita: tenta o número seguinte ao atual.
    const atual = Number(await pagina.evaluate(() => {
      const ativo = document.querySelector(
        '[aria-current="page"], .pagination .active, .pager .active, li.active',
      );
      return (ativo?.textContent ?? "").trim();
    }));
    if (!Number.isFinite(atual) || atual <= 0) return false;
    const link = pagina.getByRole("link", { name: new RegExp(`^${atual + 1}$`) }).first();
    if ((await link.count()) === 0) return false;
    await link.click();
  }
  await pagina.waitForTimeout(ESPERA_MS);
  const assinatura = await pagina.evaluate(() => document.body.innerText.slice(0, 2000));
  return assinatura !== assinaturaAnterior;
}

let totalLido = 0;
let paginas = 0;
let cabecalhoLido = false;
let mapeamento = { mapa: COLUNAS_LEGADO, completo: false, faltando: ["codigo", "nome"] };

try {
  await entrar();

  // O filtro padrão da grade é o que o operador vê — e é o que o produto deve
  // espelhar. `?situacao=inativos` fica para uma segunda execução, se o dono
  // quiser produtos desativados no catálogo (o upsert marca `ativo`).
  await pagina.goto(`${BASE}/produtos/`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await pagina.waitForTimeout(ESPERA_MS);

  let assinatura = "";

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
      const registro = {
        codigo: celula("codigo"),
        nome: celula("nome"),
        unidade: celula("unidade"),
        preco: celula("preco"),
        ipi: celula("ipi"),
        comissao: celula("comissao"),
        estoque: celula("estoque"),
        foto: fotoDoProduto(linha.foto, celula("nome")),
        cabecalho_lido: cabecalhoLido,
        pagina: pag,
      };
      appendFileSync(SAIDA, JSON.stringify(registro) + "\n");
      totalLido += 1;
    }
    paginas = pag;

    if (totalLido >= LIMITE) break;

    assinatura = await pagina.evaluate(() => document.body.innerText.slice(0, 2000));
    const avancou = await proximaPagina(assinatura);
    if (!avancou) break;
  }

  const resumo = {
    produtos_lidos: totalLido,
    paginas,
    cabecalho_lido: cabecalhoLido,
    faltando_no_cabecalho: mapeamento.faltando ?? [],
    arquivo: SAIDA,
  };
  writeFileSync(RESUMO, JSON.stringify(resumo, null, 2) + "\n");
  log("fim", resumo);
} catch (erro) {
  log("erro", { detalhe: String(erro).slice(0, 400) });
  process.exitCode = 1;
} finally {
  await navegador.close();
}

/** A foto da linha só vale se houver célula de produto — o resto é ícone de UI. */
function fotoDoProduto(foto, nome) {
  return foto && nome ? foto : null;
}
