/**
 * MEDIÇÃO DO `/login/mfa` — a única superfície de público/auth que a captura
 * geral não conseguia medir.
 *
 * POR QUE UM SCRIPT PRÓPRIO: sem sessão parcial (primeiro fator verificado), a
 * rota redireciona para `/login`. A captura geral caiu nisso e marcou a linha
 * como "aplicada" sem nunca ter visto a tela de MFA (corrigido em #733). Aqui o
 * login é feito com o admin do E2E — que tem TOTP — e o fluxo PARA antes do
 * segundo fator, exatamente no estado que renderiza a tela.
 *
 * Se o usuário não exigir MFA (factor removido), o script falha alto: medir
 * `/app` e chamar de MFA seria repetir o defeito que este arquivo existe para
 * impedir.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";

import { lerCreds } from "./e2e/helpers/login-admin";
import { medir, type Medida } from "./lib/medir-pagina";

const BASE = process.env.BASE ?? "http://localhost:3315";
const RAIZ = path.join(process.cwd(), "docs/auditoria/capturas", "medido-mfa-publico-auth");

const creds = lerCreds();
const adminEmail = creds.users.admin?.email;
if (!adminEmail) throw new Error("credenciais sem users.admin");

const TAMANHOS = [
  { nome: "1440", width: 1440, height: 900 },
  { nome: "390", width: 390, height: 844 },
] as const;

/**
 * Login SÓ com a senha: para no primeiro fator.
 *
 * Com retry porque a primeira visita compila a action e o clique antes da
 * hidratação cai num submit NATIVO — a página fica em /login sem erro. Foi
 * exatamente o que derrubou `dark/1440` na primeira rodada.
 */
async function chegarNoMfa(page: Page): Promise<void> {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.locator("#email").fill(adminEmail!, { timeout: 60_000 });
    await page.locator("#password").fill(creds.password);
    await page.getByRole("button", { name: /entrar/i }).first().click();
    try {
      await page.waitForURL(/\/login\/mfa/, { timeout: 45_000 });
      return;
    } catch {
      await page.waitForTimeout(1_500);
    }
  }
  throw new Error("login não parou no MFA após 3 tentativas");
}

async function main(): Promise<void> {
  mkdirSync(RAIZ, { recursive: true });
  const browser = await chromium.launch();
  const medidas: Medida[] = [];
  let mediu = 0;

  for (const tema of ["light", "dark"] as const) {
    for (const tamanho of TAMANHOS) {
      const contexto = await browser.newContext({
        viewport: { width: tamanho.width, height: tamanho.height },
        deviceScaleFactor: 1,
        locale: "pt-BR",
      });
      await contexto.addInitScript((t) => {
        window.localStorage.setItem("nexus-theme", t);
      }, tema);
      const page = await contexto.newPage();
      const erros: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") erros.push(m.text().slice(0, 200));
      });
      page.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));

      try {
        await chegarNoMfa(page);
      } catch {
        console.info(
          `${tema}/${tamanho.nome}: login NÃO parou no MFA (url=${page.url()}) — ` +
            "o usuário do E2E não está exigindo segundo fator; nada a medir",
        );
        await contexto.close();
        continue;
      }

      let h1: string | null = null;
      try {
        const titulo = page.getByRole("heading", { level: 1 }).first();
        await titulo.waitFor({ timeout: 20_000 });
        h1 = (await titulo.textContent())?.trim() ?? null;
      } catch {
        h1 = null;
      }
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(RAIZ, `login-mfa_${tema}_${tamanho.nome}.png`) });
      const m = await medir(page, "login-mfa", tema);
      m.h1 = h1;
      m.medidaOk = h1 !== null && /^Verificação em duas etapas$/.test(h1);
      m.motivoNaoMedido = m.medidaOk ? null : `h1 inesperado: ${JSON.stringify(h1)}`;
      m.console = erros;
      medidas.push(m);
      if (m.medidaOk) mediu++;

      console.info(
        [
          `login-mfa ${tema}/${tamanho.nome}`,
          `overflow=${m.overflow}`,
          `contraste=${m.contraste.abaixo}/${m.contraste.total}`,
          `axe=${m.axe.critica}/${m.axe.seria}`,
          `h1=${m.h1 ?? "—"}`,
          `medida=${m.medidaOk ? "ok" : "NAO"}`,
          `url=${m.urlFinal}`,
        ].join("  "),
      );
      for (const p of m.contraste.piores.slice(0, 3)) {
        console.info(`   contraste ${p.razao}:1 (piso ${p.piso}) ${p.seletor} "${p.texto}"`);
      }
      for (const id of m.axe.ids.slice(0, 3)) console.info(`   axe ${id}`);

      await contexto.close();
    }
  }

  writeFileSync(
    path.join(RAIZ, "medidas.json"),
    JSON.stringify({ base: BASE, rotulo: "medido", medidas }, null, 2),
  );
  await browser.close();

  console.info(`\n${mediu} de ${TAMANHOS.length * 2} combinações medidas · ${RAIZ}`);
  process.exit(mediu === TAMANHOS.length * 2 ? 0 : 1);
}

void main();
