/**
 * AS ROTAS QUE NÃO TINHAM DADO — fixture mínima, medida, apagada.
 *
 * ─── O QUE ESTAVA FALTANDO ────────────────────────────────────────────────
 *
 * Quatro rotas dinâmicas do inventário não podiam ser medidas porque as tabelas
 * estavam vazias nesta instalação: `ai_routers`, `lgpd_requests` (em duas rotas)
 * e `incidents`. Abrir `/[id]` sem id mede a tela de "não encontrado" — o erro
 * que o instrumento de rotas dinâmicas existe para evitar.
 *
 * A saída honesta é criar o mínimo que a tela precisa, medir e **apagar**. O
 * artefato diz que a medida foi feita com fixture — não com dado de operação —
 * porque quem lê precisa saber qual dos dois está vendo.
 *
 * Uso:
 *   node scripts/auditoria/rotas-com-fixture.mjs --estado /tmp/aaa-state.json
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
  if (!r.ok) throw new Error(`PostgREST ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const criados = [];
const rotas = [];

try {
  const [sessao] = await db("channel_sessions?select=id&limit=1");
  const [pedido] = await db(
    `commercial_orders?organization_id=eq.${ORG}&select=id&limit=1`,
  );

  // 1. ai_routers — precisa de uma sessão de canal existente.
  if (sessao?.id) {
    const [router] = await db("ai_routers", {
      method: "POST",
      body: JSON.stringify({
        organization_id: ORG,
        name: "Fixture de auditoria",
        channel_session_id: sessao.id,
      }),
    });
    criados.push({ tabela: "ai_routers", id: router.id });
    rotas.push(`/app/ai/routers/${router.id}`);
  }

  // 2. lgpd_requests — `completed` de propósito: nada processa um pedido já
  //    concluído, então a fixture não acorda worker.
  const [requisicao] = await db("lgpd_requests", {
    method: "POST",
    body: JSON.stringify({
      organization_id: ORG,
      request_type: "data_request",
      source: "manual",
      status: "completed",
      due_at: new Date(Date.now() + 86400000).toISOString(),
      request_payload: { fixture: "auditoria", order_id: pedido?.id ?? null },
      scope: "contact",
      completed_at: new Date().toISOString(),
    }),
  });
  criados.push({ tabela: "lgpd_requests", id: requisicao.id });
  rotas.push(`/app/lgpd/requests/${requisicao.id}`, `/admin/lgpd/requests/${requisicao.id}`);

  // 3. incidents — aberto, para a tela ter o que mostrar.
  const [incidente] = await db("incidents", {
    method: "POST",
    body: JSON.stringify({
      organization_id: ORG,
      type: "fixture_auditoria",
      severity: "warning",
      status: "open",
      payload: { fixture: "auditoria" },
    }),
  });
  criados.push({ tabela: "incidents", id: incidente.id });
  rotas.push(`/admin/incidents/${incidente.id}`);
} catch (e) {
  console.error("fixture falhou:", e instanceof Error ? e.message : e);
}

const navegador = await chromium.launch();
const medidas = [];

try {
  for (const rota of rotas) {
    for (const [nome, viewport] of [
      ["desktop", { width: 1440, height: 900 }],
      ["celular", { width: 390, height: 844 }],
    ]) {
      const contexto = await navegador.newContext({ viewport, locale: "pt-BR", storageState: ESTADO });
      const pagina = await contexto.newPage();
      const erros = [];
      pagina.on("console", (m) => {
        if (m.type() === "error") erros.push(m.text().slice(0, 120));
      });
      let status = 0;
      try {
        const resposta = await pagina.goto(`${BASE}${rota}`, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        status = resposta?.status() ?? 0;
        await pagina.waitForTimeout(2200);
      } catch (e) {
        erros.push(String(e).slice(0, 120));
      }
      const medida = await pagina.evaluate(() => ({
        overflowHorizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        h1: (document.querySelector("main h1")?.textContent ?? "").trim().slice(0, 60),
        naoEncontrado: /não encontrad|not found/i.test(document.body.innerText.slice(0, 2000)),
      }));
      medidas.push({ rota, largura: nome, status, ...medida, errosDeConsole: erros.slice(0, 3) });
      console.log(
        `${nome.padEnd(8)} ${rota.replace(/[0-9a-f-]{36}/, "{id}").padEnd(34)} ${status} overflow=${medida.overflowHorizontal} h1="${medida.h1}"`,
      );
      await contexto.close();
    }
  }
} finally {
  await navegador.close();
  for (const { tabela, id } of criados) {
    await db(`${tabela}?id=eq.${id}`, { method: "DELETE" }).catch((e) =>
      console.error(`falha ao apagar ${tabela}:`, String(e).slice(0, 120)),
    );
  }
}

const sobrou = [];
for (const { tabela, id } of criados) {
  const restante = await db(`${tabela}?id=eq.${id}&select=id`).catch(() => []);
  if (restante.length > 0) sobrou.push(`${tabela}:${id}`);
}

const arquivo = "docs/auditoria/capturas/rotas-com-fixture.json";
writeFileSync(
  arquivo,
  JSON.stringify(
    {
      base: BASE,
      medido_em: new Date().toISOString(),
      aviso:
        "Medido com FIXTURE criada por este instrumento e apagada no fim — não é dado de operação. `sobrou` lista o que não pôde ser apagado.",
      criados,
      medidas,
      sobrou,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nsobrou=${sobrou.length === 0 ? "nada" : sobrou.join(", ")} · artefato: ${arquivo}`);
