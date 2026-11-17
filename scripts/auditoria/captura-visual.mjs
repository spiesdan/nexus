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
 *   node scripts/auditoria/captura-visual.mjs --faltantes --area admin --perfil dono
 *
 * `--area` restringe `--faltantes` a admin | tenant | publica. Precisa combinar
 * com `--perfil`: `/admin/**` é superfície do `dono`; medir com `manager`
 * devolve `/403` e o número vira "tela quebrada" em vez de "guarda funcionando".
 * `--larguras` aceita `desktop,tablet,celular,estreito,compacto,grande`
 * (padrão: desktop,celular).
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { join } from "node:path";

import { montarArtefato } from "./medicoes.mjs";

const RAIZ = process.cwd();
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const SAIDA = join(RAIZ, "docs", "auditoria", "capturas");

const LARGURAS = [
  { nome: "desktop", width: 1440, height: 900 },
  { nome: "tablet", width: 834, height: 1112 },
  { nome: "celular", width: 390, height: 844 },
  // Extremos do item 2.13: o iPhone SE de primeira geração (320), o Android
  // compacto (360) e o telefone grande (430). 390 é o meio, não o pior caso —
  // e é no pior caso que o overflow aparece.
  { nome: "estreito", width: 320, height: 720 },
  { nome: "compacto", width: 360, height: 780 },
  { nome: "grande", width: 430, height: 932 },
  // Zoom 200% em tela de 1440: o navegador vê 720 × 450 px de CSS. É o cenário
  // de quem aumenta a letra para ler — e o que revela layout que só funciona
  // porque a fonte coube.
  { nome: "zoom200", width: 720, height: 450 },
];

