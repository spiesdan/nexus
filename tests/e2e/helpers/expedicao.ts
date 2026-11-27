/**
 * Monta uma carga EM ROTA com um pedido separado — o ponto de partida das
 * specs de GPS, fila offline e cabine. Reusa os helpers de pedido e os passos
 * que a jornada 4 já prova; aqui o objetivo é só chegar na rota com dados reais.
 */
import { expect, type Page } from "@playwright/test";

import { rotuloDoPedido, semearContato, semearPedido, semearProduto } from "./pedidos";

export interface CargaEmRota {
  id: string;
  placa: string;
  numeroPedido: string;
}

/**
 * O FORMULÁRIO DE CARGA TEM TRÊS PASSOS — e a placa só existe no segundo.
 *
 * Medido no critical da main em 26/11/2026 (run 45919018146): as specs
 * pousavam em `/app/expedicao/nova`, viam a fila do passo 1 e tentavam
 * preencher `#placa` — que o componente só renderiza quando `passo === 2`
 * (`app/app/expedicao/nova/_client.tsx`). Resultado: 300 s de timeout no
 * MESMO seletor, em duas specs, sem nenhum defeito de produto.
 *
 * Esta função percorre o caminho do operador, pelos botões da própria tela:
 * passo 1 (pedidos, já marcados por quem chama) → "Continuar: equipe e
 * veículo" → passo 2 (placa/veículo/motorista) → "Continuar: revisão". O
 * passo 3 confirma, e quem chama clica em "Confirmar carga" — o rótulo leva a
 * contagem entre parênteses, de propósito.
 */
export async function preencherEquipeNaNovaCarga(
  page: Page,
  dados: { placa: string; veiculo?: string; motorista: string },
): Promise<void> {
  // 1 → 2. O botão só diz "equipe e veículo" quando há pedido marcado; se a
  // seleção sumir, este passo falha aqui — que é o lugar certo para falhar.
  await page.getByRole("button", { name: "Continuar: equipe e veículo" }).click();
  await expect(page.locator("#placa")).toBeVisible({ timeout: 20_000 });
  await page.locator("#placa").fill(dados.placa);
  await page.locator("#veiculo").fill(dados.veiculo ?? "HR");
  await page.locator("#motorista").fill(dados.motorista);

  // 2 → 3. A revisão é uma tela de verdade (não um toast): esperar o título
  // prova que o passo avançou antes de confirmar.
  await page.getByRole("button", { name: "Continuar: revisão" }).click();
  await expect(page.getByRole("heading", { name: "Revisão da carga" })).toBeVisible({
    timeout: 20_000,
  });
}

/**
 * CONTATO COM ENDEREÇO COMPLETO — a precondição que a prontidão da carga cobra.
 *
 * `semearPedido` não grava endereço e `semearContato` nasce sem nenhum. A
 * prontidão da montagem (`lib/expedicao/prontidao.ts`) bloqueia pedido sem
 * endereço — "N pedidos sem endereço — corrija antes de incluir" —, e o botão
 * "Confirmar carga" do passo 3 fica `disabled`. Medido em 26/11/2026: as specs
 * de jornada e de GPS passavam dos três passos e paravam ali, sem nenhum
 * defeito de produto.
 *
 * A regra é a mesma de `entrada-do-endereco.spec.ts`: cadastro estruturado
 * (`logradouro`…`uf`) via PATCH do contato, e o pedido nasce com `contact_id`.
 * O complemento leva o carimbo porque a memória de entrada do Nexus é chaveada
 * pelo endereço normalizado — sem ele, uma execução herda a marcação da
 * anterior.
 */
export async function semearContatoComEndereco(page: Page, nome: string): Promise<string> {
  const contactId = await semearContato(page, nome);
  const patch = await page.request.patch(`/api/v1/contacts/${contactId}`, {
    data: {
      logradouro: "Rua Marechal Deodoro",
      numero_end: "123",
      complemento: `Lote E2E ${Date.now()}`,
      bairro: "Centro",
      cidade: "Mafra",
      uf: "SC",
    },
  });
  expect(
    patch.status(),
    `não deu para gravar o endereço do contato "${nome}" — a prontidão da carga vai bloquear`,
  ).toBe(200);
  return contactId;
}

/**
 * PLACA VÁLIDA — a prontidão da carga reprova placa fora do formato Mercos.
 *
 * `ABC${sufixo}` com sufixo de 6 dígitos gerava "ABC123456", 9 caracteres, e
 * `lib/expedicao/prontidao.ts` bloqueava com "Placa inválida — use ABC1D23 ou
 * ABC1234". O "Confirmar carga" do passo 3 ficava `disabled` e as specs de GPS
 * morriam no timeout, sem defeito de produto. Formato do produto: 3 letras +
 * dígito + letra + 2 dígitos, único por carimbo para a base reaproveitada.
 */
export function placaDoCarimbo(carimbo: number): string {
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return `ABC${carimbo % 10}${letras[Math.floor(carimbo / 10) % 26]}${String(carimbo % 100).padStart(2, "0")}`;
}

export async function criarCargaEmRota(page: Page, prefixo: string): Promise<CargaEmRota> {
  const carimbo = Date.now();
  const sufixo = String(carimbo).slice(-6);
  const produtoId = await semearProduto(page, `Produto ${prefixo} ${sufixo}`);
  const cliente = `Cliente ${prefixo} ${sufixo}`;
  const contactId = await semearContatoComEndereco(page, cliente);
  const pedido = await semearPedido(page, cliente, { produtoId, contactId });
  const numeroPedido = rotuloDoPedido(pedido.numero);
  const placa = placaDoCarimbo(carimbo);

  await page.goto("/app/expedicao");
  await page.getByRole("link", { name: "Nova carga" }).click();
  await page.waitForURL(/\/app\/expedicao\/nova$/);
  await page.locator("label").filter({ hasText: numeroPedido }).getByRole("checkbox").check();
  await preencherEquipeNaNovaCarga(page, { placa, motorista: `Motorista ${sufixo}` });
  await page.getByRole("button", { name: /^Confirmar carga/ }).click();
  await page.waitForURL(/\/app\/expedicao\/[0-9a-f-]+$/, { timeout: 30_000 });
  const id = new URL(page.url()).pathname.split("/").pop();
  if (!id) throw new Error("carga criada sem id na URL");

  const separado = page.getByLabel(`Separado: ${numeroPedido}`);
  await separado.click();
  await expectSeparado(page, separado);
  // Publicar tem UM caminho: a ficha leva para /rota, e é `publicarRota` que
  // grava a ordem pendente antes de a rota sair.
  await page.getByRole("link", { name: "Revisar e publicar" }).click();
  await page.waitForURL(/\/app\/expedicao\/[0-9a-f-]+\/rota$/);
  await page.getByTestId("publicar-rota").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Publicar rota" }).click();
  await expect(page.getByText(/Em rota ·/)).toBeVisible({ timeout: 30_000 });

  return { id, placa, numeroPedido };
}

async function expectSeparado(page: Page, separado: ReturnType<Page["getByLabel"]>): Promise<void> {
  await separado.waitFor({ state: "visible" });
  for (let i = 0; i < 30; i += 1) {
    if (await separado.isChecked()) return;
    await page.waitForTimeout(500);
  }
  throw new Error("checkbox de separado não virou true após o PATCH");
}
