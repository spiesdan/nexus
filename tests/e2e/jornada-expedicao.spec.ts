import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import {
  placaDoCarimbo,
  preencherEquipeNaNovaCarga,
  semearContatoComEndereco,
} from "./helpers/expedicao";
import { rotuloDoPedido, semearPedido, semearProduto } from "./helpers/pedidos";

test.setTimeout(300_000);

/**
 * Jornada 4 — Expedição (§86): pedido → carga → romaneio → rota → entrega.
 *
 * Mapeamento para a UI real (sem inventar tela):
 *
 * - **pedido**: semeado como `aprovado` — é o gatilho da fila "Aguardando
 *   embarque" de `/app/expedicao` (o POST da carga é quem avança o pedido
 *   para `expedido`);
 * - **carga**: botão "Nova carga" da lista abre a SUBTELA
 *   `/app/expedicao/nova` (placa/veículo/motorista + checkbox do pedido) →
 *   redirect para a ficha;
 * - **romaneio**: no produto é um PDF (`/api/v1/shipments/[id]/romaneio`),
 *   não uma página — o passo é provado pelo link "Romaneio e fechamento
 *   (PDF)" na ficha;
 * - **rota**: a ficha tem a subtela "/rota" ("Mapa da rota" + "Ordem de
 *   entrega"). Publicar só existe LÁ: o banner "Pronta para sair" leva para
 *   `/rota` ("Revisar e publicar"), e `publicarRota` grava a ordem e só então
 *   inicia — a ficha não chama `/rota/iniciar`. A régua "Faltam separar N
 *   pedidos" trava o passo até todos separados;
 * - **entrega**: botão "Entregue" por parada → card "Paradas concluídas"
 *   sobe para 1/1 → "Fechar a carga" aparece → status "Concluída".
 *
 * "Romaneio" como página não existe no produto (§86 atendido pelo PDF); rota,
 * fechamento e motorista SÃO subtelas da carga.
 */
