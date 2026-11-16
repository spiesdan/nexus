/**
 * CAPTURA VISUAL — o que a tela faz, medido em três larguras.
 *
 * ─── POR QUE ESTE SCRIPT EXISTE ─────────────────────────────────────────────
 * `curl` prova que a rota responde; não prova que a tela serve. Ele não vê
 * overflow horizontal, botão de 24 px no celular, contraste ruim, erro de
 * console, requisição falhando depois da hidratação nem estado vazio sem saída.
 * Este script abre o produto de verdade, nas três larguras que importam, e
 * registra o que mediu — inclusive quando a medida é "não consegui entrar".
 *
 * ─── ELE NÃO ESCREVE TESTE ──────────────────────────────────────────────────
 * Não é Playwright de CI: é instrumento de auditoria. Salva PNG + um JSON com
 * sinais objetivos por rota. A leitura é humana (ou de quem lê a imagem).
 *
 * ─── CREDENCIAL ─────────────────────────────────────────────────────────────
 * Lê `.e2e-creds.json` (gitignored) e NUNCA imprime e-mail, senha ou TOTP.
 * Contra o banco local do Supabase. Nenhuma chamada a serviço de produção.
 *
 * Uso:
 *   node scripts/auditoria/captura-visual.mjs --rotas /app,/app/inbox
 *   node scripts/auditoria/captura-visual.mjs --grupo inicio
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { join } from "node:path";

const RAIZ = process.cwd();
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const SAIDA = join(RAIZ, "docs", "auditoria", "capturas");

const LARGURAS = [
  { nome: "desktop", width: 1440, height: 900 },
  { nome: "tablet", width: 834, height: 1112 },
  { nome: "celular", width: 390, height: 844 },
];

const GRUPOS = {
  inicio: ["/login", "/app", "/app/inbox", "/app/kanban", "/app/contacts"],
  vendas: ["/app/pedidos", "/app/prospeccao", "/app/relatorios", "/app/comissoes", "/app/indicadores"],
  operacao: ["/app/estoque", "/app/compras", "/app/expedicao", "/app/financeiro", "/app/titulos"],
  admin: ["/app/settings", "/app/team", "/app/lgpd", "/app/ai", "/admin"],
};

/** TOTP padrão (RFC 6238), 6 dígitos, SHA-1, janela de 30 s. */
function totp(segredoBase32) {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of segredoBase32.replace(/=+$/, "").toUpperCase()) {
    const v = alfabeto.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const chave = Buffer.from(bytes);
  const contador = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(contador));
  const h = createHmac("sha1", chave).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const codigo = ((h.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return codigo;
}

const argumentos = process.argv.slice(2);
const args = new Map();
for (let i = 0; i < argumentos.length; i += 2) args.set(argumentos[i], argumentos[i + 1]);
const grupo = args.get("--grupo") ?? "inicio";
const rotas = (args.get("--rotas") ?? GRUPOS[grupo]?.join(",") ?? "/app").split(",");
const largurasPedidas = (args.get("--larguras") ?? "desktop,celular").split(",");
// Qual perfil do seed E2E entra. `manager` vê o produto; `dono` é admin de
// plataforma e é o único que alcança `/admin/*` sem cair no forbidden. Medir
// `/admin` com `manager` e chamar o resultado de "acesso negado" seria medir o
// guard funcionando, não a tela.
const perfil = args.get("--perfil") ?? "manager";
const larguras = LARGURAS.filter((l) => largurasPedidas.includes(l.nome));

mkdirSync(SAIDA, { recursive: true });
const creds = JSON.parse(readFileSync(join(RAIZ, ".e2e-creds.json"), "utf8"));
const email = creds.users[perfil]?.email ?? creds.users.admin?.email;
const senha = creds.password;
const segredo = perfil === "dono" ? creds.dono_totp?.secret : creds.admin_totp?.secret;

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "pt-BR",
  timezoneId: "America/Sao_Paulo",
  reducedMotion: "reduce",
});
const pagina = await contexto.newPage();

const errosDeConsole = [];
pagina.on("console", (m) => {
  if (m.type() === "error") errosDeConsole.push(m.text().slice(0, 200));
});
const falhasDeRede = [];
pagina.on("response", (r) => {
  if (r.status() >= 500) falhasDeRede.push(`${r.status()} ${new URL(r.url()).pathname}`);
});

