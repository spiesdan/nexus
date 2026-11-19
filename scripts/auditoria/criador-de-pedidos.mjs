/**
 * MEDIÇÃO DO CRIADOR DE PEDIDOS — estudo C.
 *
 * Caso único, para os dois desenhos: **cliente cadastrado + 3 produtos +
 * desconto + finalizar**. Conta cliques (pointerdown), teclas (keydown), tempo
 * (primeiro evento → pedido criado) e erros (console, pageerror, HTTP ≥ 400,
 * alerta visível). Roda 3 vezes por configuração e devolve a mediana.
 *
 * Uso:
 *   BASE=/app/pedidos/novo node scripts/auditoria/criador-de-pedidos.mjs
 *   BASE=/app/pedidos/novo-experimento node scripts/auditoria/criador-de-pedidos.mjs
 *
 * Fecha o navegador no mesmo processo (sem Chromium órfão) e NÃO grava nada
 * além do JSON de saída. Os pedidos criados ficam no banco LOCAL.
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const APP = process.env.APP_URL ?? "http://localhost:3021";
const ROTA = process.env.BASE ?? "/app/pedidos/novo";
const SAIDA = process.env.SAIDA ?? "/tmp/criador-medicao.json";
const EXECUCOES = Number(process.env.EXECUCOES ?? "3");
const creds = JSON.parse(readFileSync(".e2e-creds.json", "utf8"));

const CLIENTE = "Ana Souza";
/**
 * Três produtos distintos, pelo MESMO termo e pela navegação por teclado
 * (↓ + Enter) — é o caminho que o componente documenta ("Enter adiciona o
 * destacado; ↑↓ navegam"). Buscar por trecho de código não é confiável aqui:
 * os códigos do seed compartilham prefixo e o filtro é substring.
 */
const TERMO_PRODUTO = "Alerta";
const PRODUTOS = [{ setas: 0 }, { setas: 1 }, { setas: 2 }];

const LARGURAS = [
  { nome: "desktop", width: 1440, height: 900 },
  { nome: "celular", width: 390, height: 844 },
];

const navegador = await chromium.launch();
const resultados = [];

async function entrar() {
  const ctx = await navegador.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.goto(`${APP}/login`, { waitUntil: "networkidle", timeout: 180000 });
  await p.fill("#email, input[type=email]", creds.users.manager.email);
  await p.fill("#password, input[type=password]", creds.password);
  await p.click("button[type=submit]");
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90000 });
  const estado = await ctx.storageState();
  await ctx.close();
  return estado;
}

