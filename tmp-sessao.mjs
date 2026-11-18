import { chromium } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const quem = process.argv[2] ?? "admin";
const saida = process.argv[3] ?? `/tmp/state-${quem}.json`;
const creds = JSON.parse(readFileSync(".e2e-creds.json", "utf8"));
const email = creds.users[quem]?.email ?? `e2e-${quem}@nexus.test`;
const segredo = creds[`${quem}_totp`]?.secret;
if (!segredo) throw new Error(`sem ${quem}_totp.secret`);

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const b32 = (s) => { const c = s.toUpperCase().replace(/=+$/,"").replace(/\s/g,""); let bits=0,val=0; const o=[]; for (const ch of c){const i=B32.indexOf(ch); if(i<0) throw new Error("b32"); val=(val<<5)|i; bits+=5; if(bits>=8){o.push((val>>>(bits-8))&0xff); bits-=8;}} return Buffer.from(o); };
const totp = (s, t = Date.now()) => { const c = Math.floor(t/1000/30); const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(c)); const h = createHmac("sha1", b32(s)).update(b).digest(); const o = h[h.length-1]&0x0f; const code = ((h[o]&0x7f)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3]; return String(code%1000000).padStart(6,"0"); };

const BASE = process.env.BASE ?? "http://localhost:3021";
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
const p = await ctx.newPage();
// AQUECER: em `next dev` a primeira visita compila a rota, e preencher antes
// da hidratação envia o formulário vazio. Duas visitas garantem que o segundo
// carregamento já pega o bundle quente.
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(6000);
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(2500);
const botao = p.locator('button[type="submit"]');
const prazo = Date.now() + 60000;
while (Date.now() < prazo) {
  await p.fill('input[type="email"]', email);
  await p.fill('input[type="password"]', creds.password);
  await p.waitForTimeout(400);
  if (await botao.isEnabled().catch(() => false)) break;
}
await botao.click();
await p.waitForFunction(() => /mfa|\/app|\/admin/.test(location.pathname), undefined, { timeout: 60000 });
if (p.url().includes("mfa")) {
  const codigo = totp(segredo);
  const caixas = p.locator('input[aria-label^="Dígito"]');
  await caixas.first().waitFor({ state: "visible", timeout: 20000 });
  for (let i = 0; i < 6; i++) await caixas.nth(i).fill(codigo[i]);
  await p.waitForFunction(() => /\/app|\/admin/.test(location.pathname), undefined, { timeout: 40000 }).catch(() => {});
}
await p.waitForTimeout(1500);
console.log(quem, "→", p.url());
await ctx.storageState({ path: saida });
await nav.close();
