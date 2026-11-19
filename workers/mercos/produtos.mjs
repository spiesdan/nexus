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
 * ─── ATIVOS × INATIVOS (`--todos`) ────────────────────────────────────────
 *
 * O default continua sendo a grade padrão (ativos). `--todos` percorre também
 * a visão de inativos e marca CADA linha com `ativo: true|false`, que é o que
 * permite medir os dois lados e importar inativo sem inventar status.
 *
 * O parâmetro foi confirmado na página real (container `crm-mercos-1`,
 * 19/11/2026), não chutado: a própria paginação devolve
 * `?p=1&status=1&nome_codigo=`, e `status=2` mostra o rótulo "Exibir produtos
 * inativos" com todas as linhas em `visibility_off`. **`?situacao=inativos`
 * não filtra nada** — devolve a mesma grade de ativos. Ver
 * `VISOES_DO_CATALOGO` em `catalogo-logica.mjs`.
 *
 * Uso:
 *   MERCOS_EMAIL=... MERCOS_SENHA=... node workers/mercos/produtos.mjs \
 *     --saida /tmp/mercos/produtos.jsonl [--limite 0] [--espera 2500]
 *   ... node workers/mercos/produtos.mjs --todos --saida /tmp/mercos/todos.jsonl
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { chromium } from "@playwright/test";

import {
  COLUNAS_LEGADO,
  mapearColunas,
  motivoDoVazio,
  rotasDoCatalogo,
  urlComStatus,
  visoesDoCatalogo,
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
async function abrirCatalogo(rotas, visao) {
  const tentadas = [];
  for (const url of rotas) {
    const resposta = await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await pagina.waitForTimeout(ESPERA_MS);
    const tabela = await pagina.evaluate(() => document.querySelectorAll("table tbody tr").length);
    tentadas.push({ situacao: visao.situacao, status: visao.status, url, http: resposta?.status() ?? null, linhas: tabela });
    log("rota_tentada", tentadas[tentadas.length - 1]);
    if (tabela > 0) return tentadas;
  }
  const erro = new Error(
    `nenhuma rota da visão ${visao.situacao} tem tabela: ${tentadas.map((x) => `${x.url} (HTTP ${x.http}, ${x.linhas} linhas)`).join(" · ")}`,
  );
  // Preserva o que foi tentado para o resumo da visão que falhou.
  erro.tentadas = tentadas;
  throw erro;
}
const EMAIL = process.env.MERCOS_EMAIL || "";
const SENHA = process.env.MERCOS_SENHA || "";
const SAIDA = arg("saida", "/tmp/mercos/produtos.jsonl");
const RESUMO = arg("resumo", "/tmp/mercos/produtos-resumo.json");
const LIMITE = Number(arg("limite", "0")) || Infinity;
/**
 * `--todos` é FLAG EXPLÍCITA. O default continua só ativos — quem não pediu a
 * visão de inativos não paga o custo dela nem corre o risco de marcar um
 * produto como inativo por uma coleta parcial.
 *
 * O limite é POR VISÃO: `--todos --limite 5` lê 5 ativos e 5 inativos. Um
 * limite global faria a segunda visão começar vazia e falhar alto, que é o
 * comportamento certo para um erro, mas não para um recorte de teste.
 */
const TODOS = process.argv.includes("--todos");
/** 1,2 s entre páginas tomou 429 em 13/10/2026 (medido no coletor de pedidos). */
const ESPERA_MS = Number(arg("espera", process.env.MERCOS_ESPERA_MS || "2500"));
const MAX_PAGINAS = Number(arg("max-paginas", "500"));

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

const navegador = await chromium.launch({ headless: true });
const contexto = await navegador.newContext({
  locale: "pt-BR",
  viewport: { width: 1440, height: 900 },
});
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
        foto:
          /^https?:/.test(src) && !/logo|megafone|sem_imagem|carregando/i.test(src) ? src : null,
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
    await link.click();
  }
  await pagina.waitForTimeout(ESPERA_MS);
  const assinatura = await pagina.evaluate(() => document.body.innerText.slice(0, 2000));
  return assinatura !== assinaturaAnterior;
}

/**
 * Coleta UMA visão (ativos ou inativos) e devolve o resultado com o motivo de
 * vazio — sem derrubar a outra. O exit final só é 0 se TODAS as visões pedidas
 * valeram; um erro numa não pode esconder a medição da outra.
 */
