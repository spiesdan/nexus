/**
 * Mede latência local das rotas quentes do produto — N execuções por rota,
 * autenticado como `manager` do seed E2E, contra um `next start` local.
 *
 * Uso:
 *   pnpm exec tsx scripts/medir-api-local.ts [--n 40] [--base http://127.0.0.1:3210]
 *
 * Requisitos:
 *   - `.e2e-creds.json` (scripts/seed-e2e-credentials.ts) com o usuário manager;
 *   - app servido localmente com o MESMO `.env.e2e` do build;
 *   - Supabase local de pé.
 *
 * O resultado é JSON no stdout e em `--out` (default /tmp/perf-api.json).
 * Isto NÃO mede produção: é uma régua local, com o banco local e a máquina de
 * desenvolvimento. O doc 42 declara essa limitação.
 */
/* eslint-disable no-console */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Creds {
  password: string;
  users: Record<string, { email: string } | undefined>;
}

const ROTAS = [
  // Ordem alternada de propósito: se houver throttling acumulado do GoTrue,
  // ele não pode cair sempre na última rota e virar "a rota lenta".
  { nome: "financeiro", url: "/api/v1/financeiro/dashboard" },
  { nome: "notas", url: "/api/v1/invoices" },
  { nome: "contatos", url: "/api/v1/contacts" },
  { nome: "inbox", url: "/api/v1/conversations" },
  { nome: "pedidos", url: "/api/v1/commercial-orders" },
  { nome: "health", url: "/api/v1/health" },
] as const;

function arg(nome: string, padrao: string): string {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : padrao;
}

const N = Math.max(30, Number(arg("n", "40")));
const BASE = arg("base", "http://127.0.0.1:3210");
const OUT = arg("out", "/tmp/perf-api.json");
const WARMUP = 5;

function percentil(valores: number[], p: number): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  if (ordenados.length === 0) return 0;
  const pos = Math.ceil((p / 100) * ordenados.length) - 1;
  return ordenados[Math.max(0, Math.min(ordenados.length - 1, pos))]!;
}

function resumo(valores: number[]) {
  const total = valores.reduce((a, b) => a + b, 0);
  return {
    n: valores.length,
    min_ms: Math.round(Math.min(...valores) * 10) / 10,
    p50_ms: Math.round(percentil(valores, 50) * 10) / 10,
    p95_ms: Math.round(percentil(valores, 95) * 10) / 10,
    max_ms: Math.round(Math.max(...valores) * 10) / 10,
    media_ms: Math.round((total / valores.length) * 10) / 10,
  };
}

async function main() {
  const creds = JSON.parse(
    readFileSync(join(process.cwd(), ".e2e-creds.json"), "utf8"),
  ) as Creds;
  const manager = creds.users.manager;
  if (!manager) throw new Error(".e2e-creds.json sem users.manager");

  const browser = await chromium.launch({ headless: true });
  const contexto = await browser.newContext();
  const page = await contexto.newPage();

  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.getByLabel(/e-?mail/i).fill(manager.email);
    await page.getByLabel(/senha/i).fill(creds.password);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/app(\/|$)/, { timeout: 30_000 });

    // Sem cookies de sessão, toda rota devolveria 401 e a medição seria ficção.
    const smoke = await page.request.get(`${BASE}/api/v1/contacts`);
    if (smoke.status() === 401 || smoke.status() === 403) {
      throw new Error(`sessão não chegou à API (status ${smoke.status()})`);
    }

    const resultados: Record<string, unknown> = {};
    for (const rota of ROTAS) {
      for (let i = 0; i < WARMUP; i++) await page.request.get(`${BASE}${rota.url}`);

      const tempos: number[] = [];
      const status: Record<string, number> = {};
      let bytes = 0;
      for (let i = 0; i < N; i++) {
        const t0 = performance.now();
        const res = await page.request.get(`${BASE}${rota.url}`);
        tempos.push(performance.now() - t0);
        status[String(res.status())] = (status[String(res.status())] ?? 0) + 1;
        bytes += (await res.body()).byteLength;
      }

      resultados[rota.nome] = {
        url: rota.url,
        ...resumo(tempos),
        status,
        bytes_medio: Math.round(bytes / N),
      };
      console.log(
        `${rota.nome.padEnd(12)} p50=${resumo(tempos).p50_ms}ms p95=${resumo(tempos).p95_ms}ms status=${JSON.stringify(status)}`,
      );
    }

    writeFileSync(
      OUT,
      JSON.stringify({ base: BASE, n: N, warmup: WARMUP, local: true, rotas: resultados }, null, 2),
    );
    console.log(`\nJSON: ${OUT}`);
  } finally {
    await contexto.close();
    await browser.close();
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
