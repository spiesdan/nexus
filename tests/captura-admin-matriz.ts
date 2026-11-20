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
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

import { Client } from "pg";

import { generateTotp, msUntilNextTotpWindow } from "./e2e/utils/totp";

const BASE = process.env.BASE ?? "http://localhost:3311";
const ROTULO = process.argv[2] ?? "antes";
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
  overflow: number;
  culpadoDoOverflow: string | null;
  contraste: Array<{ alvo: string; razao: number; fg: string; bg: string; px: string }>;
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

const ultimoCodigo = new Map<string, string>();

async function loginDono(page: Page): Promise<void> {
  const email = CREDS.users.dono?.email;
  const secret = CREDS.dono_totp?.secret;
  if (!email || !secret) throw new Error(".e2e-creds.json sem users.dono/dono_totp");

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(CREDS.password);
  await page.getByRole("button", { name: /entrar/i }).first().click();

  // Sem fator? Entra direto. Com fator, o app manda para /login/mfa.
  try {
    await page.waitForURL(/\/login\/mfa/, { timeout: 20_000 });
  } catch {
    // Pode já ter entrado (dono com mfa_required=false).
    await page.waitForURL(/\/(app|admin)\//, { timeout: 30_000 }).catch(() => undefined);
    return;
  }

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (/\/(app|admin)\//.test(page.url())) return;
    if (msUntilNextTotpWindow() < 3_000) await page.waitForTimeout(msUntilNextTotpWindow() + 200);
    let codigo = generateTotp(secret);
    if (ultimoCodigo.get(email) === codigo) {
      await page.waitForTimeout(msUntilNextTotpWindow() + 500);
      codigo = generateTotp(secret);
    }
    ultimoCodigo.set(email, codigo);
    await page.locator('input[aria-label="Dígito 1"]').click({ timeout: 15_000 });
    await page.keyboard.type(codigo, { delay: 40 });
    try {
      await page.waitForURL(/\/(app|admin)\//, { timeout: 30_000 });
      return;
    } catch {
      if (/\/(app|admin)\//.test(page.url())) return;
      await page.waitForTimeout(msUntilNextTotpWindow() + 200);
    }
  }
  throw new Error("login do dono (MFA) não concluiu");
}

async function idsDoBanco(): Promise<{
  audit: string | null;
  lgpd: string | null;
  incidente: string | null;
  conversa: string | null;
  org: string;
}> {
  const linha = readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    .split("\n")
    .find((l) => l.startsWith("SUPABASE_DB_URL="));
  if (!linha) throw new Error("SUPABASE_DB_URL ausente em .env.local");
  const c = new Client({ connectionString: linha.slice("SUPABASE_DB_URL=".length).trim().replace(/^"|"$/g, "") });
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
    overflow: overflow.delta,
    culpadoDoOverflow: overflow.culpado,
    contraste,
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
  const LISTA = rotas(ids);
  mkdirSync(RAIZ, { recursive: true });
  const browser = await chromium.launch();

  for (const tema of ["light", "dark"] as const) {
    for (const tamanho of TAMANHOS) {
      const contexto = await browser.newContext({
        viewport: { width: tamanho.width, height: tamanho.height },
        deviceScaleFactor: 1,
        locale: "pt-BR",
      });
      await contexto.addInitScript((t) => window.localStorage.setItem("nexus-theme", t), tema);
      const page = await contexto.newPage();
      const erros: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") erros.push(m.text().slice(0, 200));
      });
      page.on("pageerror", (e) => erros.push(`pageerror: ${String(e).slice(0, 200)}`));

      await loginDono(page);

      for (const rota of LISTA) {
        const antesDoErro = erros.length;
        const resposta = await page.goto(`${BASE}${rota.caminho}`, {
          waitUntil: "domcontentloaded",
          timeout: 180_000,
        });
        // Rede de segurança para telas que dependem de fetch no cliente.
        await page.waitForTimeout(1_200);
        await page.screenshot({
          path: path.join(RAIZ, `${rota.tela}_${tema}_${tamanho.nome}.png`),
          fullPage: false,
        });
        const medida = await medir(page, rota.caminho, rota.tela, tema);
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
            `erros=${medida.console.erros} contraste_amostrado=${medida.contraste.length}`,
        );
        for (const c of medida.axe.contraste.slice(0, 2)) console.info(`   contraste: ${c}`);
        for (const e of medida.console.amostra.slice(0, 2)) console.info(`   console: ${e}`);
        if (medida.culpadoDoOverflow) console.info(`   overflow: ${medida.culpadoDoOverflow}`);
      }

      await contexto.close();
    }
  }

  writeFileSync(path.join(RAIZ, "medidas.json"), JSON.stringify(medidas, null, 2));
  await browser.close();
  console.info(`\n${medidas.length} medições em ${RAIZ}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
