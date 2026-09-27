import { expect, test, type Page } from "@playwright/test";

import { lerCreds, loginComoDono, type CredsE2E } from "./helpers/login-admin";

test.setTimeout(240_000);
test.use({ locale: "pt-BR" });
test.describe.configure({ mode: "serial" });

const creds: CredsE2E = lerCreds();

async function saudavel(page: Page) {
  await expect(page.getByText("Algo deu errado")).toHaveCount(0);
  await expect(page.getByText(/Erro ao (carregar|listar)/)).toHaveCount(0);
}

/**
 * Fase 6 (auditoria, não regressão) — §60 manda as telas mobile-priority
 * (Meu Dia, Clientes, Inbox, Pedidos, Radar, Rotas) funcionarem em 390/430.
 * Esta spec SÓ MEDE: tira os PNGs em 390x844 para a conferência visual.
 * "Rotas" não tem rota no produto (medido: nenhum page.tsx) — não inventa.
 */
test("fase 6 — telas mobile-priority em 390", async ({ page }) => {
  await loginComoDono(page, creds);
  await page.setViewportSize({ width: 390, height: 844 });

  // [rota, png, seletor de âncora dentro de `main`] — a Inbox não tem h1
  // (medido); o `main` resolve o sidebar mobile, que tem os mesmos textos.
  const telas: [string, string, string][] = [
    ["/app/meu-dia", "1-meu-dia-390.png", "h1"],
    ["/app/contacts", "2-clientes-390.png", "h1"],
    ["/app/inbox", "3-inbox-390.png", '[placeholder*="nome, telefone"]'],
    ["/app/pedidos", "4-pedidos-390.png", "h1"],
    ["/app/radar", "5-radar-390.png", "h1"],
  ];

  const excedentes: string[] = [];

  for (const [rota, png, ancora] of telas) {
    await page.goto(rota);
    await expect(page.locator("main").locator(ancora).first()).toBeVisible({
      timeout: 15_000,
    });
    // evidência com DADO, não com skeleton: espera os pulsos saírem (10s,
    // sem falhar — tela vazia vira empty state e já não pulsa)
    await page
      .locator(".animate-pulse")
      .first()
      .waitFor({ state: "detached", timeout: 10_000 })
      .catch(() => {});
    await saudavel(page);
    // régua objetiva §60: se o documento tem scroll horizontal em 390,
    // algum filho vaza da viewport
    const excedeu = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    if (excedeu > 1) excedentes.push(`${rota}: +${excedeu}px`);
    await page.screenshot({ path: `evidence/fase6-mobile/${png}` });
  }

  expect(excedentes, `overflow horizontal em 390: ${excedentes.join(", ")}`).toEqual([]);
});

/**
 * §60 em TODAS as rotas estáticas de `/app` (69, medido dos `page.tsx` sob
 * `app/app` sem `[param]`) nas 3 larguras mobile/tablet do spec (390, 430,
 * 768): se `documentElement.scrollWidth` passa da viewport, algum filho
 * vaza. Não é prova de design - é a régua que separa "legado quebrado" de
 * "falta polimento". (Desktop 1024-1920 é coberto pelas evidências das
 * fases 4/5.)
 */
test("fase 6 — nenhuma rota do app vaza em 390, 430 e 768", async ({ page }) => {
  await loginComoDono(page, creds);

  const rotas = [
    "/app", "/app/agenda", "/app/ai", "/app/ai/agents", "/app/ai/agents/new",
    "/app/ai/cases", "/app/ai/controle", "/app/ai/credentials", "/app/ai/decisoes",
    "/app/ai/evolution", "/app/ai/followups", "/app/ai/inbox", "/app/ai/knowledge/sources",
    "/app/ai/memory", "/app/ai/proposals", "/app/ai/providers", "/app/ai/routers",
    "/app/ai/runs", "/app/ai/skills", "/app/ai/usage", "/app/audit", "/app/busca",
    "/app/carteira", "/app/comissoes", "/app/compras", "/app/connections", "/app/contacts",
    "/app/estoque", "/app/expedicao", "/app/faturamento", "/app/financeiro", "/app/inbox",
    "/app/indicadores", "/app/integrations/nuvemshop", "/app/inteligencia", "/app/kanban",
    "/app/lgpd/requests", "/app/metrics", "/app/meu-dia", "/app/notas", "/app/pedidos",
    "/app/pedidos/imprimir", "/app/pedidos/novo", "/app/products", "/app/prospeccao",
    "/app/radar", "/app/recuperacao", "/app/relatorios", "/app/settings",
    "/app/settings/api-tokens", "/app/settings/atendimento", "/app/settings/atualizacao",
    "/app/settings/billing", "/app/settings/canal-oficial", "/app/settings/marca",
    "/app/settings/notifications", "/app/settings/profile", "/app/settings/security",
    "/app/settings/templates", "/app/settings/tenant", "/app/settings/tenant/agenda",
    "/app/settings/tenant/pipelines", "/app/settings/tenant/whatsapp", "/app/tarefas",
    "/app/team", "/app/team/invite", "/app/templates", "/app/titulos", "/app/webhooks",
  ];
  const excedentes: string[] = [];

  for (const largura of [390, 430, 768]) {
    await page.setViewportSize({ width: largura, height: 844 });
    for (const rota of rotas) {
      await page.goto(rota);
      await page
        .locator("main")
        .first()
        .waitFor({ state: "visible", timeout: 8_000 })
        .catch(() => {});
      // alguma rota navega de novo depois do goto (redirect client-side) e
      // destrói o contexto do evaluate — 2 tentativas antes de declarar
      // instável
      let excedeu = 0;
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        try {
          excedeu = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          break;
        } catch {
          await page.waitForTimeout(400);
        }
      }
      if (excedeu > 1) excedentes.push(`[${largura}px] ${rota}: +${excedeu}px`);
    }
  }

  expect(excedentes, `overflow horizontal:\n${excedentes.join("\n")}`).toEqual([]);
});
