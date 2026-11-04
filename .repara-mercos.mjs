import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const EMPRESA = process.env.MERCOS_EMPRESA || "338282";
const BASE = `https://app.mercos.com/${EMPRESA}`;
const SAIDA = "/tmp/mercos-clientes.jsonl";
const NUMEROS = readFileSync("/tmp/numeros.txt", "utf8")
  .split(/[,\s]+/)
  .map(Number)
  .filter(Boolean);

const jaLidos = new Set();
if (existsSync(SAIDA)) {
  for (const l of readFileSync(SAIDA, "utf8").split("\n").filter(Boolean)) {
    try {
      jaLidos.add(JSON.parse(l).numero);
    } catch {}
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const nav = await chromium.launch();
const ctx = await nav.newContext();
const p = await ctx.newPage();

await p.goto(`${BASE}/pedidos/`, { waitUntil: "domcontentloaded" });
if (p.url().includes("/login")) {
  await p.goto("https://app.mercos.com/login/", { waitUntil: "domcontentloaded" });
  await p.fill('input[name="email"], input[type="email"]', process.env.MERCOS_EMAIL);
  await p.fill('input[name="password"], input[type="password"]', process.env.MERCOS_SENHA);
  await p.keyboard.press("Enter");
  await p.waitForTimeout(7000);
}
console.log("login em", p.url());

for (const numero of NUMEROS) {
  if (jaLidos.has(numero)) continue;
  let feito = false;
  for (let tentativa = 0; tentativa < 2 && !feito; tentativa++) {
    try {
      await p.goto(`${BASE}/pedidos/?q=${numero}`, { waitUntil: "domcontentloaded" });
      await dormir(1500);
      const id = await p.evaluate((n) => {
        for (const a of document.querySelectorAll("a[href*='/pedidos/']")) {
          const m = (a.getAttribute("href") || "").match(/pedidos\/(\d+)/);
          if (m && (a.innerText || "").includes(String(n))) return m[1];
        }
        return null;
      }, numero);
      if (!id) {
        console.log("sem id", numero);
        feito = true;
        break;
      }
      const dados = await p.evaluate(async (pid) => {
        const resp = await fetch(`/338282/pedidos/${pid}/detalhar/`, {
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        if (!resp.ok) return { http: resp.status };
        const doc = new DOMParser().parseFromString(await resp.text(), "text/html");
        doc.querySelectorAll("script,style,noscript").forEach((e) => e.remove());
        const linhas = doc.body.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
        const iRep = linhas.findIndex((l) => /^[^\w]*\s*Representada\s*$/i.test(l));
        const escopo = iRep > -1 ? linhas.slice(0, iRep) : linhas;
        const RE = /^-?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})/;
        const j = escopo.findIndex((l) => RE.test(l));
        const limpa = (l) => (l || "").replace(/^[-–]\s*/, "").trim();
        const janela = j > -1 ? escopo.slice(j + 1, j + 4) : [];
        const fone = janela.find((l) => /\(\d{2}\)\s?\d{4,5}-?\d{4}/.test(l.replace(/[^\d()\s-]/g, "")));
        const cidade = janela.find((l) => l.includes(",") && !/^[^\w(]*\s*[\d.,/-]+$/.test(l));
        return {
          razao: j > 0 ? limpa(escopo[j - 1]) : null,
          documento: j > -1 ? (escopo[j].match(RE) || [])[1] : null,
          telefone: fone ? fone.replace(/[^\d()\s-]/g, "").trim() : null,
          cidade: cidade || null,
        };
      }, id);
      if (dados.http) {
        await dormir(30000);
        continue;
      }
      appendFileSync(SAIDA, JSON.stringify({ numero, idInterno: id, ...dados }) + "\n");
      console.log(numero, "->", dados.razao, dados.documento);
      feito = true;
    } catch (e) {
      console.log("erro", numero, String(e).slice(0, 80));
      await dormir(5000);
    }
  }
  await dormir(2200);
}
console.log("FIM");
await nav.close();