test("jornada 4 (expedição) — pedido vira carga, sai para rota e é concluído", async ({ page }) => {
  const carimbo = Date.now();
  const cliente = `Cliente Jornada Expedicao ${carimbo}`;
  // Placa única por execução, no formato do produto. Era "ABC1D23" fixo, e a
  // segunda rodada numa base reaproveitada encontrava a carga da primeira
  // ainda aberta — o teste morria no meio, sem nenhum defeito de produto.
  const placa = placaDoCarimbo(carimbo);

  await loginComoAdmin(page, lerCreds());
  const produtoId = await semearProduto(page, `Produto Jornada Expedicao ${carimbo}`);
  // O endereço é precondição da montagem (prontidão), não do que esta jornada
  // mede: sem ele o "Confirmar carga" do passo 3 nasce desabilitado.
  const contactId = await semearContatoComEndereco(page, cliente);
  const pedido = await semearPedido(page, cliente, { produtoId, contactId });
  const numero = rotuloDoPedido(pedido.numero);

  // 1. A lista mostra a situação em números — o pedido em si vive na subtela.
  await page.goto("/app/expedicao");
  await expect(page.getByRole("heading", { level: 1, name: /^expedição$/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Aguardando embarque", { exact: true })).toBeVisible();

  // 2. Carga nova — o botão abre a subtela; a fila da lista não monta carga.
  await page.getByRole("link", { name: "Nova carga" }).click();
  await page.waitForURL(/\/app\/expedicao\/nova$/, { timeout: 20_000 });
  await expect(page.getByTestId(`carga-pedido-${pedido.numero}`)).toBeVisible({
    timeout: 20_000,
  });

  // O PEDIDO MARCADO no passo 1, e então os passos 2 e 3 como o operador faz:
  // a placa só existe no passo "Equipe" e a criação é confirmada na revisão.
  // Antes, esta spec preenchia `#placa` direto na fila — campo que o passo 1
  // não renderiza — e o critical gastava 300 s de timeout (run 45919018146).
  await page.locator("label").filter({ hasText: numero }).getByRole("checkbox").check();
  await preencherEquipeNaNovaCarga(page, { placa, motorista: `Motorista ${carimbo}` });
  // SEM `exact: true`, e isso não é tolerância — é a forma do rótulo.
  // O botão mostra o que está marcado: `Confirmar carga (1)`, `Confirmar carga
  // (3)`. Com `exact`, o teste só passaria no instante em que a seleção
  // estivesse vazia, que é o estado em que o botão não faz nada. Medido no CI
  // em 09/10/2026: 300 s de timeout esperando um nome que nunca aparece exato.
  await page.getByRole("button", { name: /^Confirmar carga/ }).click();

  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Carga criada" }).first();
  await expect(toast).toBeVisible({ timeout: 20_000 });
  await page.waitForURL(/\/app\/expedicao\/[0-9a-f-]+/, { timeout: 20_000 });

  // 3. Ficha da carga: número, status Montando e o romaneio como PDF.
  // O botão é SÓ romaneio: o fechamento saiu do papel e vive na tela da
  // carga. Se o nome voltar a dizer "fechamento", alguém vai procurar o
  // impresso que não existe mais.
  await expect(page.getByRole("heading", { level: 1, name: /^Carga \d{3}$/ })).toBeVisible();
  await expect(page.getByText(new RegExp(`Montando · ${placa}`))).toBeVisible();
  // O romaneio mora no menu "Mais ações": o cabeçalho promove só a próxima
  // ação. O Radix não monta o conteúdo de um menu fechado, então a spec abre o
  // menu como o operador — antes ela procurava um link que não existia no DOM
  // e o critical gastava 300 s. `menuitem`, não `link`: é o papel que o Radix
  // dá ao item mesmo quando o `asChild` clona o `<a href>` (mesmo padrão de
  // `imprimir-pedidos-mesma-aba.spec.ts`).
  await page.getByRole("button", { name: "Mais ações" }).click();
  const romaneio = page.getByRole("menuitem", { name: /^Romaneio \(PDF\)$/ });
  await expect(romaneio).toBeVisible();
  await expect(romaneio).toHaveAttribute("href", /\/api\/v1\/shipments\/.+\/romaneio/);
  // Menu aberto é overlay: fecha antes de clicar na parada, senão ele
  // intercepta o ponteiro do próximo passo.
  await page.keyboard.press("Escape");
  await expect(romaneio).toHaveCount(0);

  // 4. Rota: com 1 pedido não separado, publicar não é oferecido — a régua diz
  // quanto falta e a ação do banner é conferir a separação.
  // Escopo pelo banner: o título do passo aparece DUAS vezes na ficha (faixa
  // "Próxima ação" e a faixa "Próximo passo"), e um `getByText` solto casa nos
  // dois — foi a violação de strict mode da rodada 3.
  const proximaAcao = page.getByTestId("proxima-acao");
  await expect(proximaAcao).toContainText("Faltam separar 1 pedido");
  await expect(proximaAcao.getByRole("link", { name: "Revisar e publicar" })).toHaveCount(0);
  // Checkbox controlado: o `check()` do Playwright valida o estado logo após o
  // clique, mas ele só vira true quando o PATCH + recarregar voltam — por isso
  // `click` + `toBeChecked` com timeout.
  const separado = page.getByLabel(`Separado: ${numero}`);
  await separado.click();
  await expect(separado).toBeChecked({ timeout: 15_000 });
  const revisar = page.getByRole("link", { name: "Revisar e publicar" });
  await expect(revisar).toBeVisible({ timeout: 15_000 });

  // 5. Publicar SÓ pela tela de rota — ela salva a ordem e então inicia, com
  // confirmação (avisar os clientes não pode ser clique acidental).
  await revisar.click();
  await page.waitForURL(/\/app\/expedicao\/[0-9a-f-]+\/rota$/, { timeout: 20_000 });
  await page.getByTestId("publicar-rota").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Publicar rota" }).click();
  await expect(page.getByText(new RegExp(`Em rota · ${placa}`))).toBeVisible({ timeout: 20_000 });

  // 6. Entrega da parada → card "Paradas concluídas" 1/1 → "Fechar a carga".
  // O desfecho mora na ficha; a rota acabou de ser publicada.
  await page.goto(page.url().replace(/\/rota$/, ""));
  await expect(page.getByRole("heading", { level: 1, name: /^Carga \d{3}$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fechar a carga" })).toHaveCount(0);
  await page.getByRole("button", { name: "Entregue", exact: true }).click();
  // O design wave pede confirmação para avançar o pedido para 'entregue'.
  await page.getByRole("alertdialog").getByRole("button", { name: "Entregar" }).click();
  await expect(page.getByText("1/1", { exact: true })).toBeVisible({ timeout: 20_000 });
  const fechar = page.getByRole("button", { name: "Fechar a carga" });
  await expect(fechar).toBeVisible({ timeout: 20_000 });
  await fechar.click();
  await expect(page.getByText(new RegExp(`Concluída · ${placa}`))).toBeVisible({ timeout: 20_000 });
});