const GRUPOS = {
  inicio: ["/login", "/app", "/app/inbox", "/app/kanban", "/app/contacts"],
  vendas: [
    "/app/pedidos",
    "/app/prospeccao",
    "/app/relatorios",
    "/app/comissoes",
    "/app/indicadores",
  ],
  operacao: ["/app/estoque", "/app/compras", "/app/expedicao", "/app/financeiro", "/app/titulos"],
  // `/app/lgpd` NÃO é rota: o menu aponta para `/app/lgpd/requests`
  // (`lib/navigation/registry.ts`). O grupo pedia a inexistente e a varredura
  // registrava "404" como se o produto tivesse página quebrada (medido em
  // 17/11/2026 na largura 320).
  admin: ["/app/settings", "/app/team", "/app/lgpd/requests", "/app/ai", "/admin"],
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
const largurasPedidas = (args.get("--larguras") ?? "desktop,celular").split(",");
// Área do inventário. `/admin/**` só existe para o `dono`; medir com `manager`
// devolve `/403` e alguém lê "a tela de admin está quebrada".
const AREA = args.get("--area");
const daArea = (tela) => {
  if (!AREA) return true;
  if (AREA === "admin") return tela.startsWith("/admin");
  if (AREA === "tenant") return tela.startsWith("/app");
  if (AREA === "publica") return !tela.startsWith("/admin") && !tela.startsWith("/app");
  throw new Error(`--area desconhecida: ${AREA} (use admin|tenant|publica)`);
};

/**
 * `--faltantes`: lê o inventário e captura só o que ainda não tem PNG.
 *
 * Rota com `[id]`/`[token]` fica de fora e é REGISTRADA como pulada: capturar
 * `/app/pedidos/[id]` sem um id real mede a tela de não-encontrado e alguém
 * depois lê isso como "a tela está vazia".
 */
function rotasFaltantes() {
  const doc = readFileSync(join(RAIZ, "docs", "auditoria", "09-telas-estados.md"), "utf8");
  const telas = [...doc.matchAll(/^\| `([^`]+)`/gm)]
    .map((m) => m[1])
    .map((t) => t.replace(/\/\([^)]*\)/g, ""))
    .filter((t) => t.startsWith("/"));
  const existentes = new Set(readdirSync(SAIDA));
  const puladas = [];
  const restantes = [];
  for (const tela of telas) {
    if (!daArea(tela)) continue;
    if (tela.includes("[")) {
      puladas.push({ rota: tela, motivo: "rota dinâmica sem fixture (id/token real)" });
      continue;
    }
    const falta = largurasPedidas.some(
      (l) => !existentes.has(`${l}${tela.replace(/[^a-z0-9]+/gi, "_")}.png`),
    );
    if (falta) restantes.push(tela);
  }
  return { restantes, puladas };
}

const selecao = args.get("--rotas")
  ? { restantes: args.get("--rotas").split(","), puladas: [] }
  : args.get("--faltantes")
    ? rotasFaltantes()
    : { restantes: GRUPOS[grupo]?.join(",").split(",") ?? ["/app"], puladas: [] };
const rotas = selecao.restantes;
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
  const campoSenha =
    (await pagina.locator("#password").count()) > 0 ? "#password" : "input[type=password]";
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
  //
  // O `dono` (superfície `/admin/**`) tem fator TOTP; o `manager` desta instalação
  // não. E o campo NÃO é um input único: `components/auth/TOTPInput.tsx` desenha
  // **6 caixas de 1 dígito** com auto-avanço, e o 6º dígito dispara `onComplete`,
  // que já envia o formulário. Preencher a primeira caixa com "123456" não
  // funciona — o `maxLength=1` guarda um caractere só, o botão "Verificar" fica
  // `disabled` e o script esperava 30 s por um clique que nunca acontece. Foi
  // exatamente o que travou o lote de `/admin/**` em 16/11.
  if (
    pagina.url().includes("/mfa") ||
    (await pagina.locator("input[autocomplete=one-time-code]").count()) > 0
  ) {
    const codigo = totp(segredo);
    const caixas = pagina.locator('[role="group"] input[maxlength="1"]');
    if ((await caixas.count()) >= 6) {
      await caixas.first().click();
      // Digitar (não preencher): cada dígito move o foco para a caixa seguinte.
      await pagina.keyboard.type(codigo, { delay: 60 });
    } else {
      const campo = pagina.locator("input[autocomplete=one-time-code]").first();
      await campo.fill(codigo);
      const botao = pagina.locator("button[type=submit]").first();
      if (await botao.isEnabled().catch(() => false)) await botao.click();
    }
    await pagina
      .waitForURL((u) => !u.pathname.includes("/mfa"), { timeout: 30000 })
      .catch(() => undefined);
    if (pagina.url().includes("/mfa")) {
      throw new Error("MFA do perfil não passou — as rotas abaixo seriam medidas deslogadas");
    }
  }
  return pagina.url();
}

/**
 * O servidor já morreu NO MEIO de um lote (149 de 168 rotas `ERR_CONNECTION_REFUSED`),
 * e o resultado ficou no JSON com cara de "estas telas não abrem". Esperar e
 * repetir uma vez separa "a tela está quebrada" de "o processo caiu".
 */
async function esperarServidor(limiteMs = 120000) {
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    try {
      const r = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(4000) });
      if (r.status < 500) return true;
    } catch {
      /* ainda não subiu */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

if (!(await esperarServidor())) {
  console.error(`ERRO: ${BASE} não respondeu em 120s. Nenhuma captura foi feita.`);
  process.exit(1);
}

const urlDepoisDoLogin = await entrar();

/**
 * `--guardar-estado <arquivo>` grava a sessão (cookies/localStorage) para outro
 * instrumento reusar sem repetir login.
 *
 * Por que existe: `captura-subtelas.mjs` abre ~150 telas e cada aba nelas; logar
 * por aba dobraria o custo e bateria no rate limit por IP sem medir nada novo.
 * O arquivo NUNCA vai para o git (é credencial de sessão) — grave em /tmp.
 */
const guardarEstado = args.get("--guardar-estado");
if (guardarEstado) {
  await contexto.storageState({ path: String(guardarEstado) });
  process.stdout.write(`sessão gravada em ${guardarEstado}\n`);
}

/** Mede o que dá para medir sem olho humano: overflow, alvos de toque, título, vazio. */
async function medir() {
  return pagina.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    const alvosPequenos = [
      ...document.querySelectorAll("a,button,[role=button],input,select,textarea"),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      return r.width < 40 || r.height < 40;
    }).length;
    // "Campo sem rótulo" só conta campo que a pessoa vê e preenche. `type=hidden`
    // não tem rótulo por definição, e campo DENTRO de um `<label>` já é rotulado
    // pelo texto ao redor — contar os dois inflava o número e transformava
    // "o app usa input oculto" em "o app é inacessível".
    const semRotulo = [...document.querySelectorAll("input,select,textarea")].filter((el) => {
      if ((el.getAttribute("type") || "").toLowerCase() === "hidden") return false;
      // Elemento fora da árvore de acessibilidade não "precisa de rótulo": ele
      // quase sempre é o `BubbleSelect` do Radix — um `<select>` nativo 1×1 px,
      // `aria-hidden`, `tabindex="-1"`, que o Radix injeta dentro do <form> só
      // para autofill. O controle que a pessoa usa é o `button[role=combobox]`,
      // e esse TEM label. Contar o invisível reprovava `/app/settings/profile` e
      // `/admin/tenants/new`, medidos em 16/11, sem nenhum defeito real.
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
    const h1 = [...document.querySelectorAll("h1")]
      .map((h) => h.textContent.trim())
      .filter(Boolean);
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
    let reconexoes = 0;
    // `ms` é até o HTML + 4 s de assentamento. `assentou` diz se a rede chegou a
    // ficar quieta antes do teto — sem isso, "1.500 ms" poderia ser "250 ms de
    // tela + 1.250 ms de prefetch", e o número enganaria quem lê desempenho.
    let assentou = false;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        // `networkidle` como CONDIÇÃO DE SUCESSO era uma armadilha: o Next
        // prefetcha os `<Link>` do menu assim que a tela monta, e há tela que
        // nunca fica 500 ms sem requisição. Medido em 16/11: `/admin/platform-admins`
        // renderizava em 191 ms (h1 e API 200) e ainda assim estourava 45 s,
        // porque depois de `/admin/marca` o router começou a prefetchar
        // `/admin/usage`, `/admin/users`, `/admin/marca`, `/admin/google`…
        // Agora: espera o HTML, deixa a rede assentar ATÉ 4 s (sem falhar se não
        // assentar) e mede. Quem não assenta tem a medida registrada, não um erro.
        const resposta = await pagina.goto(`${BASE}${rota}`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        status = resposta?.status() ?? 0;
        assentou = await pagina
          .waitForLoadState("networkidle", { timeout: 4000 })
          .then(() => true)
          .catch(() => false);
        await pagina.waitForTimeout(250);
        erro = null;
        break;
      } catch (e) {
        erro = e instanceof Error ? e.message.slice(0, 120) : String(e);
        const caiu = /ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ECONNRESET/.test(erro);
        // Uma vez só: se o servidor voltou, a rota é medida de verdade. Se não
        // voltou, o erro fica com o motivo certo em vez de virar "tela vazia".
        if (!caiu || tentativa === 1 || !(await esperarServidor())) break;
        reconexoes++;
        await entrar().catch(() => undefined);
      }
    }
    const ms = Date.now() - inicio;
    const medida = erro ? null : await medir().catch(() => null);
    const nomeArquivo = `${largura.nome}${rota.replace(/[^a-z0-9]+/gi, "_")}.png`;
    if (!erro)
      await pagina
        .screenshot({ path: join(SAIDA, nomeArquivo), fullPage: false })
        .catch(() => undefined);
    resultados.push({
      rota,
      largura: largura.nome,
      status,
      ms,
      erro,
      reconexoes,
      assentou,
      arquivo: erro ? null : nomeArquivo,
      errosDeConsole: [...new Set(errosDeConsole)].slice(0, 5),
      falhasDeRede: [...new Set(falhasDeRede)].slice(0, 5),
      ...(medida ?? {}),
    });
    console.log(
      `${largura.nome.padEnd(8)} ${rota.padEnd(34)} ${String(status).padEnd(4)} ${String(ms).padStart(5)}ms` +
        (medida
          ? ` overflow=${medida.overflowHorizontal} alvos<40=${medida.alvosMenoresQue40} console=${resultados.at(-1).errosDeConsole.length}`
          : ` ERRO ${erro}`),
    );
  }
}

// O artefato é mesclado, não substituído: medir uma rota avulsa não pode
// apagar as medições anteriores do grupo (ver `scripts/auditoria/medicoes.mjs`).
const arquivoMedicoes = join(SAIDA, `medicoes-${grupo}.json`);
let anterior = null;
if (existsSync(arquivoMedicoes)) {
  try {
    anterior = JSON.parse(readFileSync(arquivoMedicoes, "utf8"));
  } catch {
    anterior = null;
  }
}
const artefato = montarArtefato({
  base: BASE,
  grupo,
  perfil,
  urlDepoisDoLogin: urlDepoisDoLogin.replace(/\?.*/, "?…"),
  puladas: selecao.puladas,
  novas: resultados,
  anterior,
});
writeFileSync(arquivoMedicoes, JSON.stringify(artefato, null, 2) + "\n");
console.log(`\nartefato: ${arquivoMedicoes} (${artefato.resultados.length} medições no total)`);

await navegador.close();
console.log(`\nok: ${resultados.length} medições · capturas em docs/auditoria/capturas/`);
