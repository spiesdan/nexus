import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

/**
 * Módulo NF-e de entrada — prova de tela das 13 subtelas.
 *
 * O que esta spec prova: cada rota de `/app/fiscal/**` **abre com sessão real**
 * e renderiza o cabeçalho do seu assunto, com o banco do e2e por trás (não há
 * mock de tela). O que ela NÃO prova: comunicação com a SEFAZ — para isso é
 * preciso certificado A1 e CNPJ monitorado, que o e2e não tem (ver
 * `docs/specs/21-entrega-nfe-entrada.md`, §11).
 *
 * As capturas vão para `evidence/fiscal-entrada/` e são a evidência visual que
 * a doutrina de QA exige no lugar de `curl`.
 */

const TELAS = [
  { rota: "/app/fiscal", titulo: "Notas fiscais", arquivo: "01-visao-geral" },
  { rota: "/app/fiscal/notas", titulo: "Todas as notas", arquivo: "02-todas-as-notas" },
  {
    rota: "/app/fiscal/pendentes",
    titulo: "Pendentes de conferência",
    arquivo: "03-pendentes",
  },
  { rota: "/app/fiscal/xml", titulo: "XML recebidos", arquivo: "04-xml" },
  { rota: "/app/fiscal/resumos", titulo: "Resumos de notas", arquivo: "05-resumos" },
  {
    rota: "/app/fiscal/manifestacoes",
    titulo: "Manifestação do destinatário",
    arquivo: "06-manifestacoes",
  },
  {
    rota: "/app/fiscal/fornecedores",
    titulo: "Fornecedores das notas",
    arquivo: "07-fornecedores",
  },
  { rota: "/app/fiscal/produtos", titulo: "Produtos das notas", arquivo: "08-produtos" },
  {
    rota: "/app/fiscal/eventos",
    titulo: "Cancelamentos e eventos",
    arquivo: "09-eventos",
  },
  { rota: "/app/fiscal/relatorios", titulo: "Relatórios de entradas", arquivo: "10-relatorios" },
  {
    rota: "/app/fiscal/sincronizacoes",
    titulo: "Histórico de sincronização",
    arquivo: "11-sincronizacoes",
  },
  {
    rota: "/app/fiscal/configuracoes",
    titulo: "Configurações fiscais",
    arquivo: "12-configuracoes",
  },
] as const;

test.setTimeout(180_000);

test("as 12 subtelas do módulo fiscal abrem com sessão real", async ({ page }) => {
  await loginComoAdmin(page, lerCreds());

  for (const tela of TELAS) {
    await page.goto(tela.rota);
    await expect(
      page.getByRole("heading", { level: 1, name: tela.titulo }),
      `tela ${tela.rota} não renderizou o título "${tela.titulo}"`,
    ).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: `evidence/fiscal-entrada/${tela.arquivo}.png`,
      fullPage: true,
    });
  }
});

test("a porta do sidebar é /app/fiscal e a navegação lista as subtelas", async ({ page }) => {
  await loginComoAdmin(page, lerCreds());

  await page.goto("/app");
  const porta = page.getByRole("link", { name: /notas fiscais/i }).first();
  await expect(porta).toBeVisible({ timeout: 20_000 });
  await expect(porta).toHaveAttribute("href", "/app/fiscal");

  await page.goto("/app/fiscal");
  const nav = page.getByRole("navigation", { name: /notas fiscais|fiscal/i }).first();
  await expect(nav).toBeVisible({ timeout: 20_000 });
  for (const rotulo of [
    "Visão geral",
    "Todas as notas",
    "Pendentes",
    "Manifestação",
    "Relatórios",
    "Configurações",
  ]) {
    await expect(nav.getByRole("link", { name: new RegExp(rotulo, "i") }).first()).toBeVisible();
  }
  // A captura é do MENU interno, não da página inteira: a Visão Geral já é
  // fotografada em `01-visao-geral`, e repetir a mesma tela não prova nada
  // sobre a navegação. Aqui o que importa é ver as subtelas listadas.
  await nav.screenshot({
    path: "evidence/fiscal-entrada/13-navegacao-do-modulo.png",
  });
});

test("nota inexistente cai na tela de 404, não em erro de servidor", async ({ page }) => {
  await loginComoAdmin(page, lerCreds());

  await page.goto("/app/fiscal/notas/00000000-0000-0000-0000-000000000000");
  // O status HTTP é 200 porque a resposta já começou a streamar antes do
  // `notFound()`; o que importa para quem usa é a tela — e ela é a de 404, não
  // um 500 nem uma nota vazia.
  await expect(
    page.getByRole("heading", { level: 1, name: /404/ }),
  ).toBeVisible({ timeout: 20_000 });
  await page.screenshot({
    path: "evidence/fiscal-entrada/14-nota-inexistente-404.png",
    fullPage: true,
  });
});
