/**
 * MATRIZ 41 — as 22 telas de `app/admin/**`, medidas e capturadas.
 *
 * Para cada rota: captura em claro/escuro × 1440/390, overflow horizontal
 * medido, contraste amostrado (WCAG, texto sobre o fundo efetivo), axe
 * (critical/serious) e console limpo (sem `console.error`/pageerror).
 *
 * Uso, com um servidor JÁ de pé (janela de build/dev):
 *   BASE=http://localhost:3311 npx tsx tests/captura-admin-matriz.ts antes
 *   BASE=http://localhost:3311 npx tsx tests/captura-admin-matriz.ts depois
 *
 * "antes" e "depois" são o MESMO base (mesmo commit): a diferença é só o que
 * este passe mudou. O JSON de medidas é a prova; os PNGs são a evidência.
 *
 * Só roda contra loopback: este instrumento faz login como o `dono`
 * (platform_admin) e lê o banco local para resolver os ids das rotas
 * dinâmicas. Nunca aponta para a VPS.
 */
import AxeBuilder from "@axe-core/playwright";
import { createServerClient } from "@supabase/ssr";
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

import { Client } from "pg";

import { carregarEnvLocal } from "../scripts/lib/env-de-teste";


const BASE = process.env.BASE ?? "http://localhost:3311";
const ROTULO = process.argv[2] ?? "antes";
/** Filtro opcional por tela (`tenants`, `users`, …) — one screen per PR. */
const ALVO = process.argv[3]?.trim() || null;
const RAIZ = path.join(process.cwd(), "docs/auditoria/capturas", `${ROTULO}-admin`);

const CREDS = JSON.parse(readFileSync(path.join(process.cwd(), ".e2e-creds.json"), "utf8")) as {
  org_id: string;
  password: string;
  users: Record<string, { id: string; email: string } | undefined>;
  dono_totp?: { factor_id: string; secret: string };
  escalacao?: { conversation_id: string };
};

if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(BASE)) {
  throw new Error(`BASE não é loopback: ${BASE} — captura de admin não aponta para produção`);
}

const TAMANHOS = [
  { nome: "1440", width: 1440, height: 900 },
  { nome: "390", width: 390, height: 844 },
] as const;

interface Medida {
  rota: string;
  tela: string;
  largura: number;
  tema: "light" | "dark";
  status: number;
  /** Para onde a navegação foi de fato (redirect medido no destino). */
  urlFinal: string;
  /** O primeiro paint tem cabeçalho? Falso = a tela não pintou o h1. */
  h1: boolean;
  overflow: number;
  culpadoDoOverflow: string | null;
  contraste: Array<{ alvo: string; razao: number; fg: string; bg: string; px: string }>;
  alvos: { total: number; abaixoDe40: number; amostra: string[] };
  axe: { critica: number; seria: number; ids: string[]; contraste: string[] };
  console: { erros: number; amostra: string[] };
}

/** Ratio WCAG de dois rgb() — mesma conta do axe, feita no navegador para os
 *  alvos que a tela mostra (o axe só reporta o que FALHA; aqui medimos o que
 *  passa também, que é o número que a matriz pede). */
const MEDIR_CONTRASTE = `
(() => {
  function parse(cor) {
    var m = cor.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    var p = m[1].split(",").map(function (x) { return parseFloat(x); });
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function lum(c) {
    function f(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function ratio(a, b) {
    var la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function fundo(el) {
    var atual = el;
    while (atual) {
      var c = parse(getComputedStyle(atual).backgroundColor);
      if (c && c.a > 0.5) return c;
      atual = atual.parentElement;
    }
    var c2 = parse(getComputedStyle(document.body).backgroundColor);
    return c2 && c2.a > 0.5 ? c2 : { r: 255, g: 255, b: 255, a: 1 };
  }
  var alvos = "h1, h2, h3, p, td, th, label, a, button, [data-slo], .text-text-muted, .text-text-subtle";
  var vistos = new Set();
  var saida = [];
  var els = Array.from(document.querySelectorAll(alvos));
  for (var i = 0; i < els.length && saida.length < 12; i++) {
    var el = els[i];
    var texto = (el.textContent || "").trim();
    if (texto.length < 3) continue;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight * 3) continue;
    var s = getComputedStyle(el);
    var fg = parse(s.color);
    if (!fg) continue;
    var bg = fundo(el);
    var chave = s.color + "|" + "rgb(" + bg.r + "," + bg.g + "," + bg.b + ")";
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({
      alvo: (el.tagName + "." + (el.className || "").toString().split(" ").slice(0, 2).join(".")).slice(0, 60),
      razao: Math.round(ratio(fg, bg) * 100) / 100,
      fg: s.color,
      bg: "rgb(" + bg.r + "," + bg.g + "," + bg.b + ")",
      px: s.fontSize + "/" + s.fontWeight
    });
  }
  return saida;
})()
`;

