/**
 * VALOR ABSURDO E TABELA GRANDE — os dois extremos que o seed limpo esconde
 * (item 2.12).
 *
 * ─── O QUE SE MEDE ─────────────────────────────────────────────────────────
 *
 *   1. **Valor extremo**: um pedido de R$ 99.999.999,99 e outro de centavos
 *      (R$ 0,01) na lista, em 1440 e 320. O que se olha é o que o usuário vê:
 *      valor inteiro (sem corte), sem overflow horizontal e sem quebra que
 *      empurre a coluna de status;
 *   2. **Tabela grande**: 1.000 contatos a mais. Mede-se o tempo até a primeira
 *      linha e quantas linhas a tela carrega (a lista é paginada de 25 em 25 —
 *      carregar 1.000 de uma vez seria o defeito).
 *
 * Tudo é criado no banco de E2E e apagado no fim; `limpo` confere.
 *
 * Uso:
 *   node scripts/auditoria/valores-extremos-e-tabela-grande.mjs --estado /tmp/aaa-state.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const RAIZ = process.cwd();
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/aaa-state.json";
const ORG = "68fe016a-7312-4ee0-8417-2dd07a0ad659";
const DONO = "8db56fe1-162c-4202-a7eb-a274fef200a1";
const MARCA = "E2E Volume 1012";

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
      Prefer: init?.method === "POST" ? "return=representation" : "return=minimal",
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`PostgREST ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const texto = await r.text();
  return texto ? JSON.parse(texto) : [];
}

const resultado = { criados: { contatos: 0, pedidos: 0 }, medidas: [] };

// ── 1. Contatos em volume (1.000) ──────────────────────────────────────────
const lote = Array.from({ length: 1000 }, (_, i) => ({
  organization_id: ORG,
  name: `${MARCA} ${String(i).padStart(4, "0")}`,
  display_name: `${MARCA} ${String(i).padStart(4, "0")}`,
  phone_number: `+55119${String(80000000 + i)}`,
  source: "manual",
  created_by_user_id: DONO,
}));
try {
  // PostgREST aceita array no POST; 1.000 de uma vez evita 1.000 idas.
  const inseridos = await db("contacts", { method: "POST", body: JSON.stringify(lote) });
  resultado.criados.contatos = inseridos.length;
} catch (e) {
  resultado.erroAoInserirContatos = String(e).slice(0, 160);
}

// ── 2. Pedidos com valor extremo ───────────────────────────────────────────
const pedidos = [
  { numero: 1012, total: 9999999999, nome: "E2E Valor Extremo Alto" },
  { numero: 1013, total: 1, nome: "E2E Valor Extremo Baixo" },
];
try {
  const inseridos = await db("commercial_orders", {
    method: "POST",
    body: JSON.stringify(
      pedidos.map((p) => ({
        organization_id: ORG,
        numero: p.numero,
        cliente_nome: p.nome,
        status: "rascunho",
        origem: "vendedor",
        moeda: "BRL",
        subtotal_cents: p.total,
        total_cents: p.total,
        created_by: DONO,
      })),
    ),
  });
  resultado.criados.pedidos = inseridos.length;
} catch (e) {
  resultado.erroAoInserirPedidos = String(e).slice(0, 160);
}

const navegador = await chromium.launch();
try {
  for (const [nome, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["estreito", { width: 320, height: 720 }],
  ]) {
    const contexto = await navegador.newContext({ viewport, locale: "pt-BR", storageState: ESTADO });
    const pagina = await contexto.newPage();

    // Pedidos: valor extremo
    const t0 = Date.now();
    await pagina.goto(`${BASE}/app/pedidos`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await pagina.waitForTimeout(3000);
    const pedidosNaTela = await pagina.evaluate(() => {
      const texto = document.body.innerText;
      return {
        tempoAtePrimeiraPintura: Math.round(performance.now()),
        valorAltoVisivel: /99\.999\.999,99/.test(texto),
        valorBaixoVisivel: /0,01/.test(texto),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    // Contatos: volume medido SÓ em 1440. Em 320 a lista vira cartões (sem
    // `<table>`) e a espera por `tbody tr` estourava — a primeira versão
    // derrubou a rodada inteira e o `finally` ainda limpou o banco.
    if (nome !== "desktop") {
      resultado.medidas.push({ tela: nome, pedidos: { ...pedidosNaTela, msGoto: Date.now() - t0 } });
      console.log(
        `${nome.padEnd(9)} pedidos: alto=${pedidosNaTela.valorAltoVisivel} baixo=${pedidosNaTela.valorBaixoVisivel} overflow=${pedidosNaTela.overflow} · contatos: (medido em 1440)`,
      );
      await contexto.close();
      continue;
    }

    // Contatos: volume. O tempo é medido do goto até a PRIMEIRA LINHA — o
    // `performance.now()` de 3 s depois media o relógio da página, não a espera.
    const antesContatos = Date.now();
    await pagina.goto(`${BASE}/app/contacts`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await pagina.locator("table tbody tr").first().waitFor({ timeout: 60000 }).catch(() => undefined);
    const msAtePrimeiraLinha = Date.now() - antesContatos;
    await pagina.waitForTimeout(1500);
    const contatosNaTela = await pagina.evaluate(() => {
      const linhas = document.querySelectorAll("table tbody tr").length;
      const texto = document.body.innerText;
      return {
        linhasRenderizadas: linhas,
        totalDeclarado: texto.match(/(\d+)\s+clientes?/i)?.[1] ?? null,
        dizHaMais: /há mais resultados/i.test(texto),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    // Paginação: um clique em "Carregar mais" tem de dobrar, não carregar 1.000.
    const mais = pagina.getByRole("button", { name: /carregar mais/i }).first();
    let linhasDepoisDeMais = null;
    if ((await mais.count()) > 0) {
      await mais.click();
      await pagina.waitForTimeout(2500);
      linhasDepoisDeMais = await pagina.locator("table tbody tr").count();
    }
    contatosNaTela.msAtePrimeiraLinha = msAtePrimeiraLinha;
    contatosNaTela.linhasDepoisDeMais = linhasDepoisDeMais;

    resultado.medidas.push({ tela: nome, pedidos: { ...pedidosNaTela, msGoto: Date.now() - t0 }, contatos: contatosNaTela });
    console.log(
      `${nome.padEnd(9)} pedidos: alto=${pedidosNaTela.valorAltoVisivel} baixo=${pedidosNaTela.valorBaixoVisivel} overflow=${pedidosNaTela.overflow} · ` +
        `contatos: ${contatosNaTela.linhasRenderizadas} linhas em ${msAtePrimeiraLinha} ms (mais: ${contatosNaTela.linhasDepoisDeMais ?? "-"}), overflow=${contatosNaTela.overflow}`,
    );
    await contexto.close();
  }
} finally {
  await navegador.close();
  await db(`contacts?organization_id=eq.${ORG}&name=like.${encodeURIComponent(MARCA)}*`, { method: "DELETE" }).catch((e) => {
    resultado.erroAoLimparContatos = String(e).slice(0, 160);
  });
  await db(`commercial_orders?organization_id=eq.${ORG}&numero=in.(1012,1013)`, { method: "DELETE" }).catch((e) => {
    resultado.erroAoLimparPedidos = String(e).slice(0, 160);
  });
}

const sobrouContatos = await db(
  `contacts?organization_id=eq.${ORG}&name=like.${encodeURIComponent(MARCA)}*&select=id`,
).catch(() => []);
const sobrouPedidos = await db(
  `commercial_orders?organization_id=eq.${ORG}&numero=in.(1012,1013)&select=id`,
).catch(() => []);
resultado.limpo = sobrouContatos.length === 0 && sobrouPedidos.length === 0;

const arquivo = "docs/auditoria/capturas/valores-extremos-e-tabela-grande.json";
writeFileSync(arquivo, JSON.stringify({ base: BASE, medido_em: new Date().toISOString(), ...resultado }, null, 2) + "\n");
console.log(`\nlimpo=${resultado.limpo} · artefato: ${arquivo}`);
