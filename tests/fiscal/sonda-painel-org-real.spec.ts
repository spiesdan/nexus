import { expect, test } from "@playwright/test";

/**
 * MEDIÇÃO NA ORGANIZAÇÃO REAL (640 produtos, 10.786 pedidos).
 *
 * A org de teste do e2e tem 13 produtos: qualquer coisa passa nela. Este
 * arquivo mede o que o dono viu — "leva vários segundos" — e só diz algo na org
 * de verdade.
 *
 * A sessão é montada por FORA: o token do GoTrue vai direto no cookie
 * `sb-deskcomm-auth` (nome canônico, de `lib/supabase/server.ts`). Digitar o
 * formulário foi descartado depois de medido — `pressSequentially` ENGOLE o `@`
 * do e-mail, e `fill` antes da hidratação não pega o estado do componente
 * controlado. As duas mediam o formulário, que não é a pergunta.
 *
 *   SONDA_ACCESS_TOKEN — access token de uma conta da org real.
 * Sem ele o teste pula dizendo o que falta: sem ele não mede nada, e fingir
 * que mediu seria pior.
 */
const TOKEN = process.env.SONDA_ACCESS_TOKEN ?? "";

/**
 * O valor do cookie no formato do `@supabase/ssr`: o JSON da sessão em base64,
 * prefixado com `base64-`. Acima de 3180 caracteres o SSR divide em pedaços
 * unidos por `.` — abaixo do limite nunca divide, que é o caso de um token.
 */
function valorDoCookie(session: unknown): string {
  const bruto = `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;
  const MAX = 3180;
  if (bruto.length <= MAX) return bruto;
  const pedaços: string[] = [];
  for (let i = 0; i < bruto.length; i += MAX) pedaços.push(bruto.slice(i, i + MAX));
  return pedaços.join(".");
}

test.setTimeout(300_000);

test("o painel na org real", async ({ page }) => {
  test.skip(!TOKEN, "defina SONDA_ACCESS_TOKEN com um token de conta da org real");

  const expiraEm = Math.floor(Date.now() / 1000) + 3600;
  await page.context().addCookies([
    {
      name: "sb-deskcomm-auth",
      value: valorDoCookie({
        access_token: TOKEN,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: expiraEm,
        refresh_token: process.env.SONDA_REFRESH_TOKEN ?? "",
        user: {},
      }),
      domain: "crm.billhigiene.tech",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    },
  ]);

  await page.goto("/app/inbox", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const autenticado = !/\/login/.test(page.url());
  console.log("autenticado:", autenticado, "| url:", page.url());
  expect(autenticado, "o cookie de sessão não foi aceito — token inválido?").toBe(true);

  // Aquecer: a pergunta é navegar entre telas, não a primeira pintura.
  await page.waitForTimeout(4000);
  const t0 = Date.now();
  const marcas: [number, string][] = [];
  const reg = (u: string, k: string) =>
    marcas.push([Date.now() - t0, `${k} ${u.replace(/^https?:\/\/[^/]+/, "").split("?")[0]}`]);
  page.on("request", (r) => reg(r.url(), "ini "));
  page.on("response", (r) => reg(r.url(), "FIM "));

  await page
    .getByRole("link", { name: /dashboard/i })
    .first()
    .click();
  const conteudo = await page
    .waitForFunction(() => /R\$\s?[\d.]/.test(document.body.innerText), { timeout: 60_000 })
    .then(() => Date.now() - t0)
    .catch(() => -1);

  console.log(`>>> PAINEL COM DADOS EM ${conteudo} ms`);
  for (const [ms, k] of marcas.filter(([, k]) => !k.includes("_next/static")).slice(0, 30)) {
    console.log(`  ${String(ms).padStart(6)} ms  ${k}`);
  }
  expect(conteudo, "o painel não mostrou número").toBeGreaterThan(0);
});
