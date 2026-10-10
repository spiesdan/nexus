/**
 * Playwright DO SHELL OFFLINE — separado do config principal de propósito.
 *
 * O config principal (`playwright.config.ts`) serve o Next (`next start`) e
 * aponta o `baseURL` para lá. O shell é outro servidor (vite dev, que tem o
 * gancho `window.__offline` — o build de produção não tem) e outros testes
 * (`tests/e2e/mobile-*.spec.ts`). Misturar os dois num config só faria cada
 * run subir os dois servidores e rodar as duas suítes — e o shell não precisa
 * de banco, `.env.e2e` nem login.
 *
 * Roda com: `pnpm exec playwright test -c playwright.mobile.config.ts`
 */
import { defineConfig, devices } from "@playwright/test";

const PORTA = Number(process.env.MOBILE_E2E_PORT ?? 5173);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /mobile-.*\.spec\.ts/,
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    ...devices["Pixel 7"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm exec vite -c mobile/vite.config.ts --port ${PORTA} --strictPort --host 127.0.0.1`,
    port: PORTA,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