/**
 * Sessão por COOKIE, não por formulário.
 *
 * O login por UI custou três tentativas e duas capturas falsas: o form é
 * `method="post"` e, sem hidratação, faz POST nativo e recarrega; quatro
 * logins seguidos batem no teto de 5/5min do GoTrue. O app lê a sessão do
 * cookie `sb-nexus-auth` (proxy.ts e lib/supabase/server.ts), então geramos a
 * sessão com o MESMO `@supabase/ssr` que o app usa e injetamos o cookie.
 *
 * O dono tem TOTP, mas `platform_admins.mfa_required = false`: a sessão aal1
 * já passa em `requirePlatformAdmin`, que só exige aal2 quando o banco pede.
 */
async function cookiesDeSessao(): Promise<Array<{ name: string; value: string }>> {
  const email = CREDS.users.dono?.email;
  if (!email) throw new Error(".e2e-creds.json sem users.dono");

  const envLocal = carregarEnvLocal();
  const url = envLocal.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = envLocal.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anon) {
    throw new Error(".env.local sem NEXT_PUBLIC_SUPABASE_URL/ANON_KEY");
  }
  const escritos: Array<{ name: string; value: string }> = [];
  const supabase = createServerClient(url, anon, {
      cookies: {
        getAll: () => [],
        setAll: (lista) => {
          for (const c of lista) escritos.push({ name: c.name, value: c.value });
        },
      },
    },
  );
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: CREDS.password,
  });
  if (error || !data.session) {
    throw new Error(`sessão do dono não abriu: ${error?.message ?? "sem sessão"}`);
  }

  // O nome canônico do produto é `sb-nexus-auth`; o default do SSR é
  // `sb-<ref>-auth-token`. Troca o prefixo preservando o sufixo de chunk.
  return escritos.map((c) => ({
    name: c.name.replace(/^sb-[^-]+-auth-token/, "sb-nexus-auth"),
    value: c.value,
  }));
}

async function idsDoBanco(): Promise<{
  audit: string | null;
  lgpd: string | null;
  incidente: string | null;
  conversa: string | null;
  org: string;
}> {
  const envLocal = carregarEnvLocal();
  const dbUrl = envLocal.SUPABASE_DB_URL ?? "";
  if (!dbUrl) throw new Error("SUPABASE_DB_URL ausente (use process.env ou .env.local)");
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  await c.query("set default_transaction_read_only = on");
  const um = async (q: string): Promise<string | null> =>
    ((await c.query(q)).rows[0] as { id?: string } | undefined)?.id ?? null;
  const ids = {
    audit: await um("select id::text as id from public.api_audit_log order by created_at desc limit 1"),
    lgpd: await um("select id::text as id from public.lgpd_requests order by created_at desc limit 1"),
    incidente: await um("select id::text as id from public.incidents order by created_at desc limit 1"),
    conversa: await um("select id::text as id from public.conversations order by last_message_at desc nulls last limit 1"),
    org: CREDS.org_id,
  };
  await c.end();
  return ids;
}

interface Rota {
  tela: string;
  caminho: string;
  /** Falso quando não há fixture no seed — a linha da matriz diz o motivo. */
  fixture?: string;
}

function rotas(ids: Awaited<ReturnType<typeof idsDoBanco>>): Rota[] {
  const semFixture = (id: string | null, motivo: string) => (id ? undefined : motivo);
  return [
    { tela: "admin-index", caminho: "/admin" },
    { tela: "dashboard", caminho: "/admin/dashboard" },
    { tela: "tenants", caminho: "/admin/tenants" },
    { tela: "tenants-new", caminho: "/admin/tenants/new" },
    { tela: "tenant-ficha", caminho: `/admin/tenants/${ids.org}` },
    { tela: "tenant-saude", caminho: `/admin/tenants/${ids.org}/health` },
    { tela: "users", caminho: "/admin/users" },
    { tela: "user-ficha", caminho: `/admin/users/${CREDS.users.manager?.id ?? ids.org}` },
    { tela: "audit", caminho: "/admin/audit" },
    { tela: "audit-entrada", caminho: `/admin/audit/${ids.audit ?? ids.org}`, fixture: semFixture(ids.audit, "sem linha em api_audit_log") },
    { tela: "incidents", caminho: "/admin/incidents" },
    { tela: "incident-ficha", caminho: `/admin/incidents/${ids.incidente ?? ids.org}`, fixture: semFixture(ids.incidente, "sem linha em incidents no seed local") },
    { tela: "lgpd", caminho: "/admin/lgpd" },
    { tela: "lgpd-pedido", caminho: `/admin/lgpd/requests/${ids.lgpd ?? ids.org}`, fixture: semFixture(ids.lgpd, "sem linha em lgpd_requests") },
    { tela: "marca", caminho: "/admin/marca" },
    { tela: "observabilidade", caminho: "/admin/observabilidade" },
    { tela: "usage", caminho: "/admin/usage" },
    { tela: "platform-admins", caminho: "/admin/platform-admins" },
    { tela: "google", caminho: "/admin/google" },
    { tela: "inbox", caminho: "/admin/inbox" },
    { tela: "inbox-conversa", caminho: `/admin/inbox/${ids.conversa ?? CREDS.escalacao?.conversation_id ?? ids.org}`, fixture: semFixture(ids.conversa, "sem conversa no seed local") },
    { tela: "forbidden", caminho: "/admin/forbidden" },
  ];
}