async function coletarVisao(visao, rotasBase) {
  let produtosLidos = 0;
  let paginas = 0;
  let cabecalhoLido = false;
  let mapeamento = { mapa: COLUNAS_LEGADO, completo: false, faltando: ["codigo", "nome"] };
  let tentadas = [];

  try {
    const rotas = rotasBase.map((rota) => urlComStatus(rota, visao.status));
    tentadas = await abrirCatalogo(rotas, visao);

    let assinatura = "";

    for (let pag = 1; pag <= MAX_PAGINAS; pag += 1) {
      const { cabecalho, linhas } = await lerTabela();

      if (pag === 1) {
        const m = mapearColunas(cabecalho);
        mapeamento = m;
        cabecalhoLido = m.completo;
        if (!m.completo) {
          log("cabecalho_incompleto", {
            situacao: visao.situacao,
            cabecalho,
            faltando: m.faltando,
            plano_b: COLUNAS_LEGADO,
          });
        }
      }

      if (linhas.length === 0) break;

      const mapa = mapeamento.mapa;
      for (const linha of linhas) {
        if (produtosLidos >= LIMITE) break;
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
          // A marca que o importador lê. `true` no default (só ativos);
          // `false` quando a linha veio da visão de inativos.
          ativo: visao.ativo,
          situacao: visao.situacao,
          cabecalho_lido: cabecalhoLido,
          pagina: pag,
        };
        appendFileSync(SAIDA, JSON.stringify(registro) + "\n");
        produtosLidos += 1;
      }
      paginas = pag;

      if (produtosLidos >= LIMITE) break;

      assinatura = await pagina.evaluate(() => document.body.innerText.slice(0, 2000));
      const avancou = await proximaPagina(assinatura);
      if (!avancou) break;
    }
  } catch (erro) {
    const detalhe = String(erro).slice(0, 400);
    log("visao_falhou", { situacao: visao.situacao, status: visao.status, detalhe });
    return {
      situacao: visao.situacao,
      status: visao.status,
      ativo: visao.ativo,
      produtos_lidos: produtosLidos,
      paginas,
      cabecalho_lido: cabecalhoLido,
      faltando: mapeamento.faltando ?? [],
      rota: null,
      tentadas: erro?.tentadas ?? tentadas,
      motivo: `falha ao abrir: ${String(erro).slice(0, 300)}`,
    };
  }

  const rota = tentadas.find((x) => x.linhas > 0)?.url ?? null;
  return {
    situacao: visao.situacao,
    status: visao.status,
    ativo: visao.ativo,
    produtos_lidos: produtosLidos,
    paginas,
    cabecalho_lido: cabecalhoLido,
    faltando: mapeamento.faltando ?? [],
    rota,
    tentadas,
    /*
     * Zero continua sendo falha — inclusive na visão de inativos. "0 inativos"
     * é exatamente o sintoma que `?situacao=inativos` produzia: a rota responde
     * 200, a grade de ativos aparece, e quem lê conclui que não há inativo
     * nenhum. A diferença entre "não há" e "não li" só existe se o coletor
     * disser qual foi.
     */
    motivo: motivoDoVazio({ paginas, produtosLidos }),
  };
}

try {
  await entrar();

  // A rota é descoberta no menu; o filtro de situação entra por cima dela.
  const doMenu = await rotaDoMenu(pagina);
  const rotasBase = [...new Set([...(doMenu ? [doMenu] : []), ...rotasDoCatalogo(EMPRESA)])];
  const visoes = visoesDoCatalogo(TODOS);

  log("inicio", {
    modo: TODOS ? "todos" : "ativos",
    visoes: visoes.map((v) => ({ situacao: v.situacao, status: v.status })),
    limite_por_visao: Number.isFinite(LIMITE) ? LIMITE : null,
    espera_ms: ESPERA_MS,
  });

  const resultados = [];
  for (const visao of visoes) {
    resultados.push(await coletarVisao(visao, rotasBase));
  }

  const porSituacao = (situacao) => resultados.find((r) => r.situacao === situacao) ?? null;
  const totalLido = resultados.reduce((soma, r) => soma + r.produtos_lidos, 0);
  const paginas = resultados.reduce((soma, r) => soma + r.paginas, 0);

  const resumo = {
    modo: TODOS ? "todos" : "ativos",
    produtos_lidos: totalLido,
    paginas,
    cabecalho_lido: resultados.every((r) => r.cabecalho_lido),
    faltando_no_cabecalho: [...new Set(resultados.flatMap((r) => r.faltando ?? []))],
    rota: resultados.find((r) => r.rota)?.rota ?? null,
    arquivo: SAIDA,
    ativos_lidos: porSituacao("ativos")?.produtos_lidos ?? 0,
    inativos_lidos: porSituacao("inativos")?.produtos_lidos ?? 0,
    paginas_ativos: porSituacao("ativos")?.paginas ?? 0,
    paginas_inativos: porSituacao("inativos")?.paginas ?? 0,
    visoes: resultados.map((r) => ({
      situacao: r.situacao,
      status: r.status,
      ativo: r.ativo,
      produtos_lidos: r.produtos_lidos,
      paginas: r.paginas,
      cabecalho_lido: r.cabecalho_lido,
      rota: r.rota,
      motivo: r.motivo,
    })),
  };
  writeFileSync(RESUMO, JSON.stringify(resumo, null, 2) + "\n");

  /*
   * ZERO NÃO É SUCESSO. Medido em produção: `{"produtos_lidos":0,"paginas":0,
   * "cabecalho_lido":false}` saía com exit 0 — o mesmo silêncio que o coletor
   * existe para eliminar. Só é sucesso se TODAS as visões pedidas leram alguma
   * página E alguma linha; o resto é falha declarada, com o motivo e as rotas
   * tentadas de cada uma.
   */
  const falhas = resultados.filter((r) => r.motivo);
  if (falhas.length > 0) {
    log("fim", { ...resumo, ok: false });
    for (const falha of falhas) {
      log("sem_catalogo", {
        situacao: falha.situacao,
        motivo: falha.motivo,
        rotas_tentadas: falha.tentadas,
        cabecalho: falha.cabecalho_lido ? "lido" : "nao lido",
      });
    }
    process.stdout.write(
      "\nFALHA: a coleta do catálogo voltou vazia.\n" +
        falhas
          .map(
            (f) =>
              `  visão ${f.situacao}: ${f.motivo}\n` +
              `    rotas: ${(f.tentadas ?? []).map((x) => `${x.url} (HTTP ${x.http}, ${x.linhas} linhas)`).join(" | ") || "—"}\n`,
          )
          .join("") +
        `  páginas lidas: ${paginas} · produtos: ${totalLido}\n` +
        "  o banco não é tocado por este script.\n",
    );
    process.exitCode = 1;
  } else {
    log("fim", { ...resumo, ok: true });
  }
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
