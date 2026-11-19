/**
 * J6 NA CAMADA DE NAVEGADOR — atender no inbox: sucesso, erro e recuperação.
 *
 * O que faltava da J6 não era rota nem componente: era a **tela** percorrendo os
 * três desfechos do envio de uma resposta. O que existe hoje prova escopo
 * (`inbox-scope`), atribuição (`queue-assign`), citação (dois `skip`) e o
 * fechamento por unidade (`inbox-fechar-pela-tela`). Nenhum deles abre o inbox,
 * responde, VÊ o envio falhar e recupera.
 *
 * ─── O que é real aqui ───────────────────────────────────────────────────────
 *
 * O app fala com um WAHA de verdade no fio (`helpers/waha-de-teste.ts`), na
 * porta que o `.env.e2e` já aponta. O stub implementa `sendText` e
 * `check-exists` e muda de humor em tempo de execução:
 *
 *   1. **sucesso** — envio aceito, a bolha sai sem "Falhou";
 *   2. **erro**    — transporte recusa (500), a bolha mostra "Falhou" + "Reenviar";
 *   3. **recuperação** — o transporte volta, "Reenviar" cria a mensagem nova e
 *      o histórico PRESERVA a tentativa que falhou (é o contrato do `BotaoReenviar`).
 *
 * A sessão do canal é posta em `WORKING` antes: o seed da fila a cria em
 * `STARTING`, e nesse estado o handler enfileira em vez de tentar enviar — o
 * teste mediria "queued" e chamaria de falha do produto.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";

import { portaDoWahaDoEnv, subirWahaDeTeste, type WahaDeTeste } from "./helpers/waha-de-teste";
import { execNpx } from "./utils/npx";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const EVIDENCE = path.join(process.cwd(), "evidence/jornadas-2026-11-19");

interface Creds {
  org_id: string;
  password: string;
  users: Record<string, { id: string; email: string; role: string }>;
  queue?: { conversation_id: string; contact_name: string };
}

const env = carregarEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let creds: Creds;
let waha: WahaDeTeste;

/** Login de `agent` sem MFA — o mesmo caminho de `inbox-scope`. */
async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app\//, { timeout: 60_000 });
}