async function entrar() {
  await pagina.goto(`${BASE}/login`, { waitUntil: "networkidle" });

  // Preencher antes da hidratação "cola" no DOM mas não no estado do React: ao
  // enviar, o formulário vai vazio e a tela responde "Email inválido". Já
  // aconteceu aqui. Então: espera a rede assentar, preenche e CONFIRMA o valor.
  const campoSenha = (await pagina.locator("#password").count()) > 0 ? "#password" : "input[type=password]";
  async function preencher(seletor, valor) {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      await pagina.fill(seletor, valor);
      if ((await pagina.inputValue(seletor)) === valor) return;
      await pagina.waitForLoadState("networkidle").catch(() => undefined);
    }
    throw new Error(`não consegui preencher ${seletor}`);
  }
  await preencher("#email", email);
  await preencher(campoSenha, senha);
  await pagina.locator("button[type=submit]").first().click();

  // O login é Server Action: o clique não muda a URL na hora. Navegar antes de
  // ele concluir cancela a autenticação e o script inteiro roda deslogado —
  // foi exatamente o que aconteceu na primeira execução (10 telas medidas,
  // todas caindo em /login). Espera a URL sair de /login.
  await pagina
    .waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 })
    .catch(() => undefined);

  // MFA, quando o perfil exige.
  if (pagina.url().includes("/mfa") || (await pagina.locator("input[autocomplete=one-time-code]").count()) > 0) {
    const campo = pagina.locator("input[autocomplete=one-time-code]").first();
    await campo.fill(totp(segredo));
    await pagina.locator("button[type=submit]").first().click();
    await pagina.waitForURL((u) => !u.pathname.includes("/mfa"), { timeout: 30000 }).catch(() => undefined);
  }
  return pagina.url();
}

const urlDepoisDoLogin = await entrar();

/** Mede o que dá para medir sem olho humano: overflow, alvos de toque, título, vazio. */
async function medir() {
  return pagina.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    const alvosPequenos = [...document.querySelectorAll("a,button,[role=button],input,select,textarea")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        return r.width < 40 || r.height < 40;
      })
      .length;
    const semRotulo = [...document.querySelectorAll("input,select,textarea")].filter((el) => {
      const id = el.getAttribute("id");
      const rotulo = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      return !rotulo && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby") && !el.getAttribute("placeholder");
    }).length;
    const h1 = [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()).filter(Boolean);
    return {
      titulo: document.title,
      overflowHorizontal: overflow,
      alvosMenoresQue40: alvosPequenos,
      camposSemRotulo: semRotulo,
      h1: h1.slice(0, 3),
      textoVisivel: (document.body.innerText || "").replace(/\s+/g, " ").trim().length,
      url: location.pathname,
    };
  });
}

const resultados = [];
for (const largura of larguras) {
  await pagina.setViewportSize({ width: largura.width, height: largura.height });
  for (const rota of rotas) {
    errosDeConsole.length = 0;
    falhasDeRede.length = 0;
    const inicio = Date.now();
    let status = 0;
    let erro = null;
    try {
      const resposta = await pagina.goto(`${BASE}${rota}`, { waitUntil: "networkidle", timeout: 45000 });
      status = resposta?.status() ?? 0;
    } catch (e) {
      erro = e instanceof Error ? e.message.slice(0, 120) : String(e);
    }
    const ms = Date.now() - inicio;
    const medida = erro ? null : await medir().catch(() => null);
    const nomeArquivo = `${largura.nome}${rota.replace(/[^a-z0-9]+/gi, "_")}.png`;
    if (!erro) await pagina.screenshot({ path: join(SAIDA, nomeArquivo), fullPage: false }).catch(() => undefined);
    resultados.push({
      rota,
      largura: largura.nome,
      status,
      ms,
      erro,
      arquivo: erro ? null : nomeArquivo,
      errosDeConsole: [...new Set(errosDeConsole)].slice(0, 5),
      falhasDeRede: [...new Set(falhasDeRede)].slice(0, 5),
      ...(medida ?? {}),
    });
    console.log(
      `${largura.nome.padEnd(8)} ${rota.padEnd(34)} ${String(status).padEnd(4)} ${String(ms).padStart(5)}ms` +
        (medida ? ` overflow=${medida.overflowHorizontal} alvos<40=${medida.alvosMenoresQue40} console=${resultados.at(-1).errosDeConsole.length}` : ` ERRO ${erro}`),
    );
  }
}

writeFileSync(
  join(SAIDA, `medicoes-${grupo}.json`),
  JSON.stringify({ base: BASE, grupo, perfil, url_depois_do_login: urlDepoisDoLogin.replace(/\?.*/, "?…"), resultados }, null, 2) + "\n",
);

await navegador.close();
console.log(`\nok: ${resultados.length} medições · capturas em docs/auditoria/capturas/`);
