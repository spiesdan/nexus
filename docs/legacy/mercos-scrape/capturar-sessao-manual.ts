/**
 * Captura da sessão do Mercos SEM digitar senha aqui e SEM exigir ENTER.
 *
 * Abre o navegador COM JANELA na máquina do operador. Ele faz o login (e
 * resolve o reCAPTCHA) com calma. O script só OBSERVA o endereço: quando sai
 * de `/login` e cai numa rota da empresa (`app.mercos.com/<id>/...`), salva o
 * `storageState` em `.auth/mercos.json` e fecha.
 *
 * Nada de senha, cookie ou token é impresso no terminal — só o estado.
 *
 * Uso:
 *   pnpm exec tsx docs/legacy/mercos-scrape/capturar-sessao-manual.ts
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const SESSAO = join(process.cwd(), ".auth", "mercos.json");
const PRAZO_MS = 15 * 60 * 1000;
const INTERVALO_MS = 2_000;

/** Rota de empresa: app.mercos.com/338282/pedidos/ */
const DENTRO_DA_CONTA = /^https:\/\/app\.mercos\.com\/\d+\//;

function agora(): string {
  return new Date().toLocaleTimeString("pt-BR", { hour12: false });
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();

  await page.goto("https://app.mercos.com/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  console.log(`[${agora()}] Janela do Mercos aberta. Faça o login nela (captcha incluído).`);
  console.log(`[${agora()}] Estou observando a sessão — não precisa apertar ENTER.`);

  const limite = Date.now() + PRAZO_MS;
  let ultimoAviso = Date.now();

  while (Date.now() < limite) {
    await page.waitForTimeout(INTERVALO_MS);

    let url = "";
    try {
      url = page.url();
    } catch {
      // contexto fechado pelo operador
      break;
    }

    if (DENTRO_DA_CONTA.test(url)) {
      // Espera a tela inicial terminar de montar antes de fotografar o estado.
      await page.waitForLoadState("networkidle").catch(() => {});
      mkdirSync(dirname(SESSAO), { recursive: true });
      await context.storageState({ path: SESSAO });
      console.log(`[${agora()}] Login detectado. Sessão salva em ${SESSAO}.`);
      await browser.close();
      return;
    }

    if (Date.now() - ultimoAviso > 60_000) {
      ultimoAviso = Date.now();
      console.log(`[${agora()}] Ainda aguardando o login…`);
    }
  }

  console.log(`[${agora()}] Prazo encerrado sem login. Nada foi salvo.`);
  await browser.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
