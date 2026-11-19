/**
 * Login que aceita os DOIS mundos do MFA: exigido e não exigido.
 *
 * O MFA é opcional por política (`platform_admins.mfa_required` e
 * `organizations.settings.security.mfa_required`, ambas com padrão `false` —
 * ver `lib/auth/politica-mfa.ts`). `loginComoAdmin` assume que o fator é
 * exigido e espera `/login/mfa`; quando a política está desligada no banco do
 * e2e, o login vai direto para `/app` e aquele `waitForURL` estoura **por um
 * motivo que não é falha da tela**.
 *
 * A versão anterior checava a URL depois de um `waitForURL` que casava as duas
 * rotas — e ainda corria com o redirecionamento automático de `/login/mfa` para
 * `/app` quando a política está off. Aqui a corrida é entre o CAMPO do desafio
 * aparecer e o app carregar: quem chega primeiro define o caminho, e o login só
 * termina quando `/app` está aberto. Nada é presumido.
 */
import { type Page } from "@playwright/test";

import {
  agoraNoServidor,
  generateTotp,
  msUntilNextTotpWindow,
} from "../utils/totp";

import { lerCreds, type CredsE2E } from "./login-admin";

/** Mesmo cuidado do helper canônico: o servidor aceita cada código UMA vez. */
let ultimoCodigoEnviado: string | null = null;

async function preencherDesafio(page: Page, secret: string): Promise<void> {
  const digito = page.locator('input[aria-label="Dígito 1"]');
  await digito.waitFor({ state: "visible", timeout: 30_000 });

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (
      msUntilNextTotpWindow(agoraNoServidor()) < 3_000 ||
      generateTotp(secret, agoraNoServidor()) === ultimoCodigoEnviado
    ) {
      await page.waitForTimeout(msUntilNextTotpWindow(agoraNoServidor()) + 300);
    }
    const codigo = generateTotp(secret, agoraNoServidor());
    ultimoCodigoEnviado = codigo;

    for (let espera = 0; espera < 20 && (await digito.isDisabled()); espera++) {
      await page.waitForTimeout(500);
    }
    await digito.click();
    await page.keyboard.type(codigo, { delay: 40 });

    try {
      await page.waitForURL(/\/app\//, { timeout: 10_000 });
      return;
    } catch {
      await page.waitForTimeout(msUntilNextTotpWindow(agoraNoServidor()) + 300);
    }
  }
  throw new Error("MFA não aceitou o código depois de 3 tentativas — não é a tela, é o fator");
}

export async function entrarComoAdmin(page: Page, creds: CredsE2E = lerCreds()): Promise<CredsE2E> {
  const email = creds.users.admin!.email;

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();

  const chegouNoApp = page.waitForURL(/\/app\//, { timeout: 90_000 });
  const desafio = page.locator('input[aria-label="Dígito 1"]');

  try {
    // Se a política exige fator, o campo aparece e o login termina depois dele.
    await desafio.waitFor({ state: "visible", timeout: 15_000 });
    const secret = creds.admin_totp?.secret;
    if (!secret) throw new Error(".e2e-creds.json sem admin_totp — rode seed-e2e-credentials.ts");
    await preencherDesafio(page, secret);
  } catch (erro) {
    // Sem desafio, o redirecionamento para /app é o caminho normal. Só re-lança
    // se o app NÃO chegar — aí a falha é de login, não de ausência de MFA.
    if (!(erro instanceof Error) || erro.message.includes("Dígito 1") === false) throw erro;
  }

  await chegouNoApp;
  return creds;
}
