/**
 * P1-28 — multi-campanha, retomada e follow-up de 48h.
 *
 * ─── O que é PROVA REAL aqui, e o que é BLOQUEIO DECLARADO ───────────────────
 *
 * REAL: o matching sem case/acento (caso `3a0909d6`) passa pela rota de prévia
 * com o banco de teste — `"posto de combustível"` casa `"Posto de combustível"`
 * gravado em `categoria_canonica`.
 *
 * BLOQUEIOS (test.fixme com motivo), E NÃO SUCESSO FINGIDO:
 *  - P1-28 entregou a MEMBRESIA no banco (0338) e as FUNÇÕES PURAS de retomada,
 *    mas ainda não há selo "já contatada em <campanha>" na tela, nem call site
 *    de `mensagemParaProspect` no disparo, nem tick que agende/envie os
 *    follow-ups da tabela 0339. Uma spec que "passasse" aqui estaria mentindo.
 *  - Onde a Meta entra (template aprovado, janela de 24h, 131047), não há WABA
 *    de teste. Não se simula sucesso de envio externo.
 *
 * Nenhuma mensagem real é disparada: o seed grava só estado de banco e as specs
 * que checariam envio ficam fixme.
 */
import { execNpx } from "./utils/npx";
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

const RAIZ = path.join(__dirname, "..", "..");
const SAIDA = path.join(RAIZ, ".e2e-multi-campanha.json");

interface Semente {
  org_id: string;
  prospect_id: string;
  matching_id: string;
  campanha_a: string;
  campanha_b: string;
}

function semente(): Semente {
  if (!fs.existsSync(SAIDA)) throw new Error("seed não escreveu .e2e-multi-campanha.json");
  return JSON.parse(fs.readFileSync(SAIDA, "utf8")) as Semente;
}

test.beforeAll(() => {
  execNpx(["tsx", "scripts/seed-e2e-multi-campanha.ts"], { stdio: "inherit", cwd: RAIZ });
});

test.setTimeout(180_000);

test("matching sem case/acento: 'posto de combustível' casa 'Posto de combustível'", async ({
  page,
}) => {
  await loginComoAdmin(page, lerCreds());
  const resposta = await page.request.post("/api/v1/prospecting/campaigns/preview", {
    data: {
      cidades: [{ cidade: "Itajaí", estado: "SC" }],
      categorias: ["posto de combustível"],
    },
  });
  expect(resposta.status(), `prévia recusada: ${await resposta.text()}`).toBe(200);
  const corpo = (await resposta.json()) as {
    data: { linhas: Array<{ id: string; nome: string; categoria: string | null }> };
  };
  const alvo = semente().matching_id;
  const linha = corpo.data.linhas.find((l) => l.id === alvo);
  expect(linha, "a empresa com categoria canônica capitalizada deve aparecer na prévia").toBeTruthy();
  expect(linha?.categoria).toBe("Posto de combustível");
});

test.fixme(
  "mesma empresa em duas campanhas: entra na nova com selo 'já contatada em' e não recebe o original de novo",
  async ({ page }) => {
    // BLOQUEIO DE IMPLEMENTAÇÃO: a 0338 removed a exclusividade no banco e o
    // seed coloca o mesmo prospect nas duas campanhas, mas a prévia ainda
    // exclui reservados (`idsReservadosPorOutras`) e a tela de controle ainda
    // não tem o selo "já contatada em <campanha>". Sem essas duas pontas, não
    // há superfície para provar o comportamento — e o envio real depende da
    // Meta (bloqueio abaixo).
    const dados = semente();
    await loginComoAdmin(page, lerCreds());
    await page.goto(`/app/prospeccao/campanhas/${dados.campanha_b}`);
    await expect(page.getByText(/já contatada em/i).first()).toBeVisible();
  },
);

test.fixme(
  "nunca contatada recebe o template Meta escolhido na campanha",
  async ({ page }) => {
    // BLOQUEIO DE SERVIÇO: `mensagemParaProspect` decide `template`, mas ainda
    // não há call site no disparo, e enviar exigiria WABA/template aprovado na
    // Meta. Não vou mockar o canal para fingir que a Meta aceitou.
    const dados = semente();
    await loginComoAdmin(page, lerCreds());
    await page.goto(`/app/prospeccao/campanhas/${dados.campanha_a}`);
    await expect(page.getByText(/e2e_primeiro_contato/)).toBeVisible();
  },
);

test.fixme(
  "já contatada recebe o texto de retomada do preset, nunca o template original",
  async ({ page }) => {
    // BLOQUEIO DE IMPLEMENTAÇÃO + SERVIÇO: o preset está no seed, a decisão
    // pura está em `lib/prospeccao/retomada.ts`, mas o disparo ainda não a chama
    // e o envio depende da Meta. Sem call site, não há nada para medir aqui.
    const dados = semente();
    await loginComoAdmin(page, lerCreds());
    await page.goto(`/app/prospeccao/campanhas/${dados.campanha_b}`);
    await expect(page.getByText("Texto de retomada vindo do preset do tenant")).toBeVisible();
  },
);

test.fixme(
  "follow-up 48h: sem resposta agenda e envia uma vez; resposta e opt-out cancelam",
  async ({ page }) => {
    // BLOQUEIO DE IMPLEMENTAÇÃO: a 0339 criou `prospecting_followups` (unique
    // por campanha/prospect) e `deveAgendarFollowup`/`agendarEm` são puras, mas
    // não existe tick/worker/rota que agende, envie ou cancele. O unique já é
    // provado em `tests/invariants/prospect-membresia-campanhas.test.ts`.
    const dados = semente();
    await loginComoAdmin(page, lerCreds());
    await page.goto(`/app/prospeccao/campanhas/${dados.campanha_a}`);
    await expect(page.getByText(/follow-up/i).first()).toBeVisible();
  },
);

test.fixme(
  "fora da janela de 24h sem template aprovado: bloqueia com 131047 visível, sem fingir envio",
  async ({ page }) => {
    // BLOQUEIO DE SERVIÇO: a janela depende de `last_inbound_at` do canal e a
    // recusa 131047 só acontece na Meta. Sem WABA de teste, qualquer "sucesso"
    // aqui seria um mock dizendo que a Meta aceitou o que ela recusaria.
    const dados = semente();
    await loginComoAdmin(page, lerCreds());
    await page.goto(`/app/prospeccao/campanhas/${dados.campanha_b}`);
    await expect(page.getByText(/131047|aguardando aprovação/i).first()).toBeVisible();
  },
);

test.fixme(
  "idempotência: rodar o tick duas vezes não duplica o follow-up",
  async ({ page }) => {
    // BLOQUEIO DE IMPLEMENTAÇÃO: não há tick executável. A garantia existe no
    // unique `(campaign_id, prospect_id)` da 0339 e é provada em test:db; uma
    // E2E que rodasse "duas vezes" um endpoint inexistente não provaria nada.
    const dados = semente();
    await loginComoAdmin(page, lerCreds());
    await page.goto(`/app/prospeccao/campanhas/${dados.campanha_a}`);
    await expect(page.getByText(/1 follow-up/)).toBeVisible();
  },
);
