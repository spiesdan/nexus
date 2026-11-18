/**
 * SESSÃO E2E → `storageState` — para os instrumentos que precisam de sessão.
 *
 * Os instrumentos de auditoria recebem `--estado <arquivo.json>` e não sabem
 * logar. Sem este passo, cada pessoa reescreve o login à mão — e o erro mais
 * comum nessa reescrita é navegar antes de o Server Action terminar, o que
 * produz "as telas não abrem" em vez de "o login não esperou".
 *
 * O login é o MESMO helper dos testes Playwright (`loginComoAdmin`): TOTP,
 * janela de 30 s e re-semeadura de credencial quando o fator TOTP foi
 * rotacionado por outra sessão — três modos de falha que já custaram caro
 * neste repositório e que nenhuma reimplementação reproduz de graça.
 *
 * Uso (com o app rodando e o Supabase local de pé):
 *
 *   pnpm exec tsx scripts/auditoria/sessao-e2e.ts --saida /tmp/aaa-state.json
 *   node scripts/auditoria/contraste.mjs --estado /tmp/aaa-state.json
 */
import { writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "../../tests/e2e/helpers/login-admin";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const chave = process.argv[i];
  if (!chave?.startsWith("--")) continue;
  const valor = process.argv[i + 1];
  if (valor && !valor.startsWith("--")) {
    args.set(chave.slice(2), valor);
    i += 1;
  }
}

const base = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const saida = args.get("saida") ?? "/tmp/aaa-state.json";

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  baseURL: base,
  viewport: { width: 1440, height: 900 },
  locale: "pt-BR",
});
const pagina = await contexto.newPage();

const creds = lerCreds();
await loginComoAdmin(pagina, creds);

// Prova de que a sessão vale: uma rota autenticada responde em /app.
await pagina.goto(`${base}/app`, { waitUntil: "domcontentloaded", timeout: 180_000 });
await pagina.waitForTimeout(1_500);
if (!pagina.url().includes("/app")) {
  console.error(`login não chegou em /app (parou em ${pagina.url()})`);
  process.exit(1);
}

const estado = await contexto.storageState();
writeFileSync(saida, JSON.stringify(estado, null, 2) + "\n");
await navegador.close();
console.log(`sessão salva em ${saida} (${estado.cookies.length} cookies)`);