/**
 * Alvos de toque — a régua que o doc 48 (admin dashboard) fixou em 44 px e
 * que a matriz cobra por tela. Conta só o que está VISÍVEL: `sr-only` (1×1) e
 * o que está fora da dobra não são alvo de dedo.
 */
const MEDIR_ALVOS = `
(() => {
  var seletor = 'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, [role="tab"], [role="switch"]';
  var total = 0;
  var pequenos = [];
  var els = Array.from(document.querySelectorAll(seletor));
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;                 // sr-only
    if (r.bottom < 0 || r.top > innerHeight * 2) continue;      // fora da área útil
    var s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || s.opacity === "0") continue;
    total++;
    if (r.width < 40 || r.height < 40) {
      var texto = (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 18);
      pequenos.push(
        (el.tagName.toLowerCase() + "." + String(el.className).split(" ").slice(0, 2).join(".")).slice(0, 40) +
          " " + Math.round(r.width) + "x" + Math.round(r.height) +
          (texto ? ' "' + texto + '"' : ""),
      );
    }
  }
  return { total: total, abaixoDe40: pequenos.length, amostra: pequenos.slice(0, 6) };
})()
`;

async function medir(page: Page, rota: string, tela: string, tema: "light" | "dark"): Promise<Medida> {
  const overflow = await page.evaluate(() => {
    const raiz = document.documentElement;
    const delta = Math.max(0, raiz.scrollWidth - raiz.clientWidth);
    if (delta === 0) return { delta: 0, culpado: null as string | null };
    let culpado: string | null = null;
    let maior = 0;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.right > raiz.clientWidth + 1 && r.width > maior) {
        maior = r.width;
        culpado = `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} @${Math.round(r.right)}px`;
      }
    }
    return { delta, culpado };
  });

  const contraste = (await page.evaluate(MEDIR_CONTRASTE)) as Medida["contraste"];
  const alvos = (await page.evaluate(MEDIR_ALVOS)) as Medida["alvos"];

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const graves = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  const contrasteAxe = graves
    .filter((v) => v.id === "color-contrast")
    .flatMap((v) =>
      v.nodes.slice(0, 4).map((n) => {
        const dados = n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number; fontSize?: string } | undefined;
        return `${n.target.join(" ")} :: ${dados?.fgColor ?? "?"} sobre ${dados?.bgColor ?? "?"} = ${dados?.contrastRatio ?? "?"}:1 (${dados?.fontSize ?? "?"})`;
      }),
    );

  return {
    rota,
    tela,
    largura: page.viewportSize()?.width ?? 0,
    tema,
    status: 200,
    urlFinal: rota,
    h1: false,
    overflow: overflow.delta,
    culpadoDoOverflow: overflow.culpado,
    contraste,
    alvos,
    axe: {
      critica: axe.violations.filter((v) => v.impact === "critical").length,
      seria: axe.violations.filter((v) => v.impact === "serious").length,
      ids: graves.map((v) => `${v.id} (${v.impact})`),
      contraste: contrasteAxe,
    },
    console: { erros: 0, amostra: [] },
  };
}

const medidas: Medida[] = [];