/** Contadores de interação: qualquer pointerdown/keydown conta, em qualquer elemento. */
async function novaPagina(estado, largura) {
  const ctx = await navegador.newContext({
    storageState: estado,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    viewport: { width: largura.width, height: largura.height },
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(() => {
    window.__m = { cliques: 0, teclas: 0, t0: 0 };
    const marcar = () => {
      if (!window.__m.t0) window.__m.t0 = Date.now();
    };
    addEventListener("pointerdown", () => {
      window.__m.cliques += 1;
      marcar();
    }, true);
    addEventListener("keydown", () => {
      window.__m.teclas += 1;
      marcar();
    }, true);
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text().slice(0, 160));
  });
  p.on("pageerror", (e) => erros.push(String(e).slice(0, 160)));
  p.on("response", (r) => {
    if (r.status() >= 400 && /\/api\/v1\//.test(r.url())) erros.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
  });
  return { ctx, p, erros };
}

async function rodar(estado, largura) {
  const { ctx, p, erros } = await novaPagina(estado, largura);
  const inicio = Date.now();
  let sucesso = false;
  let motivo = "";

  try {
    await p.goto(`${APP}${ROTA}`, { waitUntil: "networkidle", timeout: 180000 });

    // 1. cliente cadastrado
    const buscaCliente = p.getByPlaceholder(/Buscar cliente por nome/i);
    await buscaCliente.click();
    await buscaCliente.type(CLIENTE, { delay: 25 });
    await p.locator(`[aria-label^="${CLIENTE}"]`).first().click({ timeout: 15000 });

    // 2. três produtos (busca por código + Enter)
    for (const produto of PRODUTOS) {
      const busca = p.getByPlaceholder(/Buscar produto/i);
      await busca.click();
      await busca.type(TERMO_PRODUTO, { delay: 25 });
      // A busca tem debounce de 150 ms: Enter antes disso não acha nada e o
      // produto não entra — foi assim que a primeira rodada mediu "0 itens".
      await p.waitForFunction(
        (c) => [...document.querySelectorAll("li button")].some((b) => (b.textContent ?? "").includes(c)),
        TERMO_PRODUTO,
        { timeout: 5000 },
      );
      for (let i = 0; i < produto.setas; i += 1) await p.keyboard.press("ArrowDown");
      await p.keyboard.press("Enter");
      await p.waitForTimeout(200);
    }

    const itensAdicionados = await p.locator('[aria-label="Remover item"]').count();
    if (itensAdicionados !== PRODUTOS.length) {
      throw new Error(`esperava ${PRODUTOS.length} itens, a tela tem ${itensAdicionados}`);
    }

    // 3. desconto
    const desconto = p.locator("#desconto");
    await desconto.click();
    await desconto.type("5", { delay: 25 });
    await p.waitForTimeout(150);

    // 4. finalizar — desktop: cabeçalho; celular: barra fixa do rodapé.
    const noCabecalho = p.locator('[data-testid="gerar-pedido"]');
    if (await noCabecalho.isVisible().catch(() => false)) {
      await noCabecalho.click();
    } else {
      await p.locator('[data-testid="gerar-pedido-barra"]').click();
    }

    // Sucesso = saiu da tela de criação (lista ou detalhe).
    await p.waitForURL((u) => !u.pathname.startsWith(ROTA), { timeout: 60000 });
    sucesso = true;
  } catch (e) {
    motivo = String(e).slice(0, 200);
  }

  const ms = Date.now() - inicio;
  const contadores = await p.evaluate(() => window.__m ?? { cliques: 0, teclas: 0, t0: 0 }).catch(() => ({ cliques: 0, teclas: 0, t0: 0 }));
  const alerta = await p.evaluate(() => {
    const el = [...document.querySelectorAll('[role="alert"]')].find((e) => e.offsetParent !== null);
    return el?.textContent?.trim().slice(0, 120) ?? null;
  }).catch(() => null);

  await ctx.close();
  return {
    largura: largura.nome,
    tela: ROTA,
    sucesso,
    motivo,
    ms,
    cliques: contadores.cliques,
    teclas: contadores.teclas,
    erros: erros.length,
    erroExemplos: erros.slice(0, 3),
    alerta,
  };
}

const estado = await entrar();
for (const largura of LARGURAS) {
  for (let i = 1; i <= EXECUCOES; i += 1) {
    const r = await rodar(estado, largura);
    console.log(
      `${r.tela} ${r.largura} #${i} sucesso=${r.sucesso} cliques=${r.cliques} teclas=${r.teclas} ms=${r.ms} erros=${r.erros}${r.alerta ? ` alerta=${r.alerta}` : ""}${r.motivo ? ` motivo=${r.motivo}` : ""}`,
    );
    resultados.push(r);
  }
}

const mediana = (ns) => {
  const v = ns.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
};

const resumo = LARGURAS.map((l) => {
  const meus = resultados.filter((r) => r.largura === l.nome);
  return {
    largura: l.nome,
    execucoes: meus.length,
    sucessos: meus.filter((r) => r.sucesso).length,
    cliques: mediana(meus.map((r) => r.cliques)),
    teclas: mediana(meus.map((r) => r.teclas)),
    ms: mediana(meus.map((r) => r.ms)),
    erros: mediana(meus.map((r) => r.erros)),
  };
});

writeFileSync(SAIDA, JSON.stringify({ tela: ROTA, execucoes: resultados, resumo }, null, 2) + "\n");
console.log("\nRESUMO", JSON.stringify(resumo));
await navegador.close();
