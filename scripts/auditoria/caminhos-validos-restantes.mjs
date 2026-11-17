/**
 * OS DOIS CAMINHOS VÁLIDOS QUE NENHUMA SPEC COBRIA (item 2.8).
 *
 * ─── O QUE FALTAVA ─────────────────────────────────────────────────────────
 *
 * O inventário do 2.8 mostrou 34 arquivos com botão de envio e 32 cobertos por
 * alguma spec. Os dois sem caminho válido eram **renomear agent** e **criar
 * token de API** — e o segundo é o mais sensível da lista: é a única tela do
 * produto que mostra um segredo em texto puro (uma vez) e promete que ele não
 * volta.
 *
 * ─── COMO MEDIR SEM DEIXAR RASTRO ─────────────────────────────────────────
 *
 * Renomear: muda o nome, confere que mudou e **volta ao original**.
 * Token: cria, confere que o valor aparece uma única vez, e **revoga** em
 * seguida. O artefato registra `limpo` só se o token não existir mais e o agent
 * estiver com o nome de antes.
 *
 * Uso:
 *   node scripts/auditoria/caminhos-validos-restantes.mjs --estado /tmp/aaa-state.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const RAIZ = process.cwd();
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/aaa-state.json";
const ORG = "68fe016a-7312-4ee0-8417-2dd07a0ad659";

function env() {
  const bruto = readFileSync(path.join(RAIZ, ".env.e2e"), "utf8");
  const v = {};
  for (const linha of bruto.split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const i = limpa.indexOf("=");
    if (i > 0) v[limpa.slice(0, i)] = limpa.slice(i + 1).replace(/^["']|["']$/g, "");
  }
  return v;
}

const { NEXT_PUBLIC_SUPABASE_URL: BASE_DB, SUPABASE_SERVICE_ROLE_KEY: CHAVE } = env();
async function db(caminho, init) {
  const r = await fetch(`${BASE_DB}/rest/v1/${caminho}`, {
    ...init,
    headers: {
      apikey: CHAVE,
      Authorization: `Bearer ${CHAVE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`PostgREST ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

const [agent] = await db(`ai_agents?organization_id=eq.${ORG}&select=id,name&limit=1`);
const resultado = { agentOriginal: agent?.name, tokenCriado: false, agentRenomeado: false };

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", storageState: ESTADO });
const pagina = await contexto.newPage();

try {
  // ── 1. Renomear agent ────────────────────────────────────────────────────
  if (agent) {
    // O menu de ações vive no CARD da lista (`AgentCard` → `AgentRowMenu`), não
    // na ficha do agente. A primeira versão abria a ficha e esperava um menu
    // que não existe lá.
    await pagina.goto(`${BASE}/app/ai/agents`, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(3000);
    const menu = pagina.getByRole("button", { name: /menu de ações/i }).first();
    await menu.click({ timeout: 8000 });
    await pagina.getByRole("menuitem", { name: /renomear/i }).first().click({ timeout: 8000 });
    const campo = pagina.locator("#agent-name");
    await campo.fill("");
    await campo.pressSequentially("Agent auditoria AAA", { delay: 20 });
    const salvar = pagina.locator('[role="dialog"] button[type="submit"]').last();
    const rotuloDurante = await salvar.textContent();
    await salvar.click();
    // Espera o diálogo FECHAR — clicar e ler o banco 2 s depois pegava o nome
    // antes do PATCH assentar (a primeira medida dizia "não renomeou").
    await pagina.locator('[role="dialog"]').first().waitFor({ state: "hidden", timeout: 10000 }).catch(() => undefined);
    let depois = agent.name;
    for (let i = 0; i < 10; i++) {
      depois = (await db(`ai_agents?id=eq.${agent.id}&select=name`))[0]?.name;
      if (depois === "Agent auditoria AAA") break;
      await pagina.waitForTimeout(500);
    }
    const h1 = (await pagina.locator("h1").first().textContent())?.trim();
    resultado.renomear = { rotuloDurante: rotuloDurante?.trim(), nomeNoBanco: depois, h1, funcionou: depois === "Agent auditoria AAA" };
    // volta ao nome original
    await db(`ai_agents?id=eq.${agent.id}`, { method: "PATCH", body: JSON.stringify({ name: agent.name }) });
    const voltou = (await db(`ai_agents?id=eq.${agent.id}&select=name`))[0]?.name;
    resultado.agentRenomeado = voltou === agent.name;
  }

  // ── 2. Criar token de API ────────────────────────────────────────────────
  await pagina.goto(`${BASE}/app/settings/api-tokens`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(2500);
  await pagina.getByRole("button", { name: /novo token|criar token/i }).first().click({ timeout: 8000 });
  await pagina.locator("#t-name").fill("Token auditoria AAA");
  // O escopo é OBRIGATÓRIO: sem marcar um, o submit não envia e o diálogo fica
  // na mesma tela — a primeira rodada leu isso como "token criado" porque não
  // conferiu o banco.
  // Os escopos são BOTÕES com `aria-label`, não checkbox — a primeira versão
  // procurava `input[type=checkbox]`, não marcava nada e o formulário recusava
  // com "Selecione ao menos um escopo." (a mensagem estava na tela e a régua
  // não lia).
  const escopo = pagina.locator('[role="dialog"] button[aria-label^="contacts:read"]').first();
  if ((await escopo.count()) === 0) throw new Error("botão de escopo não encontrado");
  await escopo.click();
  const criar = pagina.locator('[role="dialog"] button[type="submit"]').last();
  const rotuloCriar = (await criar.textContent())?.trim();
  await criar.click();
  // O painel "Token criado" é outro diálogo: espera ele aparecer.
  await pagina.getByText(/token criado/i).first().waitFor({ timeout: 15000 }).catch(() => undefined);
  await pagina.waitForTimeout(1200);
  // O valor em texto puro aparece UMA vez, num bloco próprio.
  const texto = (await pagina.locator('[role="dialog"]').first().innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .slice(0, 400);
  const linhas = await db(`api_tokens?organization_id=eq.${ORG}&name=eq.Token%20auditoria%20AAA&select=id,name`);
  resultado.token = {
    rotuloDoBotao: rotuloCriar,
    // O token em texto puro é CREDENCIAL: o artefato guarda a prova de que ele
    // apareceu (o formato e a frase "não conseguiremos exibir novamente"), nunca
    // o valor. O token medido é revogado no fim desta mesma execução.
    dialogoDepois: texto.replace(/dsk_[A-Za-z0-9_-]+/g, "dsk_{token redigido}"),
    criadoNoBanco: linhas.length,
    valorUnicoVisivel: /[A-Za-z0-9_-]{24,}/.test(texto),
  };
  for (const t of linhas) await db(`api_tokens?id=eq.${t.id}`, { method: "DELETE" });
  const sobrou = await db(`api_tokens?organization_id=eq.${ORG}&name=eq.Token%20auditoria%20AAA&select=id`);
  resultado.tokenCriado = sobrou.length === 0;
} catch (e) {
  resultado.erro = e instanceof Error ? e.message.slice(0, 200) : String(e);
} finally {
  await navegador.close();
}

resultado.limpo = resultado.agentRenomeado === true && resultado.tokenCriado === true;
const arquivo = "docs/auditoria/capturas/caminhos-validos-restantes.json";
writeFileSync(arquivo, JSON.stringify({ base: BASE, medido_em: new Date().toISOString(), ...resultado }, null, 2) + "\n");
console.log(JSON.stringify(resultado, null, 1));
console.log(`\nlimpo=${resultado.limpo} · artefato: ${arquivo}`);
