import { expect, test, type Page } from "@playwright/test";

import { lerCreds, loginComoDono, type CredsE2E } from "./helpers/login-admin";

test.setTimeout(600_000);
test.use({ locale: "pt-BR" });
test.describe.configure({ mode: "serial" });

const creds: CredsE2E = lerCreds();

/**
 * Fase 6b — auditoria de aceite §100 (checklist dos 11 itens) sobre TODAS as
 * rotas estáticas: tenant + admin + públicas/sistema. A régua é objetiva e
 * DOM-based (sem opinião):
 *  - navegação: tenant/admin têm `aside` + `nav` do shell;
 *  - tabelas: todo `<table>` em `main` carrega a assinatura de `ui/table`
 *    (`w-full caption-bottom text-sm`) — exceções impressão/galeria declaradas;
 *  - tipografia: família única no `body`;
 *  - cores: nenhum hex literal em `style` inline dentro de `main`
 *    (paleta por tokens; tema WhatsApp decidido vive em classes, não inline);
 *  - animações: nenhuma transição >400ms em elementos interativos (§16
 *    "nunca atrase o usuário");
 *  - glass: nenhum `backdrop-filter` dentro de `main` (a topbar sticky do §17
 *    usa blur por decisão e fica fora do escopo).
 */
const ROTAS_TENANT = [
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

const ROTAS_ADMIN = [
  "/admin", "/admin/audit", "/admin/dashboard", "/admin/google", "/admin/inbox",
  "/admin/incidents", "/admin/lgpd", "/admin/marca", "/admin/platform-admins",
  "/admin/tenants", "/admin/tenants/new", "/admin/usage", "/admin/users",
  "/admin/forbidden",
];

const ROTAS_PUBLICAS = [
  "/login", "/login/forgot", "/login/mfa", "/login/recovery", "/login/reset",
  "/signup", "/403", "/500", "/503", "/account-suspended", "/design",
  "/legal/privacy", "/legal/terms", "/onboarding", "/onboarding/welcome",
  "/onboarding/funil", "/onboarding/invite-team", "/onboarding/connect-whatsapp",
  "/onboarding/connect-nuvemshop", "/onboarding/setup-ai", "/onboarding/testar",
  "/onboarding/done", "/vitrine-agenda",
];

/** Exceções já declaradas no inventário §3 (visual de impressão / galeria). */
const TABELA_EXCULSA = new Set(["/app/pedidos/imprimir", "/design"]);

/**
 * O editor de cor da marca renderiza a cor ESCOLHIDA em style inline — ali o
 * hex é o dado, não um literal de estilo (medido em `_form.tsx`: o fundo do
 * seletor pinta `normalizarHex(hexLimpo)`).
 */
const COR_EXCULSA = new Set(["/app/settings/marca", "/admin/marca"]);

/**
 * `/admin/forbidden` fica de propósito fora do grupo `(protected)` (o
 * `admin/layout.tsx` documenta o redirect-loop com `requirePlatformAdmin`),
 * então renderiza a `StatusPage` sem o shell — decisão de arquitetura, não
 * lacuna de navegação.
 */
const NAV_EXCULSA = new Set(["/admin/forbidden"]);

async function medir(page: Page, rota: string, camada: "tenant" | "admin" | "publica") {
  await page.goto(rota);
  await page
    .locator("main, body")
    .first()
    .waitFor({ state: "visible", timeout: 8_000 })
    .catch(() => {});
  await page.waitForTimeout(250);

  const avaliar = () =>
    page.evaluate((lado: "tenant" | "admin" | "publica") => {
    const achados: string[] = [];
    const escopo = document.querySelector("main") ?? document.body;

    // navegação do shell (tenant = aside+nav do AppShell; admin = AdminShell)
    if (lado === "tenant" || lado === "admin") {
      const temAside = Boolean(document.querySelector("aside"));
      const temNav = Boolean(document.querySelector("aside nav, nav[aria-label]"));
      if (!temAside || !temNav) {
        achados.push(`navegacao: aside=${temAside} nav=${temNav}`);
      }
    }

    // tabelas com a assinatura de ui/table
    for (const t of escopo.querySelectorAll("table")) {
      const c = t.className?.toString() ?? "";
      if (!(c.includes("w-full") && c.includes("caption-bottom") && c.includes("text-sm"))) {
        achados.push(`tabela-crua: <table class="${c.slice(0, 70)}">`);
      }
    }

    // hex literal em style inline (cores por token, não por literais)
    for (const el of escopo.querySelectorAll<HTMLElement>("[style]")) {
      const s = el.getAttribute("style") ?? "";
      if (s.includes("#")) {
        achados.push(`cor-inline: ${el.tagName.toLowerCase()} style="${s.slice(0, 70)}"`);
      }
    }

    // animação que atrasa: transições >400ms no que o usuário toca
    const interativos = escopo.querySelectorAll(
      'button, a, [role="tab"], input, textarea, select, [role="button"], [role="menuitem"]',
    );
    for (const el of Array.from(interativos).slice(0, 400)) {
      const cs = getComputedStyle(el);
      const dur = Math.max(
        0,
        ...cs.transitionDuration.split(",").map((v) => parseFloat(v) || 0),
      );
      if (dur > 0.4) {
        achados.push(
          `transicao-lenta: ${Math.round(dur * 1000)}ms em ${el.tagName.toLowerCase()}.${(el.className?.toString() ?? "").slice(0, 50)}`,
        );
      }
    }

    // glass dentro do conteúdo (a topbar sticky do §17 usa blur por decisão
    // e mora fora de `main`; qualquer outro lugar é glassmorphism da §14)
    for (const el of escopo.querySelectorAll<HTMLElement>("*")) {
      const bd = getComputedStyle(el).backdropFilter;
      if (bd && bd !== "none") {
        achados.push(`glass: ${el.tagName.toLowerCase()}.${(el.className?.toString() ?? "").slice(0, 50)}`);
      }
    }

    const familia = getComputedStyle(document.body).fontFamily;
    // item 6 (estados) + item 1: rota que renderizou a página de erro do
    // produto não pode passar pela auditoria como se estivesse saudável —
    // o error boundary do Next mantém o shell e passaria nas checagens de
    // navegação/tabela
    const corpo = document.body.innerText;
    if (corpo.includes("Algo deu errado")) achados.push("estado-erro: Algo deu errado");
    if (/Erro ao (carregar|listar)/.test(corpo)) achados.push("estado-erro: Erro ao carregar/listar");

    // título da página (h1 canônico do NexusPageHeader; rotas sem h1 contam)
    const h1 = escopo.querySelector("h1");
    const h1px = h1 ? getComputedStyle(h1).fontSize : "sem-h1";
    return { achados, familia, h1px };
  }, camada);

  // rotas com redirect client-side (ex.: abas legadas) destroem o contexto do
  // evaluate no meio — 2 tentativas antes de propagar
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const r = await avaliar();
      if (r.h1px === "sem-h1") {
        // título pode entrar depois do hidratar (tela busca dado) — espera até
        // 5s para não confundir "carregando" com "sem título"
        await page.waitForSelector("main h1, main h2", { timeout: 5_000 }).catch(() => {});
        return await avaliar();
      }
      return r;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  return avaliar();
}

test("fase 6b — auditoria §100: varredura de todas as rotas estáticas em 1280", async ({ page }) => {
  await loginComoDono(page, creds);
  await page.setViewportSize({ width: 1280, height: 900 });

  const violacoes: string[] = [];
  const familias = new Set<string>();
  const h1s = new Map<string, string>(); // rota → tamanho do primeiro título
  const grupos: [string, "tenant" | "admin" | "publica"][] = [
    ...ROTAS_TENANT.map((r): [string, "tenant"] => [r, "tenant"]),
    ...ROTAS_ADMIN.map((r): [string, "admin"] => [r, "admin"]),
    ...ROTAS_PUBLICAS.map((r): [string, "publica"] => [r, "publica"]),
  ];

  for (const [rota, camada] of grupos) {
    const r = await medir(page, rota, camada);
    familias.add(r.familia);
    h1s.set(rota, r.h1px);
    for (const a of r.achados) {
      const excetoTabela = a.startsWith("tabela-crua") && TABELA_EXCULSA.has(rota);
      const excetoCor = a.startsWith("cor-inline") && COR_EXCULSA.has(rota);
      const excetoNav = a.startsWith("navegacao") && NAV_EXCULSA.has(rota);
      if (!excetoTabela && !excetoCor && !excetoNav) violacoes.push(`${rota} :: ${a}`);
    }
  }

  const porTamanho = new Map<string, string[]>();
  for (const [rota, px] of h1s) {
    porTamanho.set(px, [...(porTamanho.get(px) ?? []), rota]);
  }
  const relatorio = [
    `VIOLACOES(${violacoes.length}) de ${grupos.length} rotas:`,
    ...violacoes,
    `FAMILIAS(${familias.size}): ${[...familias].join(" | ")}`,
    ...[...porTamanho.entries()].map(
      ([px, rotas]) => `H1 ${px} (${rotas.length}): ${rotas.join(" ")}`,
    ),
  ].join("\n");

  expect(relatorio).toContain("VIOLACOES(0)");
  expect(familias.size, `famílias de fonte diferentes:\n${relatorio}`).toBe(1);
  // tipografia de título consistente: o NexusPageHeader é um só, então o
  // primeiro título renderizado cabe em poucos tamanhos (h1, título em h2
  // por `headingLevel`, rota sem título) — se o conjunto estourar, tem tela
  // com tipografia de título fora do padrão
  expect(porTamanho.size, `tamanhos de título espalhados:\n${relatorio}`).toBeLessThanOrEqual(3);
});

/**
 * Evidência do checklist §100 — um PNG por item medido em tela (itens 7
 * mobile = `evidence/fase6-mobile/` da spec de responsividade; 8 animações e
 * 10 espaçamento = a própria varredura acima: 0 transição lenta, 0 valor
 * arbitrário de espaçamento na fonte).
 */
test("fase 6b — evidência visual dos itens do checklist", async ({ page }) => {
  await loginComoDono(page, creds);
  await page.setViewportSize({ width: 1280, height: 900 });

  const telas: [string, string][] = [
    ["/app/meu-dia", "1-novo-design-meu-dia.png"],
    ["/app/settings/notifications", "2-tabela-canonica-notifications.png"],
    ["/app", "3-navegacao-shell.png"],
    ["/app/financeiro", "4-tabelas-financeiro.png"],
    ["/app/settings/tenant", "5-formularios-tenant.png"],
    ["/app/prospeccao", "6-estados-prospeccao.png"],
    ["/app/contacts", "7-tipografia-clientes.png"],
    ["/app/radar", "8-cores-radar.png"],
  ];

  for (const [rota, png] of telas) {
    await page.goto(rota);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
    await page
      .locator(".animate-pulse")
      .first()
      .waitFor({ state: "detached", timeout: 10_000 })
      .catch(() => {});
    await expect(page.getByText("Algo deu errado")).toHaveCount(0);
    await expect(page.getByText(/Erro ao (carregar|listar)/)).toHaveCount(0);
    await page.screenshot({ path: `evidence/fase6b-aceite/${png}` });
  }
});