async function main(): Promise<void> {
  const ids = await idsDoBanco();
  const LISTA = rotas(ids).filter((r) => !ALVO || r.tela === ALVO);
  if (LISTA.length === 0) throw new Error(`nenhuma tela casa com o filtro "${ALVO}"`);
  mkdirSync(RAIZ, { recursive: true });
  const browser = await chromium.launch();

  // Sessão NOVA por contexto. Reusar um único par access/refresh entre os
  // quatro contextos parecia econômico, mas o refresh rotaciona o token: o
  // 4º contexto (dark/390) caiu em `/login?next=/admin/tenants` com o mesmo
  // cookie que funcionou nos três anteriores. Assinar de novo custa ~200 ms.
  for (const tema of ["light", "dark"] as const) {
    for (const tamanho of TAMANHOS) {
      const cookies = await cookiesDeSessao();
      const contexto = await browser.newContext({
        viewport: { width: tamanho.width, height: tamanho.height },
        deviceScaleFactor: 1,
        locale: "pt-BR",
      });
      await contexto.addCookies(cookies.map((c) => ({ ...c, url: `${BASE}/` })));
      await contexto.addInitScript((t) => window.localStorage.setItem("nexus-theme", t), tema);
      const page = await contexto.newPage();
      const erros: string[] = [];
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const texto = m.text();
        // Ruído do servidor de DEV (HMR via WebSocket), não do produto.
        if (texto.includes("/_next/hmr") || texto.includes("ERR_INVALID_HTTP_RESPONSE")) return;
        erros.push(texto.slice(0, 200));
      });
      page.on("pageerror", (e) => erros.push(`pageerror: ${String(e).slice(0, 200)}`));

      for (const rota of LISTA) {
        const antesDoErro = erros.length;
        const resposta = await page.goto(`${BASE}${rota.caminho}`, {
          waitUntil: "domcontentloaded",
          timeout: 180_000,
        });
        if (/\/login/.test(page.url())) {
          throw new Error(`${rota.caminho} caiu no login — nenhuma evidência seria verdadeira`);
        }
        // As telas de admin buscam no CLIENTE (react-query). Sem esperar a rede
        // parar, o PNG sai com o skeleton e "Carregando..." — foi o que
        // aconteceu na primeira rodada válida. `networkidle` não conta o
        // WebSocket do HMR; o timeout é rede de segurança.
        await page.waitForLoadState("networkidle", { timeout: 25_000 }).catch(() => undefined);
        // PRIMEIRO PAINT: espera o h1 antes de fotografar. Sem isto, uma tela
        // que ainda está montando entra como "skeleton limpo" — overflow 0,
        // axe 0 — e o veredito mede a si mesmo. 15 s é folga de build frio.
        const temH1 = await page
          .locator("h1")
          .first()
          .waitFor({ timeout: 15_000 })
          .then(() => true)
          .catch(() => false);
        if (!temH1) {
          console.info(`   SEM H1: ${rota.caminho} parou em ${page.url()}`);
        }
        await page.waitForTimeout(800);
        await page.screenshot({
          path: path.join(RAIZ, `${rota.tela}_${tema}_${tamanho.nome}.png`),
          fullPage: false,
        });
        const medida = await medir(page, rota.caminho, rota.tela, tema);
        medida.urlFinal = page.url();
        medida.h1 = temH1;
        medida.status = resposta?.status() ?? 0;
        medida.console = {
          erros: erros.length - antesDoErro,
          amostra: erros.slice(antesDoErro, antesDoErro + 3),
        };
        if (rota.fixture) medida.axe.ids.push(`SEM FIXTURE: ${rota.fixture}`);
        medidas.push(medida);
        console.info(
          `${tema}/${tamanho.nome} ${rota.tela.padEnd(16)} status=${medida.status} ` +
            `overflow=${medida.overflow}px axe=${medida.axe.critica}/${medida.axe.seria} ` +
            `erros=${medida.console.erros} contraste_amostrado=${medida.contraste.length} ` +
            `alvos<40=${medida.alvos.abaixoDe40}/${medida.alvos.total} h1=${medida.h1 ? "ok" : "FALTA"}`
            + (medida.urlFinal !== rota.caminho ? ` url=${medida.urlFinal}` : ""),
        );
        for (const a of medida.alvos.amostra.slice(0, 3)) console.info(`   alvo: ${a}`);
        for (const c of medida.axe.contraste.slice(0, 2)) console.info(`   contraste: ${c}`);
        for (const e of medida.console.amostra.slice(0, 2)) console.info(`   console: ${e}`);
        if (medida.culpadoDoOverflow) console.info(`   overflow: ${medida.culpadoDoOverflow}`);
      }

      await contexto.close();
    }
  }

  // Um JSON por TELA quando há filtro: as pastas `antes-admin`/`depois-admin`
  // são compartilhadas e um `medidas.json` único fazia a captura de uma linha
  // sobrescrever a evidência da outra (o `/admin/audit` já estava na main).
  writeFileSync(
    path.join(RAIZ, ALVO ? `medidas-${ALVO}.json` : "medidas.json"),
    JSON.stringify(medidas, null, 2),
  );
  await browser.close();
  console.info(`\n${medidas.length} medições em ${RAIZ}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