test.describe("J6 — atender no inbox: sucesso, erro e recuperação", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async () => {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    execNpx(["tsx", "scripts/seed-e2e-queue.ts"], { stdio: "inherit" });
    creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
    if (!creds.queue) throw new Error("bloco `queue` ausente em .e2e-creds.json");

    // A conversa precisa estar ESPERANDO UMA PESSOA (o mesmo ajuste do
    // `queue-assign`) e o canal precisa estar CONECTADO — senão o envio é
    // enfileirado e não há desfecho para observar.
    const { error: erroConversa } = await admin
      .from("conversations")
      .update({ bot_silenced_until: "infinity" })
      .eq("id", creds.queue.conversation_id);
    if (erroConversa) throw new Error(`não consegui escalar a conversa: ${erroConversa.message}`);

    const { data: conversa } = await admin
      .from("conversations")
      .select("channel_session_id, contact_id")
      .eq("id", creds.queue.conversation_id)
      .single();
    if (!conversa?.channel_session_id) throw new Error("conversa do seed sem channel_session_id");

    // O contato do seed nasce só com `display_name`; sem telefone o handler
    // falha em `missing_phone_number` ANTES de tocar o transporte, e o teste
    // mediria outro caminho. O número é sintético — nenhum envio sai daqui.
    const { error: erroTelefone } = await admin
      .from("contacts")
      .update({ phone_number: "+5511999990001" })
      .eq("id", conversa.contact_id);
    if (erroTelefone) throw new Error(`não consegui dar telefone ao contato: ${erroTelefone.message}`);
    const { error: erroSessao } = await admin
      .from("channel_sessions")
      .update({ status: "WORKING", archived_at: null })
      .eq("id", conversa.channel_session_id);
    if (erroSessao) throw new Error(`não consegui conectar a sessão: ${erroSessao.message}`);

    // A conversa do seed não nasce com mensagens — o seed escreve só o estado da
    // fila. Limpar aqui torna a leitura determinística entre execuções: sem isso,
    // a segunda rodada veria as bolhas da primeira e a contagem de "Falhou"
    // mediria o histórico, não o desfecho desta rodada.
    const { error: erroLimpeza } = await admin
      .from("messages")
      .delete()
      .eq("conversation_id", creds.queue.conversation_id);
    if (erroLimpeza) throw new Error(`não consegui limpar a conversa: ${erroLimpeza.message}`);

    waha = await subirWahaDeTeste(portaDoWahaDoEnv());
  });

  test.afterAll(async () => {
    await waha?.fechar();
  });

  test("assumir, responder, falhar no transporte e recuperar pelo Reenviar", async ({ page }) => {
    const q = creds.queue!;
    const carimbo = Date.now();
    const textoOk = `Resposta pelo navegador — sucesso ${carimbo}`;
    const textoErro = `Resposta pelo navegador — erro ${carimbo}`;

    await login(page, creds.users.agent!.email);

    // ─── 1. A conversa está na Fila, e assumi-la é um clique ─────────────────
    await page.goto("/app/inbox?filter=unassigned");
    const naFila = page.getByRole("button").filter({ hasText: q.contact_name });
    await expect(naFila).toBeVisible({ timeout: 20_000 });
    await naFila.click();

    // A seleção é estado LOCAL do layout (não muda a URL — ver `InboxLayout`):
    // quem diz que a conversa certa abriu é o painel da direita.
    await expect(page.getByRole("button", { name: "Assumir" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Assumir" }).click();
    // O rótulo inverso é a prova de que a atribuição aconteceu no servidor e a
    // tela recarregou o comando: "Liberar" só existe em conversa minha.
    await expect(page.getByRole("button", { name: "Liberar" })).toBeVisible({ timeout: 20_000 });

    // ─── 2. SUCESSO: o transporte aceita e a bolha não mente ─────────────────
    const campo = page.getByRole("textbox", { name: "Mensagem", exact: true });
    await campo.fill(textoOk);
    await page.getByRole("button", { name: "Enviar" }).click();

    // A prova é do FIO, não da otimista: o stub registrou o texto enviado.
    await expect
      .poll(() => waha.enviados.some((e) => e.text.includes(textoOk)), { timeout: 20_000 })
      .toBe(true);
    await expect(page.getByText(textoOk, { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Falhou", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: path.join(EVIDENCE, "j6-01-envio-com-sucesso.png"), fullPage: true });

    // ─── 3. ERRO: o transporte recusa e a tela DIZ isso ──────────────────────
    waha.modo = "falha";
    await campo.fill(textoErro);
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page.getByText("Falhou", { exact: true })).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Reenviar mensagem" }).last()).toBeVisible();
    // A mensagem que falhou NÃO entrou no fio como enviada.
    expect(waha.enviados.filter((e) => e.text.includes(textoErro))).toHaveLength(0);
    await page.screenshot({ path: path.join(EVIDENCE, "j6-02-envio-falhou.png"), fullPage: true });

    // ─── 4. RECUPERAÇÃO: o transporte volta e o Reenviar resolve ─────────────
    waha.modo = "ok";
    await page.getByRole("button", { name: "Reenviar mensagem" }).last().click();

    await expect
      .poll(() => waha.enviados.some((e) => e.text.includes(textoErro)), { timeout: 25_000 })
      .toBe(true);
    await expect(page.getByText("Mensagem reenviada.")).toBeVisible({ timeout: 20_000 });
    // O histórico continua contando a tentativa que falhou: a linha nova é
    // OUTRA mensagem, não uma reescrita da antiga (contrato do `BotaoReenviar`).
    await expect(page.getByText(textoErro, { exact: false })).toHaveCount(2);
    await expect(page.getByText("Falhou", { exact: true })).toHaveCount(1);
    await page.screenshot({
      path: path.join(EVIDENCE, "j6-03-recuperado-pelo-reenviar.png"),
      fullPage: true,
    });

    // ─── 5. FECHAR: o ciclo termina e o cabeçalho muda de estado ─────────────
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    const dialogo = page.getByRole("alertdialog");
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();

    await expect(page.getByText("Fechada", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: path.join(EVIDENCE, "j6-04-conversa-fechada.png"),
      fullPage: true,
    });
  });
});
